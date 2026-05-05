import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'webinars';
const CACHE_KEY = 'webinars:all';

const clearCache = async (courseId?: number) => {
  await redis.del(CACHE_KEY);
  if (courseId) await redis.del(`webinars:course:${courseId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_free === 'string') body.is_free = body.is_free === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['course_id', 'chapter_id', 'instructor_id', 'max_attendees', 'registered_count', 'display_order', 'duration_minutes']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Numeric fields
  if (typeof body.price === 'string') body.price = parseFloat(body.price) || 0;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, courses(name, slug), users!webinars_instructor_id_fkey(id, full_name, email)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`title.ilike.%${search}%,code.ilike.%${search}%`);
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));
  if (req.query.chapter_id) q = q.eq('chapter_id', parseInt(req.query.chapter_id as string));
  if (req.query.webinar_status) q = q.eq('webinar_status', req.query.webinar_status as string);
  if (req.query.webinar_owner) q = q.eq('webinar_owner', req.query.webinar_owner as string);
  if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  if (req.query.is_free === 'true') q = q.eq('is_free', true);
  else if (req.query.is_free === 'false') q = q.eq('is_free', false);

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
  if (e || !data) return err(res, 'Webinar not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  // Verify course exists if provided
  if (body.course_id) {
    const { data: course } = await supabase.from('courses').select('id, name').eq('id', body.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  // Verify instructor exists if provided
  if (body.instructor_id) {
    const { data: instructor } = await supabase.from('users').select('id').eq('id', body.instructor_id).single();
    if (!instructor) return err(res, 'Instructor not found', 404);
  }

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_created', targetType: 'webinar', targetId: data.id, targetName: body.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Webinar not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  // Verify new course if changed
  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  if (updates.course_id && updates.course_id !== old.course_id) await clearCache(updates.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_updated', targetType: 'webinar', targetId: id, targetName: updates.title || old.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('course_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Webinar not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_soft_deleted', targetType: 'webinar', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('course_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Webinar not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_restored', targetType: 'webinar', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('course_id, title').eq('id', id).single();
  if (!old) return err(res, 'Webinar not found', 404);

  // Cascade delete translations
  await supabase.from('webinar_translations').delete().eq('webinar_id', id);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.course_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_deleted', targetType: 'webinar', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, null, 'Webinar permanently deleted');
}
