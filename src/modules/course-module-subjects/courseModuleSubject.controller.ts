import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'course_module_subjects:all';
const clearCache = async (courseId?: number) => {
  await redis.del(CACHE_KEY);
  if (courseId) await redis.del(`course_module_subjects:course:${courseId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Booleans
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integers
  if (typeof body.course_id === 'string') body.course_id = parseInt(body.course_id) || null;
  if (typeof body.course_module_id === 'string') body.course_module_id = parseInt(body.course_module_id) || null;
  if (typeof body.subject_id === 'string') body.subject_id = parseInt(body.subject_id) || null;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const SELECT_FIELDS = '*, courses(code, slug, name), course_modules(slug, name, course_id), subjects(code, slug, name)';

// GET /course-module-subjects
export async function list(req: Request, res: Response) {
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('course_module_subjects').select(SELECT_FIELDS, { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));
  if (req.query.course_module_id) q = q.eq('course_module_id', parseInt(req.query.course_module_id as string));
  if (req.query.subject_id) q = q.eq('subject_id', parseInt(req.query.subject_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /course-module-subjects/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('course_module_subjects').select(SELECT_FIELDS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course module subject link not found', 404);
  return ok(res, data);
}

// POST /course-module-subjects
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'course_module_subject', 'activate')) {
    return err(res, 'Permission denied: course_module_subject:activate required to create inactive', 403);
  }

  // Verify course exists
  const { data: course } = await supabase.from('courses').select('id, code, name').eq('id', body.course_id).single();
  if (!course) return err(res, 'Course not found', 404);

  // Verify module exists and belongs to this course
  const { data: mod } = await supabase.from('course_modules').select('id, name, course_id').eq('id', body.course_module_id).single();
  if (!mod) return err(res, 'Course module not found', 404);
  if (mod.course_id !== body.course_id) return err(res, 'Module does not belong to the selected course', 400);

  // Verify subject exists
  const { data: subject } = await supabase.from('subjects').select('id, code, name').eq('id', body.subject_id).single();
  if (!subject) return err(res, 'Subject not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('course_module_subjects').insert(body).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This subject is already assigned to this module', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_module_subject_created', targetType: 'course_module_subject', targetId: data.id, targetName: `${mod.name} - ${subject.name || subject.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Course module subject link created', 201);
}

// PATCH /course-module-subjects/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_module_subjects').select('*').eq('id', id).single();
  if (!old) return err(res, 'Course module subject link not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'course_module_subject', 'activate')) {
      return err(res, 'Permission denied: course_module_subject:activate required to change active status', 403);
    }
  }

  // Verify changed FKs
  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  if (updates.course_module_id && updates.course_module_id !== old.course_module_id) {
    const { data: mod } = await supabase.from('course_modules').select('id, course_id').eq('id', updates.course_module_id).single();
    if (!mod) return err(res, 'Course module not found', 404);
    const effectiveCourseId = updates.course_id || old.course_id;
    if (mod.course_id !== effectiveCourseId) return err(res, 'Module does not belong to the selected course', 400);
  }

  if (updates.subject_id && updates.subject_id !== old.subject_id) {
    const { data: subject } = await supabase.from('subjects').select('id').eq('id', updates.subject_id).single();
    if (!subject) return err(res, 'Subject not found', 404);
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('course_module_subjects').update(updates).eq('id', id).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This subject is already assigned to this module', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.course_id);
  if (updates.course_id && updates.course_id !== old.course_id) await clearCache(updates.course_id);

  logAdmin({ actorId: req.user!.id, action: 'course_module_subject_updated', targetType: 'course_module_subject', targetId: id, targetName: `${data.course_modules?.name} - ${data.subjects?.name || data.subjects?.code}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Course module subject link updated');
}

// DELETE /course-module-subjects/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_module_subjects').select('course_id, deleted_at, course_modules(name), subjects(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Course module subject link not found', 404);
  if (old.deleted_at) return err(res, 'Link is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('course_module_subjects')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete: chapters and chapter_topics under this subject
  const { data: chapters } = await supabase.from('course_chapters').select('id').eq('course_module_subject_id', id);
  if (chapters && chapters.length > 0) {
    const chapterIds = chapters.map(c => c.id);
    await supabase.from('course_chapter_topics').update({ deleted_at: now, is_active: false }).in('course_chapter_id', chapterIds).is('deleted_at', null);
  }
  await supabase.from('course_chapters').update({ deleted_at: now, is_active: false }).eq('course_module_subject_id', id).is('deleted_at', null);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_module_subject_soft_deleted', targetType: 'course_module_subject', targetId: id, targetName: `${(old.course_modules as any)?.name} - ${(old.subjects as any)?.name || (old.subjects as any)?.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Course module subject link moved to trash');
}

// PATCH /course-module-subjects/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_module_subjects').select('course_id, deleted_at, course_modules(name), subjects(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Course module subject link not found', 404);
  if (!old.deleted_at) return err(res, 'Link is not in trash', 400);

  const { data, error: e } = await supabase
    .from('course_module_subjects')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore: chapters and chapter_topics
  await supabase.from('course_chapters').update({ deleted_at: null, is_active: true }).eq('course_module_subject_id', id).not('deleted_at', 'is', null);
  const { data: chapters } = await supabase.from('course_chapters').select('id').eq('course_module_subject_id', id);
  if (chapters && chapters.length > 0) {
    const chapterIds = chapters.map(c => c.id);
    await supabase.from('course_chapter_topics').update({ deleted_at: null, is_active: true }).in('course_chapter_id', chapterIds).not('deleted_at', 'is', null);
  }

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_module_subject_restored', targetType: 'course_module_subject', targetId: id, targetName: `${(old.course_modules as any)?.name} - ${(old.subjects as any)?.name || (old.subjects as any)?.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Course module subject link restored');
}

// DELETE /course-module-subjects/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_module_subjects').select('course_id, course_modules(name), subjects(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Course module subject link not found', 404);

  // Cascade permanent delete: chapter_topics then chapters
  const { data: chapters } = await supabase.from('course_chapters').select('id').eq('course_module_subject_id', id);
  if (chapters && chapters.length > 0) {
    const chapterIds = chapters.map(c => c.id);
    await supabase.from('course_chapter_topics').delete().in('course_chapter_id', chapterIds);
  }
  await supabase.from('course_chapters').delete().eq('course_module_subject_id', id);

  const { error: e } = await supabase.from('course_module_subjects').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_module_subject_deleted', targetType: 'course_module_subject', targetId: id, targetName: `${(old.course_modules as any)?.name} - ${(old.subjects as any)?.name || (old.subjects as any)?.code}`, ip: getClientIp(req) });
  return ok(res, null, 'Course module subject link permanently deleted');
}
