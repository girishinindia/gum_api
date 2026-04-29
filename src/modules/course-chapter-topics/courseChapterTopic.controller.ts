import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'course_chapter_topics:all';
const clearCache = async (courseId?: number) => {
  await redis.del(CACHE_KEY);
  if (courseId) await redis.del(`course_chapter_topics:course:${courseId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Booleans
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integers
  if (typeof body.course_id === 'string') body.course_id = parseInt(body.course_id) || null;
  if (typeof body.course_chapter_id === 'string') body.course_chapter_id = parseInt(body.course_chapter_id) || null;
  if (typeof body.topic_id === 'string') body.topic_id = parseInt(body.topic_id) || null;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const SELECT_FIELDS = '*, courses(code, slug, name), course_chapters(id, chapter_id, course_module_subject_id, chapters(slug, name)), topics(slug, name, chapter_id)';

// GET /course-chapter-topics
export async function list(req: Request, res: Response) {
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('course_chapter_topics').select(SELECT_FIELDS, { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));
  if (req.query.course_chapter_id) q = q.eq('course_chapter_id', parseInt(req.query.course_chapter_id as string));
  if (req.query.topic_id) q = q.eq('topic_id', parseInt(req.query.topic_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /course-chapter-topics/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('course_chapter_topics').select(SELECT_FIELDS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course chapter topic link not found', 404);
  return ok(res, data);
}

// POST /course-chapter-topics
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'course_chapter_topic', 'activate')) {
    return err(res, 'Permission denied: course_chapter_topic:activate required to create inactive', 403);
  }

  // Verify course exists
  const { data: course } = await supabase.from('courses').select('id, code, name').eq('id', body.course_id).single();
  if (!course) return err(res, 'Course not found', 404);

  // Verify course_chapter exists and belongs to this course
  const { data: cc } = await supabase.from('course_chapters').select('id, course_id, chapter_id').eq('id', body.course_chapter_id).single();
  if (!cc) return err(res, 'Course chapter link not found', 404);
  if (cc.course_id !== body.course_id) return err(res, 'Course chapter link does not belong to the selected course', 400);

  // Verify topic exists and belongs to the correct chapter
  const { data: topic } = await supabase.from('topics').select('id, name, chapter_id').eq('id', body.topic_id).single();
  if (!topic) return err(res, 'Topic not found', 404);
  if (topic.chapter_id !== cc.chapter_id) return err(res, 'Topic does not belong to the chapter in this course', 400);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('course_chapter_topics').insert(body).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This topic is already assigned to this chapter', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_chapter_topic_created', targetType: 'course_chapter_topic', targetId: data.id, targetName: `${course.name || course.code} - ${topic.name}`, ip: getClientIp(req) });
  return ok(res, data, 'Course chapter topic link created', 201);
}

// PATCH /course-chapter-topics/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_chapter_topics').select('*').eq('id', id).single();
  if (!old) return err(res, 'Course chapter topic link not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'course_chapter_topic', 'activate')) {
      return err(res, 'Permission denied: course_chapter_topic:activate required to change active status', 403);
    }
  }

  // Verify changed FKs
  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  if (updates.course_chapter_id && updates.course_chapter_id !== old.course_chapter_id) {
    const { data: cc } = await supabase.from('course_chapters').select('id, course_id, chapter_id').eq('id', updates.course_chapter_id).single();
    if (!cc) return err(res, 'Course chapter link not found', 404);
    const effectiveCourseId = updates.course_id || old.course_id;
    if (cc.course_id !== effectiveCourseId) return err(res, 'Course chapter link does not belong to the selected course', 400);
  }

  if (updates.topic_id && updates.topic_id !== old.topic_id) {
    const { data: topic } = await supabase.from('topics').select('id, chapter_id').eq('id', updates.topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('course_chapter_topics').update(updates).eq('id', id).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This topic is already assigned to this chapter', 409);
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

  logAdmin({ actorId: req.user!.id, action: 'course_chapter_topic_updated', targetType: 'course_chapter_topic', targetId: id, targetName: `${data.topics?.name}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Course chapter topic link updated');
}

// DELETE /course-chapter-topics/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_chapter_topics').select('course_id, deleted_at, topics(name)').eq('id', id).single();
  if (!old) return err(res, 'Course chapter topic link not found', 404);
  if (old.deleted_at) return err(res, 'Link is already in trash', 400);

  const { data, error: e } = await supabase
    .from('course_chapter_topics')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_chapter_topic_soft_deleted', targetType: 'course_chapter_topic', targetId: id, targetName: (old.topics as any)?.name, ip: getClientIp(req) });
  return ok(res, data, 'Course chapter topic link moved to trash');
}

// PATCH /course-chapter-topics/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_chapter_topics').select('course_id, deleted_at, topics(name)').eq('id', id).single();
  if (!old) return err(res, 'Course chapter topic link not found', 404);
  if (!old.deleted_at) return err(res, 'Link is not in trash', 400);

  const { data, error: e } = await supabase
    .from('course_chapter_topics')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_chapter_topic_restored', targetType: 'course_chapter_topic', targetId: id, targetName: (old.topics as any)?.name, ip: getClientIp(req) });
  return ok(res, data, 'Course chapter topic link restored');
}

// DELETE /course-chapter-topics/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('course_chapter_topics').select('course_id, topics(name)').eq('id', id).single();
  if (!old) return err(res, 'Course chapter topic link not found', 404);

  const { error: e } = await supabase.from('course_chapter_topics').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'course_chapter_topic_deleted', targetType: 'course_chapter_topic', targetId: id, targetName: (old.topics as any)?.name, ip: getClientIp(req) });
  return ok(res, null, 'Course chapter topic link permanently deleted');
}
