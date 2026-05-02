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

const CACHE_KEY = 'ow_question_translations:all';
const clearCache = async (questionId?: number) => {
  await redis.del(CACHE_KEY);
  if (questionId) await redis.del(`ow_question_translations:question:${questionId}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['one_word_question_id', 'language_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('one_word_question_translations').select('*, one_word_questions(code, slug), languages(name, native_name, iso_code)', { count: 'exact' });

  if (search) q = q.ilike('question_text', `%${search}%`);
  if (req.query.one_word_question_id) q = q.eq('one_word_question_id', parseInt(req.query.one_word_question_id as string));
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
  const { data, error: e } = await supabase.from('one_word_question_translations').select('*, one_word_questions(code, slug), languages(name, native_name, iso_code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'One word question translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'ow_question_translation', 'activate')) {
    return err(res, 'Permission denied: ow_question_translation:activate required to create inactive', 403);
  }

  // Verify question exists
  const { data: question } = await supabase.from('one_word_questions').select('id, code, slug').eq('id', body.one_word_question_id).single();
  if (!question) return err(res, 'One word question not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  body.created_by = req.user!.id;

  // Handle image uploads (image_1, image_2)
  const imageFields = ['image_1', 'image_2'] as const;
  const files = (req.files as { [field: string]: Express.Multer.File[] }) || {};
  const uploadedImages: Record<string, string> = {};

  for (const field of imageFields) {
    const fileKey = `${field}_file`;
    const fileArr = files[fileKey];
    if (fileArr && fileArr[0]) {
      const slug = (question.code || 'ow-q').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const path = `ow/${body.one_word_question_id}/translations/${slug}-${field}-${Date.now()}.webp`;
      const url = await processAndUploadImage(fileArr[0].buffer, path, { width: 800, height: 800, quality: 85 });
      body[field] = url;
      uploadedImages[field] = url;
    }
  }

  const { data, error: e } = await supabase.from('one_word_question_translations').insert(body).select('*, one_word_questions(code, slug), languages(name, native_name, iso_code)').single();
  if (e) {
    for (const url of Object.values(uploadedImages)) {
      try { await deleteImage(extractBunnyPath(url), url); } catch {}
    }
    if (e.code === '23505') return err(res, 'Translation for this question and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.one_word_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_question_translation_created', targetType: 'ow_question_translation', targetId: data.id, targetName: `Q${body.one_word_question_id}-${lang.iso_code}`, ip: getClientIp(req) });
  if (Object.keys(uploadedImages).length > 0) {
    logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'ow_question_translation', resourceId: data.id, resourceName: `Q${body.one_word_question_id}-${lang.iso_code}`, ip: getClientIp(req), metadata: { type: 'ow_question_images', fields: Object.keys(uploadedImages) } });
  }
  return ok(res, data, 'One word question translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('one_word_question_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'One word question translation not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'ow_question_translation', 'activate')) {
      return err(res, 'Permission denied: ow_question_translation:activate required to change active status', 403);
    }
  }

  if (updates.one_word_question_id && updates.one_word_question_id !== old.one_word_question_id) {
    const { data: question } = await supabase.from('one_word_questions').select('id').eq('id', updates.one_word_question_id).single();
    if (!question) return err(res, 'One word question not found', 404);
  }

  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
  }

  updates.updated_by = req.user!.id;

  // Handle image uploads
  const imageFields = ['image_1', 'image_2'] as const;
  const files = (req.files as { [field: string]: Express.Multer.File[] }) || {};

  for (const field of imageFields) {
    const fileKey = `${field}_file`;
    const fileArr = files[fileKey];
    if (fileArr && fileArr[0]) {
      const slug = ('ow-q').slice(0, 40);
      const path = `ow/${old.one_word_question_id}/translations/${slug}-${field}-${Date.now()}.webp`;
      updates[field] = await processAndUploadImage(fileArr[0].buffer, path, { width: 800, height: 800, quality: 85 });
      if ((old as any)[field]) { try { await deleteImage(extractBunnyPath((old as any)[field]), (old as any)[field]); } catch {} }
    }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('one_word_question_translations').update(updates).eq('id', id).select('*, one_word_questions(code, slug), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this question and language already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (imageFields.includes(k as any)) {
      changes[k] = { old: (old as any)[k] || null, new: updates[k] };
    } else if (k === 'updated_by') {
      // skip
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.one_word_question_id);
  if (updates.one_word_question_id && updates.one_word_question_id !== old.one_word_question_id) await clearCache(updates.one_word_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_question_translation_updated', targetType: 'ow_question_translation', targetId: id, targetName: `Q${old.one_word_question_id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'One word question translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('one_word_question_translations').select('one_word_question_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'One word question translation not found', 404);
  if (old.deleted_at) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('one_word_question_translations')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.one_word_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_question_translation_soft_deleted', targetType: 'ow_question_translation', targetId: id, targetName: `Q${old.one_word_question_id}`, ip: getClientIp(req) });
  return ok(res, data, 'One word question translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('one_word_question_translations').select('one_word_question_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'One word question translation not found', 404);
  if (!old.deleted_at) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('one_word_question_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.one_word_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_question_translation_restored', targetType: 'ow_question_translation', targetId: id, targetName: `Q${old.one_word_question_id}`, ip: getClientIp(req) });
  return ok(res, data, 'One word question translation restored');
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

  const { data: questions, error: qErr } = await supabase
    .from('one_word_questions')
    .select('id, code, slug')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('code');
  if (qErr) return err(res, qErr.message, 500);

  const { data: translations, error: transErr } = await supabase
    .from('one_word_question_translations')
    .select('one_word_question_id, language_id')
    .is('deleted_at', null);
  if (transErr) return err(res, transErr.message, 500);

  const transMap = new Map<number, Set<number>>();
  for (const t of (translations || [])) {
    if (!transMap.has(t.one_word_question_id)) transMap.set(t.one_word_question_id, new Set());
    transMap.get(t.one_word_question_id)!.add(t.language_id);
  }

  const result = (questions || []).map(q => {
    const translatedLangIds = transMap.get(q.id) || new Set();
    const missingLangs = (activeLangs || []).filter(l => !translatedLangIds.has(l.id));
    const translatedLangs = (activeLangs || []).filter(l => translatedLangIds.has(l.id));
    return {
      one_word_question_id: q.id,
      question_code: q.code,
      question_slug: q.slug,
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
  const { data: old } = await supabase.from('one_word_question_translations').select('one_word_question_id, image_1, image_2').eq('id', id).single();
  if (!old) return err(res, 'One word question translation not found', 404);

  // Clean up CDN images
  for (const field of ['image_1', 'image_2'] as const) {
    const url = (old as any)[field];
    if (url) { try { await deleteImage(extractBunnyPath(url), url); } catch {} }
  }

  const { error: e } = await supabase.from('one_word_question_translations').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.one_word_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_question_translation_deleted', targetType: 'ow_question_translation', targetId: id, targetName: `Q${old.one_word_question_id}`, ip: getClientIp(req) });
  return ok(res, null, 'One word question translation permanently deleted');
}
