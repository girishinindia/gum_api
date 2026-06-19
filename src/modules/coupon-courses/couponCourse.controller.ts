import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'coupon_courses';
const CACHE_KEY = 'coupon_courses:all';
const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['coupon_id', 'course_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, coupons(id, coupon_code, title), courses(id, name)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'created_at' });
  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });
  if (req.query.coupon_id) q = q.eq('coupon_id', parseInt(req.query.coupon_id as string));
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));
  if (req.query.show_deleted === 'true') { q = q.not('deleted_at', 'is', null); } else { q = q.is('deleted_at', null); }
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Coupon-course link not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.coupon_id) return err(res, 'coupon_id is required', 400);
  if (!body.course_id) return err(res, 'course_id is required', 400);

  // A coupon can only be linked to its target type.
  const { data: coupon } = await supabase.from('coupons').select('applicable_to, deleted_at').eq('id', body.coupon_id).is('deleted_at', null).maybeSingle();
  if (!coupon) return err(res, 'Coupon not found', 404);
  if (coupon.applicable_to !== 'all' && coupon.applicable_to !== 'course') {
    return err(res, `This coupon applies to '${coupon.applicable_to}', so it can't be linked to a course`, 400);
  }

  body.created_by = req.user!.id;
  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_course_created', targetType: 'coupon_course', targetId: data.id, targetName: `Coupon-Course #${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Coupon-course link created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Coupon-course link not found', 404);
  const updates = parseBody(req);
  updates.updated_by = req.user!.id;
  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_course_updated', targetType: 'coupon_course', targetId: id, targetName: `Coupon-Course #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Coupon-course link updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Coupon-course link not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_course_soft_deleted', targetType: 'coupon_course', targetId: id, targetName: `Coupon-Course #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Coupon-course link moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('coupon_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Coupon-course link not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);
  const { data: parent } = await supabase.from('coupons').select('deleted_at').eq('id', old.coupon_id).single();
  if (parent?.deleted_at) return err(res, 'Cannot restore: parent coupon is in trash', 400);
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_course_restored', targetType: 'coupon_course', targetId: id, targetName: `Coupon-Course #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Coupon-course link restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Coupon-course link not found', 404);
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_course_deleted', targetType: 'coupon_course', targetId: id, targetName: `Coupon-Course #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Coupon-course link permanently deleted');
}
