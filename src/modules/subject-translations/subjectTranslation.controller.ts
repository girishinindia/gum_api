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

const CACHE_KEY = 'subject_translations:all';
const clearCache = async (subjectId?: number) => {
  await redis.del(CACHE_KEY);
  if (subjectId) await redis.del(`subject_translations:subject:${subjectId}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.subject_id === 'string') body.subject_id = parseInt(body.subject_id) || 0;
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id) || 0;
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'sort_order' });

  let q = supabase.from('subject_translations').select('*, subjects(code, slug), languages(name, native_name, iso_code)', { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,short_intro.ilike.%${search}%`);
  if (req.query.subject_id) q = q.eq('subject_id', parseInt(req.query.subject_id as string));
  if (req.query.language_id) q = q.eq('language_id', parseInt(req.query.language_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Soft-delete filter
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
  const { data, error: e } = await supabase.from('subject_translations').select('*, subjects(code, slug), languages(name, native_name, iso_code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Subject translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'subject_translation', 'activate')) {
    return err(res, 'Permission denied: subject_translation:activate required to create inactive', 403);
  }

  // Verify subject exists
  const { data: subj } = await supabase.from('subjects').select('id, code, slug').eq('id', body.subject_id).single();
  if (!subj) return err(res, 'Subject not found', 404);

  // Verify language exists and for_material = true
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  // Set audit field
  body.created_by = req.user!.id;

  let imageUrl: string | null = null;
  if (req.file) {
    const slug = (body.name || 'subj-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `subject-translations/${slug}-${Date.now()}.webp`;
    imageUrl = await processAndUploadImage(req.file.buffer, path, { width: 800, height: 800, quality: 85 });
    body.image = imageUrl;
  }

  const { data, error: e } = await supabase.from('subject_translations').insert(body).select('*, subjects(code, slug), languages(name, native_name, iso_code)').single();
  if (e) {
    if (imageUrl) { try { await deleteImage(extractBunnyPath(imageUrl), imageUrl); } catch {} }
    if (e.code === '23505') return err(res, 'Translation for this subject and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.subject_id);
  logAdmin({ actorId: req.user!.id, action: 'subject_translation_created', targetType: 'subject_translation', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (imageUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'subject_translation', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'subject_translation_image' } });
  return ok(res, data, 'Subject translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subject_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Subject translation not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'subject_translation', 'activate')) {
      return err(res, 'Permission denied: subject_translation:activate required to change active status', 403);
    }
  }

  // If changing subject, verify it exists
  if (updates.subject_id && updates.subject_id !== old.subject_id) {
    const { data: subj } = await supabase.from('subjects').select('id').eq('id', updates.subject_id).single();
    if (!subj) return err(res, 'Subject not found', 404);
  }

  // If changing language, verify it exists
  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  if (req.file) {
    const slug = (updates.name || old.name || 'subj-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `subject-translations/${slug}-${Date.now()}.webp`;
    updates.image = await processAndUploadImage(req.file.buffer, path, { width: 800, height: 800, quality: 85 });
    if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('subject_translations').update(updates).eq('id', id).select('*, subjects(code, slug), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this subject and language already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'image') {
      changes.image = { old: old.image || null, new: updates.image };
    } else if (k === 'updated_by') {
      // skip audit field from changes
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.subject_id);
  if (updates.subject_id && updates.subject_id !== old.subject_id) await clearCache(updates.subject_id);

  logAdmin({ actorId: req.user!.id, action: 'subject_translation_updated', targetType: 'subject_translation', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'subject_translation', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'subject_translation_image', old_url: old.image } });

  return ok(res, data, 'Subject translation updated');
}

// DELETE /subject-translations/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subject_translations').select('name, deleted_at, subject_id').eq('id', id).single();
  if (!old) return err(res, 'Subject translation not found', 404);
  if (old.deleted_at) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('subject_translations')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.subject_id);
  logAdmin({ actorId: req.user!.id, action: 'subject_translation_soft_deleted', targetType: 'subject_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Subject translation moved to trash');
}

// PATCH /subject-translations/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subject_translations').select('name, deleted_at, subject_id').eq('id', id).single();
  if (!old) return err(res, 'Subject translation not found', 404);
  if (!old.deleted_at) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('subject_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.subject_id);
  logAdmin({ actorId: req.user!.id, action: 'subject_translation_restored', targetType: 'subject_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Subject translation restored');
}

// GET /subject-translations/coverage -- per-subject language coverage stats
export async function coverage(req: Request, res: Response) {
  // Get all active languages that are for_material
  const { data: activeLangs, error: langErr } = await supabase
    .from('languages')
    .select('id, name, iso_code, native_name')
    .eq('is_active', true)
    .eq('for_material', true)
    .order('id');
  if (langErr) return err(res, langErr.message, 500);
  const totalLangs = activeLangs?.length || 0;

  // Get all active subjects
  const { data: subjects, error: subjErr } = await supabase
    .from('subjects')
    .select('id, code, slug')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('code');
  if (subjErr) return err(res, subjErr.message, 500);

  // Get all non-deleted translations grouped by subject
  const { data: translations, error: transErr } = await supabase
    .from('subject_translations')
    .select('subject_id, language_id')
    .is('deleted_at', null);
  if (transErr) return err(res, transErr.message, 500);

  // Build coverage map
  const transMap = new Map<number, Set<number>>();
  for (const t of (translations || [])) {
    if (!transMap.has(t.subject_id)) transMap.set(t.subject_id, new Set());
    transMap.get(t.subject_id)!.add(t.language_id);
  }

  const result = (subjects || []).map(subj => {
    const translatedLangIds = transMap.get(subj.id) || new Set();
    const missingLangs = (activeLangs || []).filter(l => !translatedLangIds.has(l.id));
    const translatedLangs = (activeLangs || []).filter(l => translatedLangIds.has(l.id));
    return {
      subject_id: subj.id,
      subject_code: subj.code,
      subject_slug: subj.slug,
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

// DELETE /subject-translations/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subject_translations').select('name, image, subject_id').eq('id', id).single();
  if (!old) return err(res, 'Subject translation not found', 404);

  // Clean up CDN image
  if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }

  const { error: e } = await supabase.from('subject_translations').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.subject_id);
  logAdmin({ actorId: req.user!.id, action: 'subject_translation_deleted', targetType: 'subject_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.image) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'subject_translation', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Subject translation permanently deleted');
}
