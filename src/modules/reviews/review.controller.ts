import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';

const CACHE_KEY = 'reviews:all';
const clearCache = async () => { await redis.del(CACHE_KEY); };

// ── Map item_type → table + column names for rating recalculation ──
const RATING_TARGETS: Record<string, { table: string; avgCol: string; countCol: string }> = {
  course:     { table: 'courses',             avgCol: 'rating_average', countCol: 'rating_count' },
  batch:      { table: 'course_batches',      avgCol: 'rating_average', countCol: 'rating_count' },
  webinar:    { table: 'webinars',            avgCol: 'rating_average', countCol: 'rating_count' },
  bundle:     { table: 'bundles',             avgCol: 'rating_average', countCol: 'rating_count' },
  instructor: { table: 'instructor_profiles', avgCol: 'average_rating', countCol: 'total_reviews_received' },
};

// ── ITEM NAME LOOKUP ──
const ITEM_TABLES: Record<string, { table: string; nameCol: string }> = {
  course:     { table: 'courses',             nameCol: 'name' },
  batch:      { table: 'course_batches',      nameCol: 'batch_name' },
  webinar:    { table: 'webinars',            nameCol: 'title' },
  bundle:     { table: 'bundles',             nameCol: 'name' },
  instructor: { table: 'instructor_profiles', nameCol: 'user_id' }, // special — look up user name
};

async function getItemName(itemType: string, itemId: number): Promise<string | null> {
  const cfg = ITEM_TABLES[itemType];
  if (!cfg) return null;

  if (itemType === 'instructor') {
    const { data } = await supabase.from('instructor_profiles').select('user_id').eq('id', itemId).single();
    if (!data) return null;
    const { data: u } = await supabase.from('users').select('first_name, last_name, email').eq('id', data.user_id).single();
    return u ? (`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email) : null;
  }

  const { data } = await supabase.from(cfg.table).select(`id, ${cfg.nameCol}`).eq('id', itemId).single();
  return data ? (data as Record<string, any>)[cfg.nameCol] : null;
}

// ── RECALCULATE RATINGS ──
async function recalculateRatings(itemType: string, itemId: number) {
  const target = RATING_TARGETS[itemType];
  if (!target) return;

  // Only count published, non-deleted reviews
  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating')
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .eq('status', 'published')
    .is('deleted_at', null);

  const count = reviews?.length || 0;
  const avg = count > 0
    ? parseFloat((reviews!.reduce((sum: number, r: any) => sum + r.rating, 0) / count).toFixed(2))
    : 0;

  // For instructor_profiles, the id column IS the profile id
  const idCol = itemType === 'instructor' ? 'id' : 'id';

  await supabase
    .from(target.table)
    .update({ [target.avgCol]: avg, [target.countCol]: count })
    .eq(idCol, itemId);
}

// ── CHECK VERIFIED PURCHASE ──
async function checkVerifiedPurchase(userId: number, itemType: string, itemId: number): Promise<boolean> {
  if (itemType === 'instructor') return false; // no enrollment for instructor reviews

  const { data } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', userId)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1);

  return (data && data.length > 0) || false;
}

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_verified_purchase === 'string') body.is_verified_purchase = body.is_verified_purchase === 'true';
  for (const k of ['user_id', 'item_id', 'rating', 'helpful_count', 'reported_count']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  // Don't allow overriding auto-managed fields
  delete body.id;
  delete body.created_at;
  delete body.updated_at;
  delete body.deleted_at;
  return body;
}

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('reviews').select('*', { count: 'exact' });

  // Filters
  if (req.query.item_type) q = q.eq('item_type', req.query.item_type as string);
  if (req.query.item_id) q = q.eq('item_id', parseInt(req.query.item_id as string));
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.status) q = q.eq('status', req.query.status as string);
  if (req.query.rating) q = q.eq('rating', parseInt(req.query.rating as string));
  if (req.query.min_rating) q = q.gte('rating', parseInt(req.query.min_rating as string));
  if (req.query.max_rating) q = q.lte('rating', parseInt(req.query.max_rating as string));
  if (req.query.is_verified_purchase) q = q.eq('is_verified_purchase', req.query.is_verified_purchase === 'true');

  // Trash filter
  if (req.query.trashed === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Search across title and review_text
  if (search) {
    q = applySearch(q, search, { ilike: ['title', 'review_text'] });
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Enrich with user name and item name
  const userIds = [...new Set((data || []).map((r: any) => r.user_id).filter(Boolean))];
  let userMap: Record<number, string> = {};

  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, first_name, last_name, email').in('id', userIds);
    if (users) for (const u of users) userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  }

  // Group items by type for batch lookups
  const itemGroups: Record<string, number[]> = {};
  for (const r of (data || []) as any[]) {
    if (!itemGroups[r.item_type]) itemGroups[r.item_type] = [];
    if (!itemGroups[r.item_type].includes(r.item_id)) itemGroups[r.item_type].push(r.item_id);
  }

  const itemNameMap: Record<string, string> = {};
  for (const [type, ids] of Object.entries(itemGroups)) {
    for (const id of ids) {
      const name = await getItemName(type, id);
      if (name) itemNameMap[`${type}:${id}`] = name;
    }
  }

  const enriched = (data || []).map((r: any) => ({
    ...r,
    user_name: userMap[r.user_id] || null,
    item_name: itemNameMap[`${r.item_type}:${r.item_id}`] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

// ── GET BY ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('reviews').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Review not found', 404);

  // Enrich
  let userName = null;
  if (data.user_id) {
    const { data: u } = await supabase.from('users').select('first_name, last_name, email').eq('id', data.user_id).single();
    if (u) userName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  }
  const itemName = await getItemName(data.item_type, data.item_id);

  return ok(res, { ...data, user_name: userName, item_name: itemName });
}

// ── CREATE ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (!body.user_id || !body.item_type || !body.item_id || !body.rating) {
    return err(res, 'user_id, item_type, item_id, and rating are required', 400);
  }

  const validTypes = ['course', 'batch', 'webinar', 'bundle', 'instructor'];
  if (!validTypes.includes(body.item_type)) {
    return err(res, `item_type must be one of: ${validTypes.join(', ')}`, 400);
  }

  if (body.rating < 1 || body.rating > 5) {
    return err(res, 'Rating must be between 1 and 5', 400);
  }

  // Check verified purchase
  body.is_verified_purchase = await checkVerifiedPurchase(body.user_id, body.item_type, body.item_id);

  body.created_by = req.user!.id;
  body.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from('reviews').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'User has already reviewed this item', 409);
    return err(res, e.message, 500);
  }

  // Recalculate ratings on the target entity
  if (data.status === 'published') {
    await recalculateRatings(data.item_type, data.item_id);
  }

  await clearCache();
  const itemName = await getItemName(data.item_type, data.item_id);
  logAdmin({ actorId: req.user!.id, action: 'review_created', targetType: 'review', targetId: data.id, targetName: `${data.item_type}:${itemName || data.item_id} (${data.rating}★)`, ip: getClientIp(req) });
  return ok(res, data, 'Review created successfully', 201);
}

// ── UPDATE ──
export async function update(req: Request, res: Response) {
  const { data: existing } = await supabase.from('reviews').select('*').eq('id', req.params.id).single();
  if (!existing) return err(res, 'Review not found', 404);

  const body = parseBody(req);
  body.updated_by = req.user!.id;
  // Don't let them change user_id/item_type/item_id
  delete body.user_id;
  delete body.item_type;
  delete body.item_id;

  const { data, error: e } = await supabase.from('reviews').update(body).eq('id', req.params.id).select().single();
  if (e) return err(res, e.message, 500);

  // Recalculate if rating or status changed
  const ratingChanged = body.rating !== undefined && body.rating !== existing.rating;
  const statusChanged = body.status !== undefined && body.status !== existing.status;
  if (ratingChanged || statusChanged) {
    await recalculateRatings(existing.item_type, existing.item_id);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'review_updated', targetType: 'review', targetId: data.id, targetName: `Review #${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Review updated');
}

// ── CHANGE STATUS ──
export async function changeStatus(req: Request, res: Response) {
  const { status } = req.body;
  const validStatuses = ['pending', 'published', 'flagged', 'hidden'];
  if (!status || !validStatuses.includes(status)) {
    return err(res, `status must be one of: ${validStatuses.join(', ')}`, 400);
  }

  const { data: existing } = await supabase.from('reviews').select('*').eq('id', req.params.id).single();
  if (!existing) return err(res, 'Review not found', 404);

  const { data, error: e } = await supabase
    .from('reviews')
    .update({ status, updated_by: req.user!.id })
    .eq('id', req.params.id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Recalculate ratings when status changes (affects which reviews count)
  await recalculateRatings(existing.item_type, existing.item_id);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'review_status_changed', targetType: 'review', targetId: data.id, targetName: `Review #${data.id} → ${status}`, ip: getClientIp(req), metadata: { old_status: existing.status, new_status: status } });
  return ok(res, data, `Review status changed to ${status}`);
}

// ── SOFT DELETE ──
export async function softDelete(req: Request, res: Response) {
  const { data: existing } = await supabase.from('reviews').select('*').eq('id', req.params.id).is('deleted_at', null).single();
  if (!existing) return err(res, 'Review not found', 404);

  const { error: e } = await supabase
    .from('reviews')
    .update({ deleted_at: new Date().toISOString(), updated_by: req.user!.id })
    .eq('id', req.params.id);
  if (e) return err(res, e.message, 500);

  // Recalculate — soft-deleted review no longer counts
  await recalculateRatings(existing.item_type, existing.item_id);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'review_soft_deleted', targetType: 'review', targetId: existing.id, targetName: `Review #${existing.id}`, ip: getClientIp(req) });
  return ok(res, null, 'Review moved to trash');
}

// ── RESTORE ──
export async function restore(req: Request, res: Response) {
  const { data: existing } = await supabase.from('reviews').select('*').eq('id', req.params.id).not('deleted_at', 'is', null).single();
  if (!existing) return err(res, 'Trashed review not found', 404);

  const { error: e } = await supabase
    .from('reviews')
    .update({ deleted_at: null, updated_by: req.user!.id })
    .eq('id', req.params.id);
  if (e) return err(res, e.message, 500);

  // Recalculate — restored review now counts again
  await recalculateRatings(existing.item_type, existing.item_id);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'review_restored', targetType: 'review', targetId: existing.id, targetName: `Review #${existing.id}`, ip: getClientIp(req) });
  return ok(res, null, 'Review restored');
}

// ── PERMANENT DELETE ──
export async function permanentDelete(req: Request, res: Response) {
  const { data: existing } = await supabase.from('reviews').select('*').eq('id', req.params.id).single();
  if (!existing) return err(res, 'Review not found', 404);

  // review_helpfulness rows are CASCADE deleted
  const { error: e } = await supabase.from('reviews').delete().eq('id', req.params.id);
  if (e) return err(res, e.message, 500);

  // Recalculate
  await recalculateRatings(existing.item_type, existing.item_id);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'review_deleted', targetType: 'review', targetId: existing.id, targetName: `Review #${existing.id}`, ip: getClientIp(req) });
  return ok(res, null, 'Review permanently deleted');
}

// ── RECALCULATE RATINGS (admin trigger) ──
export async function triggerRecalculate(req: Request, res: Response) {
  const { item_type, item_id } = req.body;
  if (!item_type || !item_id) return err(res, 'item_type and item_id are required', 400);

  await recalculateRatings(item_type, parseInt(item_id));

  logAdmin({ actorId: req.user!.id, action: 'review_ratings_recalculated', targetType: 'review', targetId: 0, targetName: `${item_type}:${item_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Ratings recalculated');
}

// ── STATS (for dashboard) ──
export async function stats(req: Request, res: Response) {
  const itemType = req.query.item_type as string | undefined;
  const itemId = req.query.item_id ? parseInt(req.query.item_id as string) : undefined;

  let q = supabase.from('reviews').select('rating, status', { count: 'exact' }).is('deleted_at', null);
  if (itemType) q = q.eq('item_type', itemType);
  if (itemId) q = q.eq('item_id', itemId);

  const { data, count } = await q;
  if (!data) return ok(res, { total: 0, by_rating: {}, by_status: {} });

  const byRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byStatus: Record<string, number> = { pending: 0, published: 0, flagged: 0, hidden: 0 };

  for (const r of data) {
    byRating[r.rating] = (byRating[r.rating] || 0) + 1;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  const avgRating = data.length > 0
    ? parseFloat((data.reduce((s: number, r: any) => s + r.rating, 0) / data.length).toFixed(2))
    : 0;

  return ok(res, { total: count || 0, average_rating: avgRating, by_rating: byRating, by_status: byStatus });
}
