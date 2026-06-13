import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';
import { recalculateRatings, checkVerifiedPurchase } from '../reviews/review.controller';

/**
 * Public / student-facing review endpoints.
 *
 * Unlike the admin `/reviews` routes (which require review:* permissions),
 * these are open to any visitor (read) or any signed-in user (write), and a
 * write is scoped *strictly to the caller's own single review* for an item.
 * This is what lets students on gum_web read and post reviews without holding
 * admin permissions.
 */

const VALID_ITEM_TYPES = ['course', 'batch', 'webinar', 'bundle', 'instructor', 'blog', 'live_session', 'podcast'];

// ── GET /public-reviews?item_type=&item_id=&limit=&offset= ── (public)
export async function listForItem(req: Request, res: Response) {
  const item_type = req.query.item_type as string;
  const item_id = parseInt(req.query.item_id as string);
  if (!item_type || !VALID_ITEM_TYPES.includes(item_type) || !item_id) {
    return err(res, 'valid item_type and item_id are required', 400);
  }
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const offset = parseInt(req.query.offset as string) || 0;

  const { data: rows, error: e } = await supabase
    .from('reviews')
    .select('id, user_id, rating, title, review_text, is_verified_purchase, helpful_count, created_at')
    .eq('item_type', item_type)
    .eq('item_id', item_id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (e) return err(res, e.message, 500);

  // Reviewer name + avatar
  const userIds = [...new Set((rows || []).map((r: any) => r.user_id).filter(Boolean))];
  const userMap: Record<number, { name: string; image: string | null }> = {};
  if (userIds.length) {
    // BUG-66: registered users populate first_name/last_name, not full_name, so
    // the reviewer name fell through to 'User'. Compose from whichever exists;
    // drop email from the public-facing display for privacy.
    const { data: users } = await supabase.from('users').select('id, full_name, display_name, first_name, last_name, profile_image_url').in('id', userIds);
    if (users) for (const u of users as any[]) {
      // BUG-66: resolve the reviewer's real name from whichever field is set —
      // full_name, then the user's chosen display_name, then first+last — only
      // falling back to the generic "User" when none exist.
      const name = (u.full_name && u.full_name.trim())
        || (u.display_name && u.display_name.trim())
        || [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
        || 'User';
      userMap[u.id] = { name, image: u.profile_image_url || null };
    }
  }
  const reviews = (rows || []).map((r: any) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    review_text: r.review_text,
    is_verified_purchase: r.is_verified_purchase,
    helpful_count: r.helpful_count,
    created_at: r.created_at,
    reviewer_name: userMap[r.user_id]?.name || 'User',
    reviewer_image: userMap[r.user_id]?.image || null,
  }));

  // Summary across ALL published reviews for the item (not just this page)
  const { data: allRatings } = await supabase
    .from('reviews')
    .select('rating')
    .eq('item_type', item_type)
    .eq('item_id', item_id)
    .eq('status', 'published')
    .is('deleted_at', null);

  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of (allRatings || []) as any[]) { breakdown[r.rating] = (breakdown[r.rating] || 0) + 1; sum += r.rating; }
  const total = (allRatings || []).length;
  const average = total > 0 ? parseFloat((sum / total).toFixed(2)) : 0;

  return ok(res, { summary: { average, total, breakdown }, reviews });
}

// ── GET /public-reviews/mine?item_type=&item_id= ── (auth)
export async function myReview(req: Request, res: Response) {
  const item_type = req.query.item_type as string;
  const item_id = parseInt(req.query.item_id as string);
  if (!item_type || !item_id) return err(res, 'item_type and item_id are required', 400);

  const { data } = await supabase
    .from('reviews')
    .select('id, rating, title, review_text, status, is_verified_purchase, created_at')
    .eq('user_id', req.user!.id)
    .eq('item_type', item_type)
    .eq('item_id', item_id)
    .is('deleted_at', null)
    .maybeSingle();

  return ok(res, data || null);
}

// ── POST /public-reviews  { item_type, item_id, rating, title?, review_text? } ── (auth, upsert own)
export async function upsertOwn(req: Request, res: Response) {
  const userId = req.user!.id;
  const item_type = req.body.item_type as string;
  const item_id = parseInt(req.body.item_id);
  const rating = parseInt(req.body.rating);
  const title = (req.body.title ? String(req.body.title).trim() : '') || null;
  const review_text = (req.body.review_text ? String(req.body.review_text).trim() : '') || null;

  if (!item_type || !VALID_ITEM_TYPES.includes(item_type) || !item_id) {
    return err(res, 'valid item_type and item_id are required', 400);
  }
  if (!rating || rating < 1 || rating > 5) return err(res, 'Rating must be between 1 and 5', 400);

  const is_verified_purchase = await checkVerifiedPurchase(userId, item_type, item_id);

  // One review per user per item — update the existing row, else insert.
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', userId)
    .eq('item_type', item_type)
    .eq('item_id', item_id)
    .maybeSingle();

  let saved: any;
  if (existing) {
    const { data, error: e } = await supabase
      .from('reviews')
      .update({ rating, title, review_text, is_verified_purchase, status: 'published', deleted_at: null, updated_by: userId })
      .eq('id', existing.id)
      .select()
      .single();
    if (e) return err(res, e.message, 500);
    saved = data;
  } else {
    const { data, error: e } = await supabase
      .from('reviews')
      .insert({ user_id: userId, item_type, item_id, rating, title, review_text, is_verified_purchase, status: 'published', created_by: userId, updated_by: userId })
      .select()
      .single();
    if (e) {
      if (e.code === '23505') return err(res, 'You have already reviewed this item', 409);
      return err(res, e.message, 500);
    }
    saved = data;
  }

  await recalculateRatings(item_type, item_id);
  return ok(res, saved, 'Review saved', existing ? 200 : 201);
}

// ── DELETE /public-reviews/mine?item_type=&item_id= ── (auth, own only)
export async function deleteOwn(req: Request, res: Response) {
  const userId = req.user!.id;
  const item_type = req.query.item_type as string;
  const item_id = parseInt(req.query.item_id as string);
  if (!item_type || !item_id) return err(res, 'item_type and item_id are required', 400);

  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', userId)
    .eq('item_type', item_type)
    .eq('item_id', item_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) return err(res, 'Review not found', 404);

  const { error: e } = await supabase
    .from('reviews')
    .update({ deleted_at: new Date().toISOString(), updated_by: userId })
    .eq('id', existing.id);
  if (e) return err(res, e.message, 500);

  await recalculateRatings(item_type, item_id);
  return ok(res, null, 'Review removed');
}
