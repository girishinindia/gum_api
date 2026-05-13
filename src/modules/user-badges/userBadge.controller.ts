import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'user_badges:all';
const clearCache = () => redis.del(CACHE_KEY);

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'earned_at' });

  let q = supabase.from('user_badges').select('*', { count: 'exact' });

  // Filters
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.badge_id) q = q.eq('badge_id', parseInt(req.query.badge_id as string));

  q = q.order(sort, { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Enrich with user name and badge name
  const userIds = [...new Set((data || []).map((ub: any) => ub.user_id).filter(Boolean))];
  const badgeIds = [...new Set((data || []).map((ub: any) => ub.badge_id).filter(Boolean))];

  let userMap: Record<number, string> = {};
  let badgeMap: Record<number, { name: string; icon_url: string | null; category: string }> = {};

  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, first_name, last_name, email').in('id', userIds);
    if (users) for (const u of users) userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  }

  if (badgeIds.length > 0) {
    const { data: badges } = await supabase.from('badges').select('id, name, icon_url, category').in('id', badgeIds);
    if (badges) for (const b of badges) badgeMap[b.id] = { name: b.name, icon_url: b.icon_url, category: b.category };
  }

  const enriched = (data || []).map((ub: any) => ({
    ...ub,
    user_name: userMap[ub.user_id] || null,
    badge_name: badgeMap[ub.badge_id]?.name || null,
    badge_icon_url: badgeMap[ub.badge_id]?.icon_url || null,
    badge_category: badgeMap[ub.badge_id]?.category || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

// ── GET BY ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('user_badges').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'User badge not found', 404);
  return ok(res, data);
}

// ── AWARD BADGE ──
export async function award(req: Request, res: Response) {
  const { user_id, badge_id, enrollment_id, metadata } = req.body;

  if (!user_id || !badge_id) {
    return err(res, 'user_id and badge_id are required', 400);
  }

  // Validate badge exists and is active
  const { data: badge } = await supabase.from('badges').select('id, name').eq('id', badge_id).eq('is_active', true).is('deleted_at', null).single();
  if (!badge) return err(res, 'Badge not found or inactive', 404);

  // Validate user exists
  const { data: user } = await supabase.from('users').select('id, first_name, last_name').eq('id', user_id).single();
  if (!user) return err(res, 'User not found', 404);

  // Check if already awarded (unique constraint)
  const { data: existing } = await supabase.from('user_badges').select('id').eq('user_id', user_id).eq('badge_id', badge_id).limit(1);
  if (existing && existing.length > 0) {
    return err(res, 'Badge already awarded to this user', 409);
  }

  const { data, error: e } = await supabase.from('user_badges').insert({
    user_id,
    badge_id,
    enrollment_id: enrollment_id || null,
    earned_at: new Date().toISOString(),
    metadata: metadata || {},
  }).select().single();

  if (e) {
    if (e.code === '23505') return err(res, 'Badge already awarded to this user', 409);
    return err(res, e.message, 500);
  }

  // Phase 13 — student_profiles dropped; total_badges_earned + xp_points counters no longer maintained.
  // user_badges (this table) and badges.xp_reward are the authoritative source.

  await clearCache();
  const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  logAdmin({ actorId: req.user!.id, action: 'user_badge_awarded', targetType: 'user_badge', targetId: data.id, targetName: `${badge.name} → ${userName}`, ip: getClientIp(req), metadata: { user_id, badge_id } });
  return ok(res, data, 'Badge awarded successfully', 201);
}

// ── BULK AWARD ──
export async function bulkAward(req: Request, res: Response) {
  const { badge_id, user_ids } = req.body;

  if (!badge_id || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return err(res, 'badge_id and user_ids array are required', 400);
  }

  if (user_ids.length > 100) return err(res, 'Maximum 100 users at once', 400);

  // Validate badge
  const { data: badge } = await supabase.from('badges').select('id, name, xp_reward').eq('id', badge_id).eq('is_active', true).is('deleted_at', null).single();
  if (!badge) return err(res, 'Badge not found or inactive', 404);

  // Check existing awards
  const { data: existing } = await supabase.from('user_badges').select('user_id').eq('badge_id', badge_id).in('user_id', user_ids);
  const alreadyAwarded = new Set((existing || []).map((e: any) => e.user_id));

  const awarded: any[] = [];
  const skipped: number[] = [];

  for (const userId of user_ids) {
    if (alreadyAwarded.has(userId)) {
      skipped.push(userId);
      continue;
    }

    const { data, error: e } = await supabase.from('user_badges').insert({
      user_id: userId,
      badge_id,
      earned_at: new Date().toISOString(),
      metadata: {},
    }).select().single();

    if (!e && data) {
      awarded.push(data);

      // Phase 13 — student_profiles dropped; no counter to bump.
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'user_badge_awarded', targetType: 'user_badge', targetId: badge_id, targetName: badge.name, ip: getClientIp(req), metadata: { awarded_count: awarded.length, skipped_count: skipped.length } });
  return ok(res, { awarded, skipped, awarded_count: awarded.length, skipped_count: skipped.length }, `${awarded.length} badge(s) awarded, ${skipped.length} skipped`);
}

// ── REMOVE BADGE FROM USER ──
export async function removeBadge(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: ub } = await supabase.from('user_badges').select('*').eq('id', id).single();
  if (!ub) return err(res, 'User badge not found', 404);

  const { error: e } = await supabase.from('user_badges').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  // Phase 13 — student_profiles dropped; no counter to decrement.

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'user_badge_removed', targetType: 'user_badge', targetId: id, targetName: `badge:${ub.badge_id} user:${ub.user_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Badge removed from user');
}

// ── GET USER'S BADGES ──
export async function getUserBadges(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);

  const { data, error: e } = await supabase
    .from('user_badges')
    .select('*, badges(id, name, slug, description, icon_url, category, xp_reward)')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });

  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}
