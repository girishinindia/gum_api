import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'instructor_promotion_courses:all';
const clearCache = async (promotionId?: number) => {
  await redis.del(CACHE_KEY);
  if (promotionId) await redis.del(`instructor_promotion_courses:promotion:${promotionId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Booleans
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integers
  if (typeof body.promotion_id === 'string') body.promotion_id = parseInt(body.promotion_id) || null;
  if (typeof body.course_id === 'string') body.course_id = parseInt(body.course_id) || null;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const SELECT_FIELDS = '*, instructor_promotions(promotion_name, promo_code), courses(code, slug, name)';

// GET /instructor-promotion-courses
export async function list(req: Request, res: Response) {
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('instructor_promotion_courses').select(SELECT_FIELDS, { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.promotion_id) q = q.eq('promotion_id', req.query.promotion_id);
  if (req.query.course_id) q = q.eq('course_id', req.query.course_id);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /instructor-promotion-courses/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('instructor_promotion_courses').select(SELECT_FIELDS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Promotion course link not found', 404);
  return ok(res, data);
}

// POST /instructor-promotion-courses
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'instructor_promotion_course', 'activate')) {
    return err(res, 'Permission denied: instructor_promotion_course:activate required to create inactive', 403);
  }

  // Verify promotion exists
  const { data: promo } = await supabase.from('instructor_promotions').select('id, promotion_name, promo_code').eq('id', body.promotion_id).single();
  if (!promo) return err(res, 'Promotion not found', 404);

  // Verify course exists
  const { data: course } = await supabase.from('courses').select('id, code, name').eq('id', body.course_id).single();
  if (!course) return err(res, 'Course not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('instructor_promotion_courses').insert(body).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This course is already assigned to this promotion', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.promotion_id);
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_course_created', targetType: 'instructor_promotion_course', targetId: data.id, targetName: `${promo.promotion_name || promo.promo_code} - ${course.name || course.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Promotion course link created', 201);
}

// PATCH /instructor-promotion-courses/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_promotion_courses').select('*').eq('id', id).single();
  if (!old) return err(res, 'Promotion course link not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'instructor_promotion_course', 'activate')) {
      return err(res, 'Permission denied: instructor_promotion_course:activate required to change active status', 403);
    }
  }

  // Verify changed FKs
  if (updates.promotion_id && updates.promotion_id !== old.promotion_id) {
    const { data: promo } = await supabase.from('instructor_promotions').select('id').eq('id', updates.promotion_id).single();
    if (!promo) return err(res, 'Promotion not found', 404);
  }
  if (updates.course_id && updates.course_id !== old.course_id) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', updates.course_id).single();
    if (!course) return err(res, 'Course not found', 404);
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('instructor_promotion_courses').update(updates).eq('id', id).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This course is already assigned to this promotion', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.promotion_id);
  if (updates.promotion_id && updates.promotion_id !== old.promotion_id) await clearCache(updates.promotion_id);

  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_course_updated', targetType: 'instructor_promotion_course', targetId: id, targetName: `${data.instructor_promotions?.promotion_name || data.instructor_promotions?.promo_code} - ${data.courses?.name || data.courses?.code}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Promotion course link updated');
}

// DELETE /instructor-promotion-courses/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_promotion_courses').select('promotion_id, deleted_at, instructor_promotions(promotion_name, promo_code), courses(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Promotion course link not found', 404);
  if (old.deleted_at) return err(res, 'Link is already in trash', 400);

  const { data, error: e } = await supabase
    .from('instructor_promotion_courses')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.promotion_id);
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_course_soft_deleted', targetType: 'instructor_promotion_course', targetId: id, targetName: `${(old.instructor_promotions as any)?.promotion_name || (old.instructor_promotions as any)?.promo_code} - ${(old.courses as any)?.name || (old.courses as any)?.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Promotion course link moved to trash');
}

// PATCH /instructor-promotion-courses/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_promotion_courses').select('promotion_id, deleted_at, instructor_promotions(promotion_name, promo_code, deleted_at), courses(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Promotion course link not found', 404);
  if (!old.deleted_at) return err(res, 'Link is not in trash', 400);

  // Block restore if parent promotion is deleted
  if ((old.instructor_promotions as any)?.deleted_at) {
    return err(res, 'Cannot restore: parent promotion is in trash. Restore the promotion first.', 400);
  }

  const { data, error: e } = await supabase
    .from('instructor_promotion_courses')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.promotion_id);
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_course_restored', targetType: 'instructor_promotion_course', targetId: id, targetName: `${(old.instructor_promotions as any)?.promotion_name || (old.instructor_promotions as any)?.promo_code} - ${(old.courses as any)?.name || (old.courses as any)?.code}`, ip: getClientIp(req) });
  return ok(res, data, 'Promotion course link restored');
}

// DELETE /instructor-promotion-courses/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_promotion_courses').select('promotion_id, instructor_promotions(promotion_name, promo_code), courses(name, code)').eq('id', id).single();
  if (!old) return err(res, 'Promotion course link not found', 404);

  const { error: e } = await supabase.from('instructor_promotion_courses').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.promotion_id);
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_course_deleted', targetType: 'instructor_promotion_course', targetId: id, targetName: `${(old.instructor_promotions as any)?.promotion_name || (old.instructor_promotions as any)?.promo_code} - ${(old.courses as any)?.name || (old.courses as any)?.code}`, ip: getClientIp(req) });
  return ok(res, null, 'Promotion course link permanently deleted');
}
