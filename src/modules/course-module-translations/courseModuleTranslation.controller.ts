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

const CACHE_KEY = 'course_module_translations:all';
const clearCache = async (moduleId?: number) => {
  await redis.del(CACHE_KEY);
  if (moduleId) await redis.del(`course_module_translations:module:${moduleId}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['course_module_id', 'language_id', 'sort_order']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // JSONB fields
  for (const k of ['tags', 'structured_data']) {
    if (typeof body[k] === 'string') {
      try { body[k] = JSON.parse(body[k]); } catch { /* leave as-is */ }
    }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  // Never allow writing search_vector directly
  delete body.search_vector;
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'sort_order' });

  let q = supabase.from('course_module_translations').select('*, course_modules(slug, name, course_id, courses(code, slug, name)), languages(name, native_name, iso_code)', { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,short_intro.ilike.%${search}%`);
  if (req.query.course_module_id) q = q.eq('course_module_id', parseInt(req.query.course_module_id as string));
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
  const { data, error: e } = await supabase.from('course_module_translations').select('*, course_modules(slug, name, course_id, courses(code, slug, name)), languages(name, native_name, iso_code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course module translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'course_module_translation', 'activate')) {
    return err(res, 'Permission denied: course_module_translation:activate required to create inactive', 403);
  }

  // Verify module exists
  const { data: mod } = await supabase.from('course_modules').select('id, slug, name').eq('id', body.course_module_id).single();
  if (!mod) return err(res, 'Course module not found', 404);

  // Verify language exists and for_material = true
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  body.created_by = req.user!.id;

  // Handle image upload (1 image field)
  const files = (req.files as { [field: string]: Express.Multer.File[] }) || {};
  let uploadedImageUrl: string | null = null;

  const fileArr = files['image_file'];
  if (fileArr && fileArr[0]) {
    const slug = (body.name || 'module-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `course-module-translations/${slug}-image-${Date.now()}.webp`;
    const url = await processAndUploadImage(fileArr[0].buffer, path, { width: 800, height: 800, quality: 85 });
    body.image = url;
    uploadedImageUrl = url;
  }

  const { data, error: e } = await supabase.from('course_module_translations').insert(body).select('*, course_modules(slug, name, course_id, courses(code, slug, name)), languages(name, native_name, iso_code)').single();
  if (e) {
    // Clean up uploaded image on failure
    if (uploadedImageUrl) {
      try { await deleteImage(extractBunnyPath(uploadedImageUrl), uploadedImageUrl); } catch {}
    }
    if (e.code === '23505') return err(res, 'Translation for this module and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.course_module_id);
  logAdmin({ actorId: req.user!.id, action: 'course_module_translation_created', targetType: 'course_module_translation', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (uploadedImageUrl) {
    logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'course_module_translation', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'course_module_translation_image', fields: ['image'] } });
  }
  return ok(res, data, 'Course module translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_module_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Course module translation not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'course_module_translation', 'activate')) {
      return err(res, 'Permission denied: course_module_translation:activate required to change active status', 403);
    }
  }

  // If changing module, verify it exists
  if (updates.course_module_id && updates.course_module_id !== old.course_module_id) {
    const { data: mod } = await supabase.from('course_modules').select('id').eq('id', updates.course_module_id).single();
    if (!mod) return err(res, 'Course module not found', 404);
  }

  // If changing language, verify it exists
  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
  }

  updates.updated_by = req.user!.id;

  // Handle image upload
  const files = (req.files as { [field: string]: Express.Multer.File[] }) || {};
  const fileArr = files['image_file'];
  if (fileArr && fileArr[0]) {
    const slug = (updates.name || old.name || 'module-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `course-module-translations/${slug}-image-${Date.now()}.webp`;
    updates.image = await processAndUploadImage(fileArr[0].buffer, path, { width: 800, height: 800, quality: 85 });
    if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('course_module_translations').update(updates).eq('id', id).select('*, course_modules(slug, name, course_id, courses(code, slug, name)), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this module and language already exists', 409);
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

  await clearCache(old.course_module_id);
  if (updates.course_module_id && updates.course_module_id !== old.course_module_id) await clearCache(updates.course_module_id);

  logAdmin({ actorId: req.user!.id, action: 'course_module_translation_updated', targetType: 'course_module_translation', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Course module translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_module_translations').select('name, deleted_at, course_module_id').eq('id', id).single();
  if (!old) return err(res, 'Course module translation not found', 404);
  if (old.deleted_at) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('course_module_translations')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_module_id);
  logAdmin({ actorId: req.user!.id, action: 'course_module_translation_soft_deleted', targetType: 'course_module_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Course module translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_module_translations').select('name, deleted_at, course_module_id').eq('id', id).single();
  if (!old) return err(res, 'Course module translation not found', 404);
  if (!old.deleted_at) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('course_module_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_module_id);
  logAdmin({ actorId: req.user!.id, action: 'course_module_translation_restored', targetType: 'course_module_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Course module translation restored');
}

// GET /course-module-translations/coverage
export async function coverage(req: Request, res: Response) {
  const { data: activeLangs, error: langErr } = await supabase
    .from('languages')
    .select('id, name, iso_code, native_name')
    .eq('is_active', true)
    .eq('for_material', true)
    .order('id');
  if (langErr) return err(res, langErr.message, 500);
  const totalLangs = activeLangs?.length || 0;

  const { data: modules, error: modErr } = await supabase
    .from('course_modules')
    .select('id, slug, name, course_id')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('display_order');
  if (modErr) return err(res, modErr.message, 500);

  const { data: translations, error: transErr } = await supabase
    .from('course_module_translations')
    .select('course_module_id, language_id')
    .is('deleted_at', null);
  if (transErr) return err(res, transErr.message, 500);

  const transMap = new Map<number, Set<number>>();
  for (const t of (translations || [])) {
    if (!transMap.has(t.course_module_id)) transMap.set(t.course_module_id, new Set());
    transMap.get(t.course_module_id)!.add(t.language_id);
  }

  const result = (modules || []).map(mod => {
    const translatedLangIds = transMap.get(mod.id) || new Set();
    const missingLangs = (activeLangs || []).filter(l => !translatedLangIds.has(l.id));
    const translatedLangs = (activeLangs || []).filter(l => translatedLangIds.has(l.id));
    return {
      course_module_id: mod.id,
      module_slug: mod.slug,
      module_name: mod.name,
      course_id: mod.course_id,
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

// DELETE /course-module-translations/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_module_translations').select('name, image, course_module_id').eq('id', id).single();
  if (!old) return err(res, 'Course module translation not found', 404);

  // Clean up CDN image
  if (old.image) {
    try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {}
  }

  const { error: e } = await supabase.from('course_module_translations').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.course_module_id);
  logAdmin({ actorId: req.user!.id, action: 'course_module_translation_deleted', targetType: 'course_module_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.image) {
    logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'course_module_translation', resourceId: id, resourceName: old.name, ip: getClientIp(req) });
  }

  return ok(res, null, 'Course module translation permanently deleted');
}
