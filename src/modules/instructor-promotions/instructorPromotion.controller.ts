import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const CACHE_KEY = 'instructor_promotions:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  for (const k of ['is_active', 'requires_approval']) {
    if (typeof body[k] === 'string') body[k] = body[k] === 'true';
  }
  // Integer fields
  for (const k of ['instructor_id', 'usage_limit', 'usage_per_user', 'used_count', 'approved_by']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Numeric fields
  for (const k of ['discount_value', 'max_discount_amount', 'min_purchase_amount']) {
    if (typeof body[k] === 'string') body[k] = toNumOrNull(body[k]);
  }
  // Nullify empty strings
  for (const k of ['promotion_name', 'description', 'promo_code', 'discount_type', 'applicable_to', 'valid_from', 'valid_until', 'promotion_status', 'rejection_reason']) {
    if (body[k] === '') body[k] = null;
  }
  return body;
}

// GET /instructor-promotions
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('instructor_promotions').select('*', { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['promotion_name', 'promo_code', 'description'] });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
  if (req.query.promotion_status) q = q.eq('promotion_status', req.query.promotion_status as string);
  if (req.query.discount_type) q = q.eq('discount_type', req.query.discount_type as string);
  if (req.query.applicable_to) q = q.eq('applicable_to', req.query.applicable_to as string);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch instructor names
  const instructorIds = [...new Set((data || []).filter((p: any) => p.instructor_id).map((p: any) => p.instructor_id))];
  let instructorMap: Record<number, string> = {};
  if (instructorIds.length > 0) {
    const { data: instructors } = await supabase.from('users').select('id, full_name').in('id', instructorIds);
    if (instructors) {
      for (const i of instructors) instructorMap[i.id] = i.full_name;
    }
  }

  // Fetch approver names
  const approverIds = [...new Set((data || []).filter((p: any) => p.approved_by).map((p: any) => p.approved_by))];
  let approverMap: Record<number, string> = {};
  if (approverIds.length > 0) {
    const { data: approvers } = await supabase.from('users').select('id, full_name').in('id', approverIds);
    if (approvers) {
      for (const a of approvers) approverMap[a.id] = a.full_name;
    }
  }

  // Fetch course count per promotion
  const promoIds = (data || []).map((p: any) => p.id);
  let courseCountMap: Record<number, number> = {};
  if (promoIds.length > 0) {
    const { data: courses } = await supabase.from('instructor_promotion_courses').select('promotion_id').in('promotion_id', promoIds).is('deleted_at', null);
    if (courses) {
      for (const c of courses) {
        courseCountMap[c.promotion_id] = (courseCountMap[c.promotion_id] || 0) + 1;
      }
    }
  }

  const enriched = (data || []).map((p: any) => ({
    ...p,
    instructor_name: p.instructor_id ? instructorMap[p.instructor_id] || null : null,
    approver_name: p.approved_by ? approverMap[p.approved_by] || null : null,
    course_count: courseCountMap[p.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

// GET /instructor-promotions/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('instructor_promotions').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Instructor promotion not found', 404);
  return ok(res, data);
}

// POST /instructor-promotions
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'instructor_promotion', 'activate')) {
    return err(res, 'Permission denied: instructor_promotion:activate required to create inactive', 403);
  }

  body.created_by = req.user!.id;

  // Auto-generate promo_code if not provided (use slug-style format)
  if (!body.promo_code && body.promotion_name) {
    const base = body.promotion_name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    let candidate = base;
    let counter = 1;
    while (true) {
      const { data: existing } = await supabase.from('instructor_promotions').select('id').ilike('promo_code', candidate).limit(1);
      if (!existing || existing.length === 0) break;
      counter++;
      candidate = `${base}_${counter}`;
    }
    body.promo_code = candidate;
  }

  const { data, error: e } = await supabase.from('instructor_promotions').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Promo code already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_created', targetType: 'instructor_promotion', targetId: data.id, targetName: data.promotion_name || data.promo_code, ip: getClientIp(req) });
  return ok(res, data, 'Instructor promotion created', 201);
}

// PATCH /instructor-promotions/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_promotions').select('*').eq('id', id).single();
  if (!old) return err(res, 'Instructor promotion not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'instructor_promotion', 'activate')) {
      return err(res, 'Permission denied: instructor_promotion:activate required to change active status', 403);
    }
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('instructor_promotions').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Promo code already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_updated', targetType: 'instructor_promotion', targetId: id, targetName: data.promotion_name || data.promo_code, changes, ip: getClientIp(req) });
  return ok(res, data, 'Instructor promotion updated');
}

// PATCH /instructor-promotions/:id/approve
export async function approve(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_promotions').select('*').eq('id', id).single();
  if (!old) return err(res, 'Instructor promotion not found', 404);
  if (old.promotion_status !== 'pending_approval') return err(res, 'Only pending promotions can be approved', 400);

  const { data, error: e } = await supabase.from('instructor_promotions').update({
    promotion_status: 'active',
    approved_by: req.user!.id,
    approved_at: new Date().toISOString(),
    updated_by: req.user!.id,
  }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_approved', targetType: 'instructor_promotion', targetId: id, targetName: old.promotion_name || old.promo_code, ip: getClientIp(req) });
  return ok(res, data, 'Instructor promotion approved');
}

// PATCH /instructor-promotions/:id/reject
export async function reject(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_promotions').select('*').eq('id', id).single();
  if (!old) return err(res, 'Instructor promotion not found', 404);
  if (old.promotion_status !== 'pending_approval') return err(res, 'Only pending promotions can be rejected', 400);

  const { rejection_reason } = req.body;

  const { data, error: e } = await supabase.from('instructor_promotions').update({
    promotion_status: 'rejected',
    rejection_reason: rejection_reason || null,
    approved_by: req.user!.id,
    approved_at: new Date().toISOString(),
    updated_by: req.user!.id,
  }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_rejected', targetType: 'instructor_promotion', targetId: id, targetName: old.promotion_name || old.promo_code, ip: getClientIp(req) });
  return ok(res, data, 'Instructor promotion rejected');
}

// DELETE /instructor-promotions/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_promotions').select('promotion_name, promo_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Instructor promotion not found', 404);
  if (old.deleted_at) return err(res, 'Promotion is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('instructor_promotions')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to promotion courses
  await supabase.from('instructor_promotion_courses').update({ deleted_at: now, is_active: false }).eq('promotion_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_soft_deleted', targetType: 'instructor_promotion', targetId: id, targetName: old.promotion_name || old.promo_code, ip: getClientIp(req) });
  return ok(res, data, 'Instructor promotion moved to trash');
}

// PATCH /instructor-promotions/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_promotions').select('promotion_name, promo_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Instructor promotion not found', 404);
  if (!old.deleted_at) return err(res, 'Promotion is not in trash', 400);

  const { data, error: e } = await supabase
    .from('instructor_promotions')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore promotion courses
  await supabase.from('instructor_promotion_courses').update({ deleted_at: null, is_active: true }).eq('promotion_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_restored', targetType: 'instructor_promotion', targetId: id, targetName: old.promotion_name || old.promo_code, ip: getClientIp(req) });
  return ok(res, data, 'Instructor promotion restored');
}

// DELETE /instructor-promotions/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('instructor_promotions').select('promotion_name, promo_code').eq('id', id).single();
    if (!old) return err(res, 'Instructor promotion not found', 404);

    // Cascade permanent delete: bottom-up
    // 1. Delete promotion courses (leaf)
    await supabase.from('instructor_promotion_courses').delete().eq('promotion_id', id);

    // 2. Delete the promotion itself
    const { error: e } = await supabase.from('instructor_promotions').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'instructor_promotion_deleted', targetType: 'instructor_promotion', targetId: id, targetName: old.promotion_name || old.promo_code, ip: getClientIp(req) });
    return ok(res, null, 'Instructor promotion permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete promotion', 500);
  }
}
