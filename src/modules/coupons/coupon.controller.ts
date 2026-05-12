import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch, SEARCH_CONFIGS } from '../../utils/search';

const TABLE = 'coupons';
const CACHE_KEY = 'coupons:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['usage_limit', 'usage_per_user', 'used_count', 'created_by', 'updated_by']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of ['discount_value', 'min_purchase_amount', 'max_discount_amount']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseFloat(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

/** Generate a unique coupon code like COUPON-A3X9 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const FK_SELECT = `*`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['coupon_code', 'title'] });
  if (req.query.discount_type) q = q.eq('discount_type', req.query.discount_type as string);
  if (req.query.applicable_to) q = q.eq('applicable_to', req.query.applicable_to as string);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  if (req.query.is_active === 'false') q = q.eq('is_active', false);

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
  if (e || !data) return err(res, 'Coupon not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.title) return err(res, 'title is required', 400);

  // Auto-generate coupon_code if not provided
  if (!body.coupon_code) {
    body.coupon_code = generateCode();
    // Check uniqueness
    const { data: existing } = await supabase.from(TABLE).select('id').eq('coupon_code', body.coupon_code).maybeSingle();
    if (existing) body.coupon_code = generateCode(); // retry once
  }

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_created', targetType: 'coupon', targetId: data.id, targetName: data.coupon_code, ip: getClientIp(req) });
  return ok(res, data, 'Coupon created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Coupon not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_updated', targetType: 'coupon', targetId: id, targetName: data.coupon_code, ip: getClientIp(req) });
  return ok(res, data, 'Coupon updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('coupon_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Coupon not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete junction tables
  await supabase.from('coupon_courses').update({ deleted_at: now, is_active: false }).eq('coupon_id', id).is('deleted_at', null);
  await supabase.from('coupon_bundles').update({ deleted_at: now, is_active: false }).eq('coupon_id', id).is('deleted_at', null);
  await supabase.from('coupon_batches').update({ deleted_at: now, is_active: false }).eq('coupon_id', id).is('deleted_at', null);
  await supabase.from('coupon_webinars').update({ deleted_at: now, is_active: false }).eq('coupon_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_soft_deleted', targetType: 'coupon', targetId: id, targetName: old.coupon_code, ip: getClientIp(req) });
  return ok(res, data, 'Coupon moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('coupon_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Coupon not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore junction tables
  await supabase.from('coupon_courses').update({ deleted_at: null, is_active: true }).eq('coupon_id', id).not('deleted_at', 'is', null);
  await supabase.from('coupon_bundles').update({ deleted_at: null, is_active: true }).eq('coupon_id', id).not('deleted_at', 'is', null);
  await supabase.from('coupon_batches').update({ deleted_at: null, is_active: true }).eq('coupon_id', id).not('deleted_at', 'is', null);
  await supabase.from('coupon_webinars').update({ deleted_at: null, is_active: true }).eq('coupon_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_restored', targetType: 'coupon', targetId: id, targetName: old.coupon_code, ip: getClientIp(req) });
  return ok(res, data, 'Coupon restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('coupon_code').eq('id', id).single();
  if (!old) return err(res, 'Coupon not found', 404);

  // Cascade delete junctions (ON DELETE CASCADE handles this, but be explicit)
  await supabase.from('coupon_courses').delete().eq('coupon_id', id);
  await supabase.from('coupon_bundles').delete().eq('coupon_id', id);
  await supabase.from('coupon_batches').delete().eq('coupon_id', id);
  await supabase.from('coupon_webinars').delete().eq('coupon_id', id);
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'coupon_deleted', targetType: 'coupon', targetId: id, targetName: old.coupon_code, ip: getClientIp(req) });
  return ok(res, null, 'Coupon permanently deleted');
}
