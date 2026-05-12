import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'orders';
const CACHE_KEY = 'orders:all';

const FK_SELECT = '*, users!orders_user_id_fkey(full_name, email), coupons(coupon_code, title), instructor_promotions(promo_code, title)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['user_id', 'coupon_id', 'promotion_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Float fields
  for (const k of ['subtotal', 'discount_amount', 'tax_amount', 'total_amount']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseFloat(body[k]) || null : null;
  }
  // JSON fields
  if (typeof body.metadata === 'string') {
    try { body.metadata = JSON.parse(body.metadata); } catch { /* keep as string */ }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`order_number.ilike.%${search}%,notes.ilike.%${search}%`);
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.order_status) q = q.eq('order_status', req.query.order_status as string);
  if (req.query.payment_status) q = q.eq('payment_status', req.query.payment_status as string);

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
  if (e || !data) return err(res, 'Order not found', 404);

  // Fetch order items
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', data.id)
    .is('deleted_at', null)
    .order('id', { ascending: true });

  (data as any).items = items || [];

  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.user_id) return err(res, 'user_id is required', 400);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'order_created', targetType: 'order', targetId: data.id, targetName: data.order_number, ip: getClientIp(req) });
  return ok(res, data, 'Order created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Order not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'order_updated', targetType: 'order', targetId: id, targetName: data.order_number, ip: getClientIp(req) });
  return ok(res, data, 'Order updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('order_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Order not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const softDeletePayload = { deleted_at: now, is_active: false, updated_by: req.user!.id };

  const { data, error: e } = await supabase.from(TABLE).update(softDeletePayload).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete order items
  await supabase.from('order_items').update({ deleted_at: now, is_active: false }).eq('order_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'order_soft_deleted', targetType: 'order', targetId: id, targetName: old.order_number, ip: getClientIp(req) });
  return ok(res, data, 'Order moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('order_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Order not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const restorePayload = { deleted_at: null, is_active: true, updated_by: req.user!.id };

  const { data, error: e } = await supabase.from(TABLE).update(restorePayload).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore order items
  await supabase.from('order_items').update({ deleted_at: null, is_active: true }).eq('order_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'order_restored', targetType: 'order', targetId: id, targetName: old.order_number, ip: getClientIp(req) });
  return ok(res, data, 'Order restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('order_number').eq('id', id).single();
  if (!old) return err(res, 'Order not found', 404);

  // Cascade handles order_items via DB ON DELETE CASCADE
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'order_deleted', targetType: 'order', targetId: id, targetName: old.order_number, ip: getClientIp(req) });
  return ok(res, null, 'Order permanently deleted');
}

export async function cancelOrder(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Order not found', 404);

  const now = new Date().toISOString();
  const updates: any = {
    order_status: 'cancelled',
    cancelled_at: now,
    updated_by: req.user!.id,
  };

  // If payment was unpaid, mark it as failed
  if (old.payment_status === 'unpaid') {
    updates.payment_status = 'failed';
  }

  if (req.body.cancellation_reason) {
    updates.cancellation_reason = req.body.cancellation_reason;
  }

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'order_cancelled', targetType: 'order', targetId: id, targetName: old.order_number, ip: getClientIp(req) });
  return ok(res, data, 'Order cancelled');
}

export async function confirmOrder(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Order not found', 404);

  const updates = {
    order_status: 'confirmed',
    updated_by: req.user!.id,
  };

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'order_confirmed', targetType: 'order', targetId: id, targetName: old.order_number, ip: getClientIp(req) });
  return ok(res, data, 'Order confirmed');
}

export async function getOrderItems(req: Request, res: Response) {
  const orderId = parseInt(req.params.id);

  const { data: order } = await supabase.from(TABLE).select('id').eq('id', orderId).single();
  if (!order) return err(res, 'Order not found', 404);

  const { data, error: e } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .order('id', { ascending: true });

  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}
