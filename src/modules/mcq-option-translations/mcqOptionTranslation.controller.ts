import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'mcq_option_translations:all';
const clearCache = async (optionId?: number) => {
  await redis.del(CACHE_KEY);
  if (optionId) await redis.del(`mcq_option_translations:option:${optionId}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['mcq_option_id', 'language_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('mcq_option_translations').select('*, mcq_options(mcq_question_id, is_correct, display_order), languages(name, native_name, iso_code)', { count: 'exact' });

  if (search) q = q.ilike('option_text', `%${search}%`);
  if (req.query.mcq_option_id) q = q.eq('mcq_option_id', parseInt(req.query.mcq_option_id as string));
  if (req.query.language_id) q = q.eq('language_id', parseInt(req.query.language_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('mcq_option_translations').select('*, mcq_options(mcq_question_id, is_correct, display_order), languages(name, native_name, iso_code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'MCQ option translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'mcq_option_translation', 'activate')) {
    return err(res, 'Permission denied: mcq_option_translation:activate required to create inactive', 403);
  }

  // Verify option exists
  const { data: option } = await supabase.from('mcq_options').select('id, mcq_question_id').eq('id', body.mcq_option_id).single();
  if (!option) return err(res, 'MCQ option not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  body.created_by = req.user!.id;

  // Handle single image upload
  const files = (req.files as { [field: string]: Express.Multer.File[] }) || {};
  const fileArr = files['image_file'];
  let uploadedImage: string | null = null;
  if (fileArr && fileArr[0]) {
    const path = `mcq/${option.mcq_question_id}/options/${body.mcq_option_id}/image-${Date.now()}.webp`;
    const url = await processAndUploadImage(fileArr[0].buffer, path, { width: 800, height: 800, quality: 85 });
    body.image = url;
    uploadedImage = url;
  }

  const { data, error: e } = await supabase.from('mcq_option_translations').insert(body).select('*, mcq_options(mcq_question_id, is_correct, display_order), languages(name, native_name, iso_code)').single();
  if (e) {
    if (uploadedImage) { try { await deleteImage(extractBunnyPath(uploadedImage), uploadedImage); } catch {} }
    if (e.code === '23505') return err(res, 'Translation for this option and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.mcq_option_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_option_translation_created', targetType: 'mcq_option_translation', targetId: data.id, targetName: `Opt${body.mcq_option_id}-${lang.iso_code}`, ip: getClientIp(req) });
  if (uploadedImage) {
    logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'mcq_option_translation', resourceId: data.id, resourceName: `Opt${body.mcq_option_id}-${lang.iso_code}`, ip: getClientIp(req), metadata: { type: 'mcq_option_image' } });
  }
  return ok(res, data, 'MCQ option translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_option_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'MCQ option translation not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'mcq_option_translation', 'activate')) {
      return err(res, 'Permission denied: mcq_option_translation:activate required to change active status', 403);
    }
  }

  if (updates.mcq_option_id && updates.mcq_option_id !== old.mcq_option_id) {
    const { data: option } = await supabase.from('mcq_options').select('id').eq('id', updates.mcq_option_id).single();
    if (!option) return err(res, 'MCQ option not found', 404);
  }

  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
  }

  updates.updated_by = req.user!.id;

  // Handle image upload
  const files = (req.files as { [field: string]: Express.Multer.File[] }) || {};
  const fileArr = files['image_file'];
  if (fileArr && fileArr[0]) {
    // Get parent question id for path
    const { data: option } = await supabase.from('mcq_options').select('mcq_question_id').eq('id', old.mcq_option_id).single();
    const qId = option?.mcq_question_id || 0;
    const path = `mcq/${qId}/options/${old.mcq_option_id}/image-${Date.now()}.webp`;
    updates.image = await processAndUploadImage(fileArr[0].buffer, path, { width: 800, height: 800, quality: 85 });
    if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('mcq_option_translations').update(updates).eq('id', id).select('*, mcq_options(mcq_question_id, is_correct, display_order), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this option and language already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'image') {
      changes[k] = { old: old.image || null, new: updates[k] };
    } else if (k === 'updated_by') {
      // skip
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.mcq_option_id);
  if (updates.mcq_option_id && updates.mcq_option_id !== old.mcq_option_id) await clearCache(updates.mcq_option_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_option_translation_updated', targetType: 'mcq_option_translation', targetId: id, targetName: `Opt${old.mcq_option_id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'MCQ option translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_option_translations').select('mcq_option_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'MCQ option translation not found', 404);
  if (old.deleted_at) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('mcq_option_translations')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.mcq_option_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_option_translation_soft_deleted', targetType: 'mcq_option_translation', targetId: id, targetName: `Opt${old.mcq_option_id}`, ip: getClientIp(req) });
  return ok(res, data, 'MCQ option translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_option_translations').select('mcq_option_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'MCQ option translation not found', 404);
  if (!old.deleted_at) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('mcq_option_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.mcq_option_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_option_translation_restored', targetType: 'mcq_option_translation', targetId: id, targetName: `Opt${old.mcq_option_id}`, ip: getClientIp(req) });
  return ok(res, data, 'MCQ option translation restored');
}

export async function coverage(req: Request, res: Response) {
  const { data: activeLangs, error: langErr } = await supabase
    .from('languages')
    .select('id, name, iso_code, native_name')
    .eq('is_active', true)
    .eq('for_material', true)
    .order('id');
  if (langErr) return err(res, langErr.message, 500);
  const totalLangs = activeLangs?.length || 0;

  const { data: options, error: oErr } = await supabase
    .from('mcq_options')
    .select('id, mcq_question_id')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('id');
  if (oErr) return err(res, oErr.message, 500);

  const { data: translations, error: transErr } = await supabase
    .from('mcq_option_translations')
    .select('mcq_option_id, language_id')
    .is('deleted_at', null);
  if (transErr) return err(res, transErr.message, 500);

  const transMap = new Map<number, Set<number>>();
  for (const t of (translations || [])) {
    if (!transMap.has(t.mcq_option_id)) transMap.set(t.mcq_option_id, new Set());
    transMap.get(t.mcq_option_id)!.add(t.language_id);
  }

  const result = (options || []).map(o => {
    const translatedLangIds = transMap.get(o.id) || new Set();
    const missingLangs = (activeLangs || []).filter(l => !translatedLangIds.has(l.id));
    const translatedLangs = (activeLangs || []).filter(l => translatedLangIds.has(l.id));
    return {
      mcq_option_id: o.id,
      mcq_question_id: o.mcq_question_id,
      total_languages: totalLangs,
      translated_count: translatedLangs.length,
      missing_count: missingLangs.length,
      is_complete: missingLangs.length === 0,
      translated_languages: translatedLangs.map(l => ({ id: l.id, name: l.name, iso_code: l.iso_code })),
      missing_languages: missingLangs.map(l => ({ id: l.id, name: l.name, iso_code: l.iso_code, native_name: l.native_name })),
    };
  });

  return ok(res, result, 'Coverage retrieved');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_option_translations').select('mcq_option_id, image').eq('id', id).single();
  if (!old) return err(res, 'MCQ option translation not found', 404);

  // Clean up CDN image
  if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }

  const { error: e } = await supabase.from('mcq_option_translations').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.mcq_option_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_option_translation_deleted', targetType: 'mcq_option_translation', targetId: id, targetName: `Opt${old.mcq_option_id}`, ip: getClientIp(req) });
  return ok(res, null, 'MCQ option translation permanently deleted');
}
