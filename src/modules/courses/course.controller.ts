import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { deleteImage } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

const CACHE_KEY = 'courses:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  for (const k of ['is_active', 'is_free', 'is_new', 'is_featured', 'is_bestseller', 'has_placement_assistance', 'has_certificate']) {
    if (typeof body[k] === 'string') body[k] = body[k] === 'true';
  }
  // Integer fields
  for (const k of ['max_students', 'refund_days', 'enrollment_count', 'rating_count', 'view_count', 'total_lessons', 'total_assignments', 'total_projects', 'instructor_id', 'course_language_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Numeric fields
  for (const k of ['price', 'original_price', 'discount_percentage', 'duration_hours', 'rating_average']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseFloat(body[k]) || null : null;
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('courses').select('*', { count: 'exact' });

  if (search) q = q.or(`code.ilike.%${search}%,slug.ilike.%${search}%,name.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  if (req.query.difficulty_level) q = q.eq('difficulty_level', req.query.difficulty_level as string);
  if (req.query.course_status) q = q.eq('course_status', req.query.course_status as string);
  if (req.query.is_free === 'true') q = q.eq('is_free', true);
  if (req.query.is_featured === 'true') q = q.eq('is_featured', true);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation titles
  const courseIds = (data || []).map((c: any) => c.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishTitleMap: Record<number, string> = {};
  if (courseIds.length > 0) {
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (enLang) {
      let enQ = supabase.from('course_translations').select('course_id, title').in('course_id', courseIds).eq('language_id', enLang.id);
      if (!isTrash) enQ = enQ.is('deleted_at', null);
      const { data: enTranslations } = await enQ;
      if (enTranslations) {
        for (const t of enTranslations) englishTitleMap[t.course_id] = t.title;
      }
    }
  }

  // Fetch instructor names
  const instructorIds = [...new Set((data || []).filter((c: any) => c.instructor_id).map((c: any) => c.instructor_id))];
  let instructorMap: Record<number, string> = {};
  if (instructorIds.length > 0) {
    const { data: instructors } = await supabase.from('users').select('id, full_name').in('id', instructorIds);
    if (instructors) {
      for (const i of instructors) instructorMap[i.id] = i.full_name;
    }
  }

  // Fetch language names
  const langIds = [...new Set((data || []).filter((c: any) => c.course_language_id).map((c: any) => c.course_language_id))];
  let langMap: Record<number, string> = {};
  if (langIds.length > 0) {
    const { data: langs } = await supabase.from('languages').select('id, name').in('id', langIds);
    if (langs) {
      for (const l of langs) langMap[l.id] = l.name;
    }
  }

  const enriched = (data || []).map((c: any) => ({
    ...c,
    english_title: englishTitleMap[c.id] || null,
    instructor_name: c.instructor_id ? instructorMap[c.instructor_id] || null : null,
    language_name: c.course_language_id ? langMap[c.course_language_id] || null : null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('courses').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'course', 'activate')) {
    return err(res, 'Permission denied: course:activate required to create inactive', 403);
  }

  body.created_by = req.user!.id;

  // Auto-generate slug
  if (!body.slug && (body.code || body.name)) {
    body.slug = await generateUniqueSlug(supabase, 'courses', body.code || body.name);
  } else if (body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'courses', body.slug);
  }

  const { data, error: e } = await supabase.from('courses').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Course code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  // Sync English translation
  if (body.name) {
    await supabase.from('course_translations').upsert({
      course_id: data.id,
      language_id: 7,
      title: body.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'course_id,language_id' });
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_created', targetType: 'course', targetId: data.id, targetName: data.code || data.slug, ip: getClientIp(req) });
  return ok(res, data, 'Course created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('courses').select('*').eq('id', id).single();
  if (!old) return err(res, 'Course not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'course', 'activate')) {
      return err(res, 'Permission denied: course:activate required to change active status', 403);
    }
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('courses').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Course code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  // Sync English translation
  if (updates.name) {
    await supabase.from('course_translations').upsert({
      course_id: id,
      language_id: 7,
      title: updates.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'course_id,language_id' });
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_updated', targetType: 'course', targetId: id, targetName: data.code || data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'Course updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('courses').select('code, slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Course not found', 404);
  if (old.deleted_at) return err(res, 'Course is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('courses')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete: bottom-up (leaves first, then parents)
  // 1. course_chapter_topics
  await supabase.from('course_chapter_topics').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 2. course_chapters
  await supabase.from('course_chapters').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 3. course_module_subjects
  await supabase.from('course_module_subjects').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 4. course_module_translations (via module IDs)
  const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', id);
  if (modules && modules.length > 0) {
    const moduleIds = modules.map(m => m.id);
    await supabase.from('course_module_translations').update({ deleted_at: now, is_active: false }).in('course_module_id', moduleIds).is('deleted_at', null);
  }
  // 5. course_modules
  await supabase.from('course_modules').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 6. course_sub_categories
  await supabase.from('course_sub_categories').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 7. course_translations
  await supabase.from('course_translations').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_soft_deleted', targetType: 'course', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Course moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('courses').select('code, slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Course not found', 404);
  if (!old.deleted_at) return err(res, 'Course is not in trash', 400);

  const { data, error: e } = await supabase
    .from('courses')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore: top-down (parents first, then children)
  // 1. course_translations
  await supabase.from('course_translations').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 2. course_sub_categories
  await supabase.from('course_sub_categories').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 3. course_modules
  await supabase.from('course_modules').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 4. course_module_translations (via module IDs)
  const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', id);
  if (modules && modules.length > 0) {
    const moduleIds = modules.map(m => m.id);
    await supabase.from('course_module_translations').update({ deleted_at: null, is_active: true }).in('course_module_id', moduleIds).not('deleted_at', 'is', null);
  }
  // 5. course_module_subjects
  await supabase.from('course_module_subjects').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 6. course_chapters
  await supabase.from('course_chapters').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 7. course_chapter_topics
  await supabase.from('course_chapter_topics').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_restored', targetType: 'course', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Course restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('courses').select('code, slug').eq('id', id).single();
    if (!old) return err(res, 'Course not found', 404);

    // Cascade permanent delete: bottom-up to satisfy FK constraints
    // 1. Delete course_chapter_topics (leaf)
    await supabase.from('course_chapter_topics').delete().eq('course_id', id);
    // 2. Delete course_chapters
    await supabase.from('course_chapters').delete().eq('course_id', id);
    // 3. Delete course_module_subjects
    await supabase.from('course_module_subjects').delete().eq('course_id', id);

    // 4. Delete course_module_translations with CDN cleanup
    const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', id);
    if (modules && modules.length > 0) {
      const moduleIds = modules.map(m => m.id);
      const { data: modTranslations } = await supabase.from('course_module_translations').select('id, image').in('course_module_id', moduleIds);
      if (modTranslations) {
        for (const t of modTranslations) {
          if (t.image) { try { await deleteImage(extractBunnyPath(t.image), t.image); } catch {} }
        }
        await supabase.from('course_module_translations').delete().in('course_module_id', moduleIds);
      }
    }
    // 5. Delete course_modules
    await supabase.from('course_modules').delete().eq('course_id', id);
    // 6. Delete course_sub_categories
    await supabase.from('course_sub_categories').delete().eq('course_id', id);

    // 7. Delete course_translations with CDN cleanup
    const { data: translations } = await supabase.from('course_translations').select('id, web_thumbnail, web_banner, app_thumbnail, app_banner, video_thumbnail').eq('course_id', id);
    if (translations) {
      const imageFields = ['web_thumbnail', 'web_banner', 'app_thumbnail', 'app_banner', 'video_thumbnail'] as const;
      for (const t of translations) {
        for (const field of imageFields) {
          const url = (t as any)[field];
          if (url) { try { await deleteImage(extractBunnyPath(url), url); } catch {} }
        }
      }
    }
    await supabase.from('course_translations').delete().eq('course_id', id);

    // 8. Delete the course itself
    const { error: e } = await supabase.from('courses').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'course_deleted', targetType: 'course', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
    return ok(res, null, 'Course permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete course', 500);
  }
}
