import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'blog_reviews';
const CACHE_KEY = 'blog_reviews:all';

const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

// ── RECALCULATE RATINGS on blog_posts ──
async function recalculateRatings(blogPostId: number) {
  const { data: reviews } = await supabase
    .from(TABLE)
    .select('rating')
    .eq('blog_post_id', blogPostId)
    .eq('status', 'published')
    .is('deleted_at', null);

  const count = reviews?.length || 0;
  const avg = count > 0
    ? parseFloat((reviews!.reduce((sum: number, r: any) => sum + r.rating, 0) / count).toFixed(2))
    : 0;

  await supabase
    .from('blog_posts')
    .update({ rating_average: avg, rating_count: count })
    .eq('id', blogPostId);
}

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['blog_post_id', 'user_id', 'rating', 'helpful_count', 'reported_count']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  delete body.id;
  delete body.created_at;
  delete body.updated_at;
  delete body.deleted_at;
  return body;
}

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select('*', { count: 'exact' });

  if (req.query.blog_post_id) q = q.eq('blog_post_id', parseInt(req.query.blog_post_id as string));
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.status) q = q.eq('status', req.query.status as string);
  if (req.query.rating) q = q.eq('rating', parseInt(req.query.rating as string));
  if (req.query.min_rating) q = q.gte('rating', parseInt(req.query.min_rating as string));
  if (req.query.max_rating) q = q.lte('rating', parseInt(req.query.max_rating as string));

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  if (search) {
    q = applySearch(q, search, { ilike: ['title', 'review_text'] });
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Enrich with user name and post title
  const userIds = [...new Set((data || []).map((r: any) => r.user_id).filter(Boolean))];
  const postIds = [...new Set((data || []).map((r: any) => r.blog_post_id).filter(Boolean))];
  let userMap: Record<number, string> = {};
  let postMap: Record<number, string> = {};

  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, first_name, last_name, email').in('id', userIds);
    if (users) for (const u of users) userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  }
  if (postIds.length > 0) {
    const { data: posts } = await supabase.from('blog_posts').select('id, title').in('id', postIds);
    if (posts) for (const p of posts) postMap[p.id] = p.title;
  }

  const enriched = (data || []).map((r: any) => ({
    ...r,
    user_name: userMap[r.user_id] || null,
    blog_post_title: postMap[r.blog_post_id] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

// ── GET BY ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Blog review not found', 404);

  // Enrich
  let userName = null;
  if (data.user_id) {
    const { data: u } = await supabase.from('users').select('first_name, last_name, email').eq('id', data.user_id).single();
    if (u) userName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  }
  let postTitle = null;
  if (data.blog_post_id) {
    const { data: p } = await supabase.from('blog_posts').select('title').eq('id', data.blog_post_id).single();
    if (p) postTitle = p.title;
  }

  return ok(res, { ...data, user_name: userName, blog_post_title: postTitle });
}

// ── CREATE ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (!body.blog_post_id || !body.user_id || !body.rating) {
    return err(res, 'blog_post_id, user_id, and rating are required', 400);
  }
  if (body.rating < 1 || body.rating > 5) {
    return err(res, 'Rating must be between 1 and 5', 400);
  }

  // blog_reviews has no created_by/updated_by columns — the reviewer lives in
  // user_id. Writing created_by caused "Could not find the 'created_by' column".

  const { data, error: e } = await supabase.from(TABLE).insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'User has already reviewed this blog post', 409);
    return err(res, e.message, 500);
  }

  // Recalculate ratings if published
  if (data.status === 'published') {
    await recalculateRatings(data.blog_post_id);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_review_created', targetType: 'blog_review', targetId: data.id, targetName: `Blog post:${data.blog_post_id} (${data.rating}★)`, ip: getClientIp(req) });
  return ok(res, data, 'Blog review created', 201);
}

// ── UPDATE ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: existing } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!existing) return err(res, 'Blog review not found', 404);

  const body = parseBody(req);
  // No updated_by column on blog_reviews.
  // Don't let them change user_id/blog_post_id
  delete body.user_id;
  delete body.blog_post_id;

  const { data, error: e } = await supabase.from(TABLE).update(body).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Recalculate if rating or status changed
  const ratingChanged = body.rating !== undefined && body.rating !== existing.rating;
  const statusChanged = body.status !== undefined && body.status !== existing.status;
  if (ratingChanged || statusChanged) {
    await recalculateRatings(existing.blog_post_id);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_review_updated', targetType: 'blog_review', targetId: id, targetName: `Review #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Blog review updated');
}

// ── CHANGE STATUS ──
export async function changeStatus(req: Request, res: Response) {
  const { status } = req.body;
  const validStatuses = ['pending', 'published', 'flagged', 'hidden'];
  if (!status || !validStatuses.includes(status)) {
    return err(res, `status must be one of: ${validStatuses.join(', ')}`, 400);
  }

  const { data: existing } = await supabase.from(TABLE).select('*').eq('id', req.params.id).single();
  if (!existing) return err(res, 'Blog review not found', 404);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await recalculateRatings(existing.blog_post_id);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_review_status_changed', targetType: 'blog_review', targetId: data.id, targetName: `Review #${data.id} → ${status}`, ip: getClientIp(req), metadata: { old_status: existing.status, new_status: status } });
  return ok(res, data, `Blog review status changed to ${status}`);
}

// ── SOFT DELETE ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: existing } = await supabase.from(TABLE).select('*').eq('id', id).is('deleted_at', null).single();
  if (!existing) return err(res, 'Blog review not found', 404);

  const { error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (e) return err(res, e.message, 500);

  await recalculateRatings(existing.blog_post_id);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_review_soft_deleted', targetType: 'blog_review', targetId: id, targetName: `Review #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Blog review moved to trash');
}

// ── RESTORE ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: existing } = await supabase.from(TABLE).select('*').eq('id', id).not('deleted_at', 'is', null).single();
  if (!existing) return err(res, 'Trashed blog review not found', 404);

  const { error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null })
    .eq('id', id);
  if (e) return err(res, e.message, 500);

  await recalculateRatings(existing.blog_post_id);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_review_restored', targetType: 'blog_review', targetId: id, targetName: `Review #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Blog review restored');
}

// ── PERMANENT DELETE ──
export async function permanentDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: existing } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!existing) return err(res, 'Blog review not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await recalculateRatings(existing.blog_post_id);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_review_deleted', targetType: 'blog_review', targetId: id, targetName: `Review #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Blog review permanently deleted');
}

// ── RECALCULATE RATINGS (admin trigger) ──
export async function triggerRecalculate(req: Request, res: Response) {
  const { blog_post_id } = req.body;
  if (!blog_post_id) return err(res, 'blog_post_id is required', 400);

  await recalculateRatings(parseInt(blog_post_id));

  logAdmin({ actorId: req.user!.id, action: 'blog_review_ratings_recalculated', targetType: 'blog_review', targetId: 0, targetName: `blog_post:${blog_post_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Blog ratings recalculated');
}

// ── STATS ──
export async function stats(req: Request, res: Response) {
  const blogPostId = req.query.blog_post_id ? parseInt(req.query.blog_post_id as string) : undefined;

  let q = supabase.from(TABLE).select('rating, status', { count: 'exact' }).is('deleted_at', null);
  if (blogPostId) q = q.eq('blog_post_id', blogPostId);

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
