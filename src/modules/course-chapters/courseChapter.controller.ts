import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'course_chapters:all';
const clearCache = async (courseId?: number) => {
  await redis.del(CACHE_KEY);
  if (courseId) await redis.del(`course_chapters:course:${courseId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Booleans
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_free_trial === 'string') body.is_free_trial = body.is_free_trial === 'true';
  // Integers
  if (typeof body.course_id === 'string') body.course_id = parseInt(body.course_id) || null;
  if (typeof body.course_module_subject_id === 'string') body.course_module_subject_id = parseInt(body.course_module_subject_id) || null;
  if (typeof body.chapter_id === 'string') body.chapter_id = parseInt(body.chapter_id) || null;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const SELECT_FIELDS = '*, courses(code, slug, name), course_module_subjects(id, course_module_id, subject_id, course_modules(slug, name), subjects(code, slug, name)), chapters(slug, name, subject_id)';

// GET /course-chapters
export async function list(req: Request, res: Response) {
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('course_chapters').select(SELECT_FIELDS, { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));
  if (req.query.course_module_subject_id) q = q.eq('course_module_subject_id', parseInt(req.query.course_module_subject_id as string));
  if (req.query.chapter_id) q = q.eq('chapter_id', parseInt(req.query.chapter_id as string));
  if (req.query.is_free_trial === 'true') q = q.eq('is_free_trial', true);
  else if (req.query.is_free_trial === 'false') q = q.eq('is_free_trial', false);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /course-chapters/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('course_chapters').select(SELECT_FIELDS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course chapter link not found', 404);
  return ok(res, data);
}

// POST /course-chapters
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'course_chapter', 'activate')) {
    return err(res, 'Permission denied: course_chapter:activate required to create inactive', 403);
  }

  // Verify course exists
  const { data: course } = await supabase.from('courses').select('id, code, name').eq('id', body.course_id).single();
  if (!course) return err(res, 'Course not found', 404);

  // Verify course_module_subject exists and belongs to this course
  const { data: cms } = await supabase.from('course_module_subjects').select('id, course_id, subject_id').eq('id', body.course_module_subject_id).single();
  if (!cms) return err(res, 'Course module subject link not found', 404);
  if (cms.course_id !== body.course_id) return err(res, 'Module subject link does not belong to the selected course', 400);

  // Verify chapter exists and belongs to the correct subject
  const { data: chapter } = await supabase.from('chapters').select('id, name, subject_id').eq('id', body.chapter_id).single();
  if (!chapter) return err(res, 'Chapter not found', 404);
  if (chapter.subject_id !== cms.subject_id) return err(res, 'Chapter does not belong to the subject in this module', 400);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('course_chapters').insert(body).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This chapter is already assigned', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_chapter_created', targetType: 'course_chapter', targetId: data.id, targetName: `${course.name || course.code} - ${chapter.name}`, ip: getClientIp(req) });
  return ok(res, data, 'Course chapter link created', 201);
}

// PATCH /course-chapters/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_chapters').select('*').eq('id', id).single();
  if (!old) return err(res, 'Course chapter link not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'course_chapter', 'activate')) {
      return err(res, 'Permission denied: course_chapter:activate required to change active status', 403);
    }
  }

  // Verify changed FKs
  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  if (updates.course_module_subject_id && updates.course_module_subject_id !== old.course_module_subject_id) {
    const { data: cms } = await supabase.from('course_module_subjects').select('id, course_id, subject_id').eq('id', updates.course_module_subject_id).single();
    if (!cms) return err(res, 'Course module subject link not found', 404);
    const effectiveCourseId = updates.course_id || old.course_id;
    if (cms.course_id !== effectiveCourseId) return err(res, 'Module subject link does not belong to the selected course', 400);
  }

  if (updates.chapter_id && updates.chapter_id !== old.chapter_id) {
    const { data: chapter } = await supabase.from('chapters').select('id, subject_id').eq('id', updates.chapter_id).single();
    if (!chapter) return err(res, 'Chapter not found', 404);
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('course_chapters').update(updates).eq('id', id).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This chapter is already assigned', 409);
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

  logAdmin({ actorId: req.user!.id, action: 'course_chapter_updated', targetType: 'course_chapter', targetId: id, targetName: `${data.chapters?.name}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Course chapter link updated');
}

// DELETE /course-chapters/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_chapters').select('course_id, deleted_at, chapters(name)').eq('id', id).single();
  if (!old) return err(res, 'Course chapter link not found', 404);
  if (old.deleted_at) return err(res, 'Link is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('course_chapters')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to chapter_topics
  await supabase.from('course_chapter_topics').update({ deleted_at: now, is_active: false }).eq('course_chapter_id', id).is('deleted_at', null);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_chapter_soft_deleted', targetType: 'course_chapter', targetId: id, targetName: (old.chapters as any)?.name, ip: getClientIp(req) });
  return ok(res, data, 'Course chapter link moved to trash');
}

// PATCH /course-chapters/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_chapters').select('course_id, deleted_at, chapters(name)').eq('id', id).single();
  if (!old) return err(res, 'Course chapter link not found', 404);
  if (!old.deleted_at) return err(res, 'Link is not in trash', 400);

  const { data, error: e } = await supabase
    .from('course_chapters')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore to chapter_topics
  await supabase.from('course_chapter_topics').update({ deleted_at: null, is_active: true }).eq('course_chapter_id', id).not('deleted_at', 'is', null);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_chapter_restored', targetType: 'course_chapter', targetId: id, targetName: (old.chapters as any)?.name, ip: getClientIp(req) });
  return ok(res, data, 'Course chapter link restored');
}

// DELETE /course-chapters/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_chapters').select('course_id, chapters(name)').eq('id', id).single();
  if (!old) return err(res, 'Course chapter link not found', 404);

  // Cascade permanent delete: chapter_topics first
  await supabase.from('course_chapter_topics').delete().eq('course_chapter_id', id);

  const { error: e } = await supabase.from('course_chapters').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_chapter_deleted', targetType: 'course_chapter', targetId: id, targetName: (old.chapters as any)?.name, ip: getClientIp(req) });
  return ok(res, null, 'Course chapter link permanently deleted');
}
