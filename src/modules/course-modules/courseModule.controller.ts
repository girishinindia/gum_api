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

const CACHE_KEY = 'course_modules:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['view_count', 'course_id', 'display_order']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('course_modules').select('*, courses(code, slug, name)', { count: 'exact' });

  if (search) q = q.or(`slug.ilike.%${search}%,name.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation names
  const moduleIds = (data || []).map((m: any) => m.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishNameMap: Record<number, string> = {};
  if (moduleIds.length > 0) {
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (enLang) {
      let enQ = supabase.from('course_module_translations').select('course_module_id, name').in('course_module_id', moduleIds).eq('language_id', enLang.id);
      if (!isTrash) enQ = enQ.is('deleted_at', null);
      const { data: enTranslations } = await enQ;
      if (enTranslations) {
        for (const t of enTranslations) englishNameMap[t.course_module_id] = t.name;
      }
    }
  }

  const enriched = (data || []).map((m: any) => ({
    ...m,
    english_name: englishNameMap[m.id] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('course_modules').select('*, courses(code, slug, name)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course module not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'course_module', 'activate')) {
    return err(res, 'Permission denied: course_module:activate required to create inactive', 403);
  }

  // Verify course exists
  const { data: course } = await supabase.from('courses').select('id, code, slug').eq('id', body.course_id).single();
  if (!course) return err(res, 'Course not found', 404);

  body.created_by = req.user!.id;

  // Auto-generate slug
  if (!body.slug && body.name) {
    body.slug = await generateUniqueSlug(supabase, 'course_modules', body.name);
  } else if (body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'course_modules', body.slug);
  }

  const { data, error: e } = await supabase.from('course_modules').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Course module slug already exists', 409);
    return err(res, e.message, 500);
  }

  // Sync English translation
  if (body.name) {
    await supabase.from('course_module_translations').upsert({
      course_module_id: data.id,
      language_id: 7,
      name: body.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'course_module_id,language_id' });
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_module_created', targetType: 'course_module', targetId: data.id, targetName: data.name || data.slug, ip: getClientIp(req) });
  return ok(res, data, 'Course module created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_modules').select('*').eq('id', id).single();
  if (!old) return err(res, 'Course module not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'course_module', 'activate')) {
      return err(res, 'Permission denied: course_module:activate required to change active status', 403);
    }
  }

  // If changing course, verify it exists
  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('course_modules').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Course module slug already exists', 409);
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
    await supabase.from('course_module_translations').upsert({
      course_module_id: id,
      language_id: 7,
      name: updates.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'course_module_id,language_id' });
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_module_updated', targetType: 'course_module', targetId: id, targetName: data.name || data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'Course module updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_modules').select('name, slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Course module not found', 404);
  if (old.deleted_at) return err(res, 'Course module is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('course_modules')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete: bottom-up
  // 1. Get course_module_subjects for this module
  const { data: subjects } = await supabase.from('course_module_subjects').select('id').eq('course_module_id', id);
  if (subjects && subjects.length > 0) {
    const subjectIds = subjects.map(s => s.id);
    // 1a. course_chapter_topics (via chapters via subjects)
    const { data: chapters } = await supabase.from('course_chapters').select('id').in('course_module_subject_id', subjectIds);
    if (chapters && chapters.length > 0) {
      const chapterIds = chapters.map(c => c.id);
      await supabase.from('course_chapter_topics').update({ deleted_at: now, is_active: false }).in('course_chapter_id', chapterIds).is('deleted_at', null);
    }
    // 1b. course_chapters
    await supabase.from('course_chapters').update({ deleted_at: now, is_active: false }).in('course_module_subject_id', subjectIds).is('deleted_at', null);
  }
  // 2. course_module_subjects
  await supabase.from('course_module_subjects').update({ deleted_at: now, is_active: false }).eq('course_module_id', id).is('deleted_at', null);
  // 3. course_module_translations
  await supabase.from('course_module_translations').update({ deleted_at: now, is_active: false }).eq('course_module_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_module_soft_deleted', targetType: 'course_module', targetId: id, targetName: old.name || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Course module moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_modules').select('name, slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Course module not found', 404);
  if (!old.deleted_at) return err(res, 'Course module is not in trash', 400);

  const { data, error: e } = await supabase
    .from('course_modules')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore: top-down
  // 1. course_module_translations
  await supabase.from('course_module_translations').update({ deleted_at: null, is_active: true }).eq('course_module_id', id).not('deleted_at', 'is', null);
  // 2. course_module_subjects
  await supabase.from('course_module_subjects').update({ deleted_at: null, is_active: true }).eq('course_module_id', id).not('deleted_at', 'is', null);
  // 3. course_chapters (via subjects)
  const { data: subjects } = await supabase.from('course_module_subjects').select('id').eq('course_module_id', id);
  if (subjects && subjects.length > 0) {
    const subjectIds = subjects.map(s => s.id);
    await supabase.from('course_chapters').update({ deleted_at: null, is_active: true }).in('course_module_subject_id', subjectIds).not('deleted_at', 'is', null);
    // 4. course_chapter_topics (via chapters)
    const { data: chapters } = await supabase.from('course_chapters').select('id').in('course_module_subject_id', subjectIds);
    if (chapters && chapters.length > 0) {
      const chapterIds = chapters.map(c => c.id);
      await supabase.from('course_chapter_topics').update({ deleted_at: null, is_active: true }).in('course_chapter_id', chapterIds).not('deleted_at', 'is', null);
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_module_restored', targetType: 'course_module', targetId: id, targetName: old.name || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Course module restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('course_modules').select('name, slug').eq('id', id).single();
    if (!old) return err(res, 'Course module not found', 404);

    // Cascade permanent delete: bottom-up to satisfy FK constraints
    // 1. Get course_module_subjects for this module
    const { data: subjects } = await supabase.from('course_module_subjects').select('id').eq('course_module_id', id);
    if (subjects && subjects.length > 0) {
      const subjectIds = subjects.map(s => s.id);
      // 1a. Get chapters for these subjects
      const { data: chapters } = await supabase.from('course_chapters').select('id').in('course_module_subject_id', subjectIds);
      if (chapters && chapters.length > 0) {
        const chapterIds = chapters.map(c => c.id);
        // Delete course_chapter_topics
        await supabase.from('course_chapter_topics').delete().in('course_chapter_id', chapterIds);
      }
      // 1b. Delete course_chapters
      await supabase.from('course_chapters').delete().in('course_module_subject_id', subjectIds);
    }
    // 2. Delete course_module_subjects
    await supabase.from('course_module_subjects').delete().eq('course_module_id', id);

    // 3. Delete course_module_translations with CDN cleanup
    const { data: translations } = await supabase.from('course_module_translations').select('id, image').eq('course_module_id', id);
    if (translations) {
      for (const t of translations) {
        if (t.image) { try { await deleteImage(extractBunnyPath(t.image), t.image); } catch {} }
      }
    }
    await supabase.from('course_module_translations').delete().eq('course_module_id', id);

    // 4. Delete the module itself
    const { error: e } = await supabase.from('course_modules').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'course_module_deleted', targetType: 'course_module', targetId: id, targetName: old.name || old.slug, ip: getClientIp(req) });
    return ok(res, null, 'Course module permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete course module', 500);
  }
}
