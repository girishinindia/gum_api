import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'review_helpfulness:all';
const clearCache = async () => { await redis.del(CACHE_KEY); };

// Update the helpful_count on the review after any vote change
async function updateHelpfulCount(reviewId: number) {
  const { data } = await supabase
    .from('review_helpfulness')
    .select('is_helpful')
    .eq('review_id', reviewId);

  const helpfulCount = (data || []).filter((v: any) => v.is_helpful === true).length;

  await supabase
    .from('reviews')
    .update({ helpful_count: helpfulCount })
    .eq('id', reviewId);
}

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('review_helpfulness').select('*', { count: 'exact' });

  if (req.query.review_id) q = q.eq('review_id', parseInt(req.query.review_id as string));
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.is_helpful !== undefined) q = q.eq('is_helpful', req.query.is_helpful === 'true');

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Enrich with user name
  const userIds = [...new Set((data || []).map((v: any) => v.user_id).filter(Boolean))];
  let userMap: Record<number, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, first_name, last_name, email').in('id', userIds);
    if (users) for (const u of users) userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  }

  const enriched = (data || []).map((v: any) => ({
    ...v,
    user_name: userMap[v.user_id] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

// ── GET BY ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('review_helpfulness').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Helpfulness vote not found', 404);
  return ok(res, data);
}

// ── VOTE (create or toggle) ──
export async function vote(req: Request, res: Response) {
  const { review_id, user_id, is_helpful } = req.body;

  if (!review_id || !user_id || is_helpful === undefined) {
    return err(res, 'review_id, user_id, and is_helpful are required', 400);
  }

  // Check review exists
  const { data: review } = await supabase.from('reviews').select('id').eq('id', review_id).single();
  if (!review) return err(res, 'Review not found', 404);

  // Upsert: update if exists, insert if new
  const { data: existing } = await supabase
    .from('review_helpfulness')
    .select('id')
    .eq('review_id', review_id)
    .eq('user_id', user_id)
    .single();

  let data: any;
  if (existing) {
    const { data: updated, error: e } = await supabase
      .from('review_helpfulness')
      .update({ is_helpful })
      .eq('id', existing.id)
      .select()
      .single();
    if (e) return err(res, e.message, 500);
    data = updated;
  } else {
    const { data: inserted, error: e } = await supabase
      .from('review_helpfulness')
      .insert({ review_id, user_id, is_helpful })
      .select()
      .single();
    if (e) {
      if (e.code === '23505') return err(res, 'User already voted on this review', 409);
      return err(res, e.message, 500);
    }
    data = inserted;
  }

  await updateHelpfulCount(review_id);
  await clearCache();

  logAdmin({ actorId: req.user!.id, action: 'review_helpfulness_created', targetType: 'review_helpfulness', targetId: data.id, targetName: `Review #${review_id} ${is_helpful ? 'helpful' : 'not helpful'}`, ip: getClientIp(req) });
  return ok(res, data, existing ? 'Vote updated' : 'Vote recorded', existing ? 200 : 201);
}

// ── DELETE VOTE ──
export async function deleteVote(req: Request, res: Response) {
  const { data: existing } = await supabase.from('review_helpfulness').select('*').eq('id', req.params.id).single();
  if (!existing) return err(res, 'Vote not found', 404);

  const { error: e } = await supabase.from('review_helpfulness').delete().eq('id', req.params.id);
  if (e) return err(res, e.message, 500);

  await updateHelpfulCount(existing.review_id);
  await clearCache();

  logAdmin({ actorId: req.user!.id, action: 'review_helpfulness_deleted', targetType: 'review_helpfulness', targetId: existing.id, targetName: `Vote on Review #${existing.review_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Vote removed');
}
