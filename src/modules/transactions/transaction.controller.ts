import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch, SEARCH_CONFIGS } from '../../utils/search';

const TABLE = 'transactions';
const CACHE_KEY = 'transactions:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['order_id', 'payment_id', 'user_id', 'reference_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of ['amount', 'balance_before', 'balance_after']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseFloat(body[k]) || null : null;
  }
  if (typeof body.metadata === 'string') {
    try { body.metadata = JSON.parse(body.metadata); } catch { body.metadata = null; }
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, orders(order_number), payments(razorpay_payment_id), users!transactions_user_id_fkey(full_name, email)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, SEARCH_CONFIGS.transactions);
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.order_id) q = q.eq('order_id', parseInt(req.query.order_id as string));
  if (req.query.transaction_type) q = q.eq('transaction_type', req.query.transaction_type as string);
  if (req.query.status) q = q.eq('status', req.query.status as string);

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
  if (e || !data) return err(res, 'Transaction not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.user_id) return err(res, 'user_id is required', 400);
  if (!body.transaction_type) return err(res, 'transaction_type is required', 400);
  if (!body.amount && body.amount !== 0) return err(res, 'amount is required', 400);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'transaction_created', targetType: 'transaction', targetId: data.id, targetName: data.transaction_number || `Transaction #${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Transaction created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Transaction not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'transaction_updated', targetType: 'transaction', targetId: id, targetName: old.transaction_number || `Transaction #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Transaction updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('transaction_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Transaction not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'transaction_soft_deleted', targetType: 'transaction', targetId: id, targetName: old.transaction_number || `Transaction #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Transaction moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('transaction_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Transaction not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'transaction_restored', targetType: 'transaction', targetId: id, targetName: old.transaction_number || `Transaction #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Transaction restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id, transaction_number').eq('id', id).single();
  if (!old) return err(res, 'Transaction not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'transaction_deleted', targetType: 'transaction', targetId: id, targetName: old.transaction_number || `Transaction #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Transaction permanently deleted');
}

export async function getByOrder(req: Request, res: Response) {
  const orderId = parseInt(req.params.orderId);
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' }).eq('order_id', orderId).is('deleted_at', null);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getByUser(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' }).eq('user_id', userId).is('deleted_at', null);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}
