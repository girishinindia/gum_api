import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'payments';
const CACHE_KEY = 'payments:all';

const FK_SELECT = '*, orders(order_number), users!payments_user_id_fkey(full_name, email)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['order_id', 'user_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Float fields
  for (const k of ['amount', 'fee', 'tax', 'refund_amount']) {
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

  if (search) q = q.or(`razorpay_payment_id.ilike.%${search}%,notes.ilike.%${search}%`);
  if (req.query.order_id) q = q.eq('order_id', parseInt(req.query.order_id as string));
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.payment_status) q = q.eq('payment_status', req.query.payment_status as string);
  if (req.query.payment_method) q = q.eq('payment_method', req.query.payment_method as string);

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
  if (e || !data) return err(res, 'Payment not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.order_id) return err(res, 'order_id is required', 400);
  if (!body.user_id) return err(res, 'user_id is required', 400);
  if (!body.amount && body.amount !== 0) return err(res, 'amount is required', 400);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'payment_created', targetType: 'payment', targetId: data.id, targetName: data.razorpay_payment_id || `#${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Payment created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Payment not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'payment_updated', targetType: 'payment', targetId: id, targetName: data.razorpay_payment_id || `#${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Payment updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('razorpay_payment_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Payment not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'payment_soft_deleted', targetType: 'payment', targetId: id, targetName: old.razorpay_payment_id || `#${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Payment moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('razorpay_payment_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Payment not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'payment_restored', targetType: 'payment', targetId: id, targetName: old.razorpay_payment_id || `#${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Payment restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('razorpay_payment_id').eq('id', id).single();
  if (!old) return err(res, 'Payment not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'payment_deleted', targetType: 'payment', targetId: id, targetName: old.razorpay_payment_id || `#${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Payment permanently deleted');
}

export async function getByOrder(req: Request, res: Response) {
  const orderId = parseInt(req.params.orderId);

  const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).single();
  if (!order) return err(res, 'Order not found', 404);

  const { data, error: e } = await supabase
    .from(TABLE)
    .select(FK_SELECT)
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}
