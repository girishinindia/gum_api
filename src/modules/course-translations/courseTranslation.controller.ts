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

const CACHE_KEY = 'course_translations:all';
const clearCache = async (courseId?: number) => {
  await redis.del(CACHE_KEY);
  if (courseId) await redis.del(`course_translations:course:${courseId}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['course_id', 'language_id', 'sort_order', 'video_duration_minutes']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // JSONB fields (parse from string if sent as JSON string via FormData)
  for (const k of ['tags', 'prerequisites', 'skills_gain', 'what_you_will_learn', 'course_includes', 'course_is_for', 'apply_for_designations', 'demand_in_countries', 'salary_standard', 'future_courses', 'structured_data']) {
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

  let q = supabase.from('course_translations').select('*, courses(code, slug, name), languages(name, native_name, iso_code)', { count: 'exact' });

  if (search) q = q.or(`title.ilike.%${search}%,short_intro.ilike.%${search}%,tagline.ilike.%${search}%`);
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));
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
  const { data, error: e } = await supabase.from('course_translations').select('*, courses(code, slug, name), languages(name, native_name, iso_code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'course_translation', 'activate')) {
    return err(res, 'Permission denied: course_translation:activate required to create inactive', 403);
  }

  // Verify course exists
  const { data: course } = await supabase.from('courses').select('id, code, slug').eq('id', body.course_id).single();
  if (!course) return err(res, 'Course not found', 404);

  // Verify language exists and for_material = true
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  // Set audit field
  body.created_by = req.user!.id;

  // Handle image uploads (5 image fields)
  const imageFields = ['web_thumbnail', 'web_banner', 'app_thumbnail', 'app_banner', 'video_thumbnail'] as const;
  const files = (req.files as { [field: string]: Express.Multer.File[] }) || {};
  const uploadedImages: Record<string, string> = {};

  for (const field of imageFields) {
    const fileKey = `${field}_file`;
    const fileArr = files[fileKey];
    if (fileArr && fileArr[0]) {
      const slug = (body.title || 'course-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const path = `course-translations/${slug}-${field}-${Date.now()}.webp`;
      const url = await processAndUploadImage(fileArr[0].buffer, path, { width: 800, height: 800, quality: 85 });
      body[field] = url;
      uploadedImages[field] = url;
    }
  }

  const { data, error: e } = await supabase.from('course_translations').insert(body).select('*, courses(code, slug, name), languages(name, native_name, iso_code)').single();
  if (e) {
    // Clean up uploaded images on failure
    for (const url of Object.values(uploadedImages)) {
      try { await deleteImage(extractBunnyPath(url), url); } catch {}
    }
    if (e.code === '23505') return err(res, 'Translation for this course and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_translation_created', targetType: 'course_translation', targetId: data.id, targetName: data.title, ip: getClientIp(req) });
  if (Object.keys(uploadedImages).length > 0) {
    logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'course_translation', resourceId: data.id, resourceName: data.title, ip: getClientIp(req), metadata: { type: 'course_translation_images', fields: Object.keys(uploadedImages) } });
  }
  return ok(res, data, 'Course translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Course translation not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'course_translation', 'activate')) {
      return err(res, 'Permission denied: course_translation:activate required to change active status', 403);
    }
  }

  // If changing course, verify it exists
  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  // If changing language, verify it exists
  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  // Handle image uploads (5 image fields)
  const imageFields = ['web_thumbnail', 'web_banner', 'app_thumbnail', 'app_banner', 'video_thumbnail'] as const;
  const files = (req.files as { [field: string]: Express.Multer.File[] }) || {};

  for (const field of imageFields) {
    const fileKey = `${field}_file`;
    const fileArr = files[fileKey];
    if (fileArr && fileArr[0]) {
      const slug = (updates.title || old.title || 'course-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const path = `course-translations/${slug}-${field}-${Date.now()}.webp`;
      updates[field] = await processAndUploadImage(fileArr[0].buffer, path, { width: 800, height: 800, quality: 85 });
      if ((old as any)[field]) { try { await deleteImage(extractBunnyPath((old as any)[field]), (old as any)[field]); } catch {} }
    }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('course_translations').update(updates).eq('id', id).select('*, courses(code, slug, name), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this course and language already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (imageFields.includes(k as any)) {
      changes[k] = { old: (old as any)[k] || null, new: updates[k] };
    } else if (k === 'updated_by') {
      // skip audit field from changes
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.course_id);
  if (updates.course_id && updates.course_id !== old.course_id) await clearCache(updates.course_id);

  logAdmin({ actorId: req.user!.id, action: 'course_translation_updated', targetType: 'course_translation', targetId: id, targetName: data.title, changes, ip: getClientIp(req) });

  return ok(res, data, 'Course translation updated');
}

// DELETE /course-translations/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_translations').select('title, deleted_at, course_id').eq('id', id).single();
  if (!old) return err(res, 'Course translation not found', 404);
  if (old.deleted_at) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('course_translations')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_translation_soft_deleted', targetType: 'course_translation', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Course translation moved to trash');
}

// PATCH /course-translations/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_translations').select('title, deleted_at, course_id').eq('id', id).single();
  if (!old) return err(res, 'Course translation not found', 404);
  if (!old.deleted_at) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('course_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_translation_restored', targetType: 'course_translation', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Course translation restored');
}

// GET /course-translations/coverage -- per-course language coverage stats
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

  // Get all active courses
  const { data: courses, error: courseErr } = await supabase
    .from('courses')
    .select('id, code, slug, name')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('code');
  if (courseErr) return err(res, courseErr.message, 500);

  // Get all non-deleted translations grouped by course
  const { data: translations, error: transErr } = await supabase
    .from('course_translations')
    .select('course_id, language_id')
    .is('deleted_at', null);
  if (transErr) return err(res, transErr.message, 500);

  // Build coverage map
  const transMap = new Map<number, Set<number>>();
  for (const t of (translations || [])) {
    if (!transMap.has(t.course_id)) transMap.set(t.course_id, new Set());
    transMap.get(t.course_id)!.add(t.language_id);
  }

  const result = (courses || []).map(course => {
    const translatedLangIds = transMap.get(course.id) || new Set();
    const missingLangs = (activeLangs || []).filter(l => !translatedLangIds.has(l.id));
    const translatedLangs = (activeLangs || []).filter(l => translatedLangIds.has(l.id));
    return {
      course_id: course.id,
      course_code: course.code,
      course_slug: course.slug,
      course_name: course.name,
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

// DELETE /course-translations/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_translations').select('title, web_thumbnail, web_banner, app_thumbnail, app_banner, video_thumbnail, course_id').eq('id', id).single();
  if (!old) return err(res, 'Course translation not found', 404);

  // Clean up CDN images
  const imageFields = ['web_thumbnail', 'web_banner', 'app_thumbnail', 'app_banner', 'video_thumbnail'] as const;
  for (const field of imageFields) {
    const url = (old as any)[field];
    if (url) { try { await deleteImage(extractBunnyPath(url), url); } catch {} }
  }

  const { error: e } = await supabase.from('course_translations').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_translation_deleted', targetType: 'course_translation', targetId: id, targetName: old.title, ip: getClientIp(req) });
  for (const field of imageFields) {
    if ((old as any)[field]) {
      logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'course_translation', resourceId: id, resourceName: old.title, ip: getClientIp(req) });
      break; // Log once for all images
    }
  }

  return ok(res, null, 'Course translation permanently deleted');
}
