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
  // Phase 48 — the admin form posts back the whole enriched row, which carries
  // computed/joined fields that are NOT real columns (instructor_name,
  // approver_name, course_count) plus immutable ones. Strip them so the
  // update/insert doesn't fail with "Could not find the 'approver_name' column".
  for (const k of ['instructor_name', 'approver_name', 'course_count', 'id', 'created_at', 'updated_at']) {
    delete body[k];
  }
  return body;
}

// Phase 47 — promotion validation. Previously there was NO validation, so the
// admin form accepted 100%+ discounts, negative usage limits, and absurd dates
// (e.g. year 0022) that later rendered as "Invalid Date". Enforced here as the
// authoritative guard; the portal mirrors these checks for instant feedback.
//   • discount: percentage 1–100 (100% = free is allowed); fixed > 0 and not
//     greater than the min-purchase amount (would make the price negative)
//   • max_discount_amount / min_purchase_amount: not negative
//   • usage_limit / usage_per_user: whole number ≥ 1 when set (empty = unlimited);
//     per-user cannot exceed the total limit
//   • dates: valid, year 2000–2100, valid_until strictly after valid_from, and
//     valid_from today-or-future when it is being created/changed
function validatePromotion(
  body: any,
  old: any = {},
  opts: { checkFutureFrom?: boolean } = {},
): string | null {
  const merged = { ...old, ...body };
  const dtype = merged.discount_type || 'percentage';
  const isFixed = dtype === 'fixed' || dtype === 'fixed_amount';
  const dval = merged.discount_value;

  if (dval !== undefined && dval !== null) {
    if (typeof dval !== 'number' || Number.isNaN(dval)) return 'Discount value must be a number';
    if (dval <= 0) return 'Discount value must be greater than 0';
    if (!isFixed && dval > 100) return 'Percentage discount cannot exceed 100%';
  }

  for (const [k, label] of [['max_discount_amount', 'Max discount amount'], ['min_purchase_amount', 'Min purchase amount']] as const) {
    const v = merged[k];
    if (v !== undefined && v !== null && (typeof v !== 'number' || v < 0)) return `${label} cannot be negative`;
  }

  if (isFixed && dval != null && merged.min_purchase_amount != null && dval > merged.min_purchase_amount) {
    return 'Fixed discount cannot exceed the minimum purchase amount';
  }

  for (const [k, label] of [['usage_limit', 'Usage limit'], ['usage_per_user', 'Usage per user']] as const) {
    const v = merged[k];
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 1)) {
      return `${label} must be a whole number of at least 1 (leave empty for unlimited)`;
    }
  }
  if (merged.usage_limit != null && merged.usage_per_user != null && merged.usage_per_user > merged.usage_limit) {
    return 'Usage per user cannot exceed the total usage limit';
  }

  const from = merged.valid_from ? new Date(merged.valid_from) : null;
  const until = merged.valid_until ? new Date(merged.valid_until) : null;
  if (merged.valid_from && (!from || Number.isNaN(from.getTime()))) return 'Valid From is not a valid date';
  if (merged.valid_until && (!until || Number.isNaN(until.getTime()))) return 'Valid Until is not a valid date';
  const yearOk = (d: Date) => d.getFullYear() >= 2000 && d.getFullYear() <= 2100;
  if (from && !yearOk(from)) return 'Valid From year must be between 2000 and 2100';
  if (until && !yearOk(until)) return 'Valid Until year must be between 2000 and 2100';
  if (from && until && until <= from) return 'Valid Until must be after Valid From';
  if (opts.checkFutureFrom && from) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (from < startOfToday) return 'Valid From must be today or a future date';
  }
  return null;
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

  // BUG-35 (June 2026): filter by course via the junction table so the public
  // course page can show its promo banner.
  if (req.query.course_id) {
    const { data: links } = await supabase
      .from('instructor_promotion_courses')
      .select('promotion_id')
      .eq('course_id', parseInt(req.query.course_id as string))
      .eq('is_active', true)
      .is('deleted_at', null);
    const ids = (links || []).map((l: any) => l.promotion_id);
    if (!ids.length) return paginated(res, [], 0, page, limit);
    q = q.in('id', ids);
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

  const vErr = validatePromotion(body, {}, { checkFutureFrom: !!body.valid_from });
  if (vErr) return err(res, vErr, 400);

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

  const vErr = validatePromotion(updates, old, {
    checkFutureFrom: updates.valid_from !== undefined && updates.valid_from !== old.valid_from,
  });
  if (vErr) return err(res, vErr, 400);

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
