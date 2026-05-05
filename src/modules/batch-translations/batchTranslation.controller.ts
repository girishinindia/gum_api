import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'batch_translations';
const PARENT_TABLE = 'course_batches';
const CACHE_KEY = 'batch_translations:all';

const clearCache = async (batchId?: number) => {
  await redis.del(CACHE_KEY);
  if (batchId) await redis.del(`batch_translations:batch:${batchId}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['batch_id', 'language_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Remove fields that don't exist in the batch_translations table
  const invalidFields = ['tags', 'structured_data', 'focus_keyword', 'og_title', 'og_description', 'twitter_title', 'twitter_description'];
  for (const k of invalidFields) { delete body[k]; }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  // Never allow writing search_vector directly
  delete body.search_vector;
  return body;
}

const FK_SELECT = `*, ${PARENT_TABLE}!batch_translations_batch_id_fkey(title, code, slug, course_id), languages(name, native_name, iso_code)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`title.ilike.%${search}%,short_description.ilike.%${search}%,description.ilike.%${search}%`);
  if (req.query.batch_id) q = q.eq('batch_id', parseInt(req.query.batch_id as string));
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
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Batch translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  if (body.is_active === false && !hasPermission(req, 'batch_translation', 'activate')) {
    return err(res, 'Permission denied: batch_translation:activate required to create inactive', 403);
  }

  // Verify parent exists
  const { data: batch } = await supabase.from(PARENT_TABLE).select('id, title, code').eq('id', body.batch_id).single();
  if (!batch) return err(res, 'Course batch not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, iso_code').eq('id', body.language_id).single();
  if (!lang) return err(res, 'Language not found', 404);

  // Handle thumbnail upload
  if (files?.thumbnail?.[0]) {
    const slug = batch.code || batch.title || 'batch';
    const thumbPath = `thumbnails/batches/${slug}/${lang.iso_code}-${Date.now()}.webp`;
    body.thumbnail_url = await processAndUploadImage(files.thumbnail[0].buffer, thumbPath, { width: 800, height: 450, quality: 85 });
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this batch + language', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.batch_id);
  logAdmin({ actorId: req.user!.id, action: 'batch_translation_created', targetType: 'batch_translation', targetId: data.id, targetName: `${batch.title || batch.code}/${lang.iso_code}`, ip: getClientIp(req) });
  return ok(res, data, 'Batch translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Batch translation not found', 404);

  const updates = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // Handle thumbnail upload — delete old first
  if (files?.thumbnail?.[0]) {
    if (old.thumbnail_url) {
      try { await deleteImage(extractBunnyPath(old.thumbnail_url)); } catch (_) {}
    }
    const { data: batch } = await supabase.from(PARENT_TABLE).select('title, code').eq('id', old.batch_id).single();
    const { data: lang } = await supabase.from('languages').select('iso_code').eq('id', old.language_id).single();
    const slug = batch?.code || batch?.title || 'batch';
    const thumbPath = `thumbnails/batches/${slug}/${lang?.iso_code || 'en'}-${Date.now()}.webp`;
    updates.thumbnail_url = await processAndUploadImage(files.thumbnail[0].buffer, thumbPath, { width: 800, height: 450, quality: 85 });
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).filter(k => k !== 'updated_by').length === 0 && !files?.thumbnail?.[0]) {
    return err(res, 'Nothing to update', 400);
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this batch + language', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.batch_id);
  logAdmin({ actorId: req.user!.id, action: 'batch_translation_updated', targetType: 'batch_translation', targetId: id, targetName: `batch:${old.batch_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Batch translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('batch_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Batch translation not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.batch_id);
  logAdmin({ actorId: req.user!.id, action: 'batch_translation_soft_deleted', targetType: 'batch_translation', targetId: id, targetName: old.title || `batch:${old.batch_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Batch translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('batch_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Batch translation not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.batch_id);
  logAdmin({ actorId: req.user!.id, action: 'batch_translation_restored', targetType: 'batch_translation', targetId: id, targetName: old.title || `batch:${old.batch_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Batch translation restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('batch_id, title, thumbnail_url').eq('id', id).single();
  if (!old) return err(res, 'Batch translation not found', 404);

  // Delete thumbnail from CDN on permanent delete
  if (old.thumbnail_url) {
    try { await deleteImage(extractBunnyPath(old.thumbnail_url)); } catch (_) {}
  }

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.batch_id);
  logAdmin({ actorId: req.user!.id, action: 'batch_translation_deleted', targetType: 'batch_translation', targetId: id, targetName: old.title || `batch:${old.batch_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Batch translation permanently deleted');
}

// Coverage endpoint — returns which languages have translations for a given batch
export async function coverage(req: Request, res: Response) {
  const batchId = req.query.batch_id ? parseInt(req.query.batch_id as string) : undefined;

  let q = supabase
    .from(TABLE)
    .select('id, batch_id, language_id, title, languages(name, iso_code)')
    .is('deleted_at', null);

  if (batchId) q = q.eq('batch_id', batchId);

  const { data, error: e } = await q;
  if (e) return err(res, e.message, 500);

  return ok(res, data || []);
}
