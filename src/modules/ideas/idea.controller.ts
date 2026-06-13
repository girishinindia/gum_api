import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { ok, err, paginated } from '../../utils/response';
import { generateUniqueSlug, getClientIp } from '../../utils/helpers';
import { sendNotification } from '../../services/notification.service';
import { creditWallet } from '../../services/wallet.service';
import { processAndUploadImage, uploadRawFile } from '../../services/storage.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * "Submit Your Idea & Get Reward" (June 2026).
 * Students & instructors submit ideas; admins review, reward (→ GUM Wallet
 * credit via the atomic fn_wallet_credit rail) and offer partnerships.
 * Every status change is logged to idea_status_logs with a remark.
 */

const STATUSES = [
  'submitted', 'under_review', 'shortlisted', 'need_more_details', 'approved', 'rejected',
  'planned_for_implementation', 'in_progress', 'implemented', 'rewarded', 'partnership_offered', 'closed',
] as const;

/** Owner may edit/delete only while the idea is still in review. */
const EDITABLE_STATUSES = ['submitted', 'under_review', 'shortlisted', 'need_more_details'];
/** An idea may only be shown publicly once it has cleared review. */
const PUBLICABLE_STATUSES = ['approved', 'planned_for_implementation', 'in_progress', 'implemented', 'rewarded', 'partnership_offered', 'closed'];

const OWNER_FIELDS = [
  'category_id', 'title', 'short_summary', 'description', 'problem_statement', 'proposed_solution',
  'target_users', 'expected_benefit', 'usefulness_reason', 'tags', 'interested_as_partner', 'expected_reward_note',
] as const;

const PUBLIC_SELECT = `id, title, slug, short_summary, status, tags, views_count, likes_count, user_type, created_at,
  idea_categories(id, name, slug, icon),
  users!ideas_user_id_fkey(first_name),
  idea_rewards(reward_status),
  idea_partnerships(partnership_status)`;

function ownerBody(req: Request): any {
  const b: any = {};
  for (const k of OWNER_FIELDS) if (req.body[k] !== undefined) b[k] = req.body[k];
  if (b.category_id !== undefined) b.category_id = parseInt(b.category_id) || null;
  if (typeof b.interested_as_partner === 'string') b.interested_as_partner = b.interested_as_partner === 'true';
  if (typeof b.tags === 'string') { try { b.tags = JSON.parse(b.tags); } catch { b.tags = []; } }
  if (Array.isArray(b.tags)) b.tags = b.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 10);
  return b;
}

function validateIdea(b: any, partial = false): string | null {
  if (!partial || b.title !== undefined) {
    if (!b.title || String(b.title).trim().length < 10) return 'Title is required (minimum 10 characters)';
  }
  if (!partial || b.description !== undefined) {
    if (!b.description || String(b.description).trim().length < 50) return 'Detailed description is required (minimum 50 characters)';
  }
  if (!partial && !b.category_id) return 'Category is required';
  return null;
}

async function detectUserType(userId: number): Promise<'student' | 'instructor'> {
  const { data } = await supabase
    .from('user_roles')
    .select('role_id, roles!inner(name)')
    .eq('user_id', userId)
    .eq('is_active', true);
  return (data || []).some((r: any) => r.roles?.name === 'instructor') ? 'instructor' : 'student';
}

async function logStatus(ideaId: number, oldStatus: string | null, newStatus: string, changedBy: number | null, remark?: string | null) {
  await supabase.from('idea_status_logs').insert({ idea_id: ideaId, old_status: oldStatus, new_status: newStatus, changed_by: changedBy, remark: remark || null });
}

async function notifyOwner(idea: { id: number; user_id: number; title: string }, title: string, message: string, type = 'idea_update') {
  await sendNotification({
    userId: idea.user_id, notificationType: type, title, message,
    channels: ['in_app', 'email'], referenceType: 'idea', referenceId: idea.id,
  }).catch(() => {});
}

async function notifyAdminsNewIdea(idea: { id: number; title: string; user_type: string }) {
  try {
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id, roles!inner(level)')
      .eq('is_active', true)
      .gte('roles.level', 80);
    const ids = [...new Set((admins || []).map((a: any) => a.user_id))];
    for (const id of ids) {
      await sendNotification({
        userId: id, notificationType: 'idea_submitted',
        title: 'New idea submitted',
        message: `A ${idea.user_type} submitted "${idea.title}" — review it in Idea Management.`,
        channels: ['in_app'], referenceType: 'idea', referenceId: idea.id,
      }).catch(() => {});
    }
  } catch { /* best-effort */ }
}

const badgeFlags = (row: any) => ({
  is_rewarded: (row.idea_rewards || []).some((r: any) => r.reward_status === 'paid'),
  has_partnership: (row.idea_partnerships || []).some((p: any) => ['offered', 'accepted', 'completed'].includes(p.partnership_status)),
});

// ════════════════ PUBLIC ════════════════

// GET /ideas/public?category=slug&q=&sort=latest|popular|views
export async function publicList(req: Request, res: Response) {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 12, 1), 50);
    const offset = (page - 1) * limit;

    let q = supabase.from('ideas')
      .select(PUBLIC_SELECT, { count: 'exact' })
      .eq('is_public', true).eq('is_active', true).is('deleted_at', null);

    if (req.query.category) q = q.eq('idea_categories.slug', String(req.query.category));
    if (req.query.q) q = q.ilike('title', `%${String(req.query.q).replace(/[%_]/g, '')}%`);

    const sort = String(req.query.sort || 'latest');
    if (sort === 'popular') q = q.order('likes_count', { ascending: false });
    else if (sort === 'views') q = q.order('views_count', { ascending: false });
    else q = q.order('created_at', { ascending: false });

    const { data, count, error: e } = await q.range(offset, offset + limit - 1);
    if (e) return err(res, e.message, 500);

    const rows = (data || []).map((r: any) => ({ ...r, ...badgeFlags(r), idea_rewards: undefined, idea_partnerships: undefined }));
    return paginated(res, rows, count || 0, page, limit);
  } catch (e: any) { return err(res, e.message, 500); }
}

// BUG-79: only count a view once per viewer per idea within a TTL window.
// Viewer key = authed user id (if optionalAuth resolved one), else a hash of IP+UA.
// Best-effort: any Redis failure falls through to counting the view (never blocks the page).
const VIEW_DEDUP_TTL_SECONDS = 6 * 60 * 60; // 6h
async function shouldCountView(req: Request, ideaId: number): Promise<boolean> {
  try {
    const viewer = req.user?.id
      ? `u${req.user.id}`
      : createHash('sha256').update(`${getClientIp(req) || 'unknown'}|${req.headers['user-agent'] || ''}`).digest('hex').slice(0, 32);
    // SET NX → returns 'OK' only when the key was new; null when it already exists.
    const set = await redis.set(`idea:view:${ideaId}:${viewer}`, '1', 'EX', VIEW_DEDUP_TTL_SECONDS, 'NX');
    return set === 'OK';
  } catch {
    return true; // Redis down — degrade to counting the view rather than dropping it.
  }
}

// GET /ideas/public/:slug
export async function publicBySlug(req: Request, res: Response) {
  try {
    const { data, error: e } = await supabase.from('ideas')
      .select(`${PUBLIC_SELECT}, problem_statement, proposed_solution, expected_benefit, target_users`)
      .eq('slug', String(req.params.slug))
      .eq('is_public', true).eq('is_active', true).is('deleted_at', null)
      .maybeSingle();
    if (e) return err(res, e.message, 500);
    if (!data) return err(res, 'Idea not found', 404);

    // BUG-79: fire-and-forget view counter, deduped per viewer per idea (6h TTL).
    shouldCountView(req, (data as any).id).then((count) => {
      if (count) supabase.from('ideas').update({ views_count: ((data as any).views_count || 0) + 1 }).eq('id', (data as any).id).then(() => {});
    }).catch(() => {});

    return ok(res, { ...(data as any), ...badgeFlags(data), idea_rewards: undefined, idea_partnerships: undefined });
  } catch (e: any) { return err(res, e.message, 500); }
}

// ════════════════ SELF-SERVE (owner) ════════════════

// POST /ideas
export async function submit(req: Request, res: Response) {
  try {
    const body = ownerBody(req);
    const v = validateIdea(body);
    if (v) return err(res, v, 400);

    const { data: cat } = await supabase.from('idea_categories').select('id').eq('id', body.category_id).eq('is_active', true).is('deleted_at', null).maybeSingle();
    if (!cat) return err(res, 'Invalid category', 400);

    const user_type = await detectUserType(req.user!.id);
    const slug = await generateUniqueSlug(supabase, 'ideas', body.title);

    const { data, error: e } = await supabase.from('ideas').insert({
      ...body, user_id: req.user!.id, user_type, slug, status: 'submitted',
    }).select('*').single();
    if (e) return err(res, e.message, 500);

    await logStatus(data.id, null, 'submitted', req.user!.id, 'Idea submitted');
    notifyAdminsNewIdea(data);
    return ok(res, data, 'Idea submitted! Our team will review it — you will be notified of every update.', 201);
  } catch (e: any) { return err(res, e.message, 500); }
}

// GET /ideas/me
export async function listMine(req: Request, res: Response) {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = (page - 1) * limit;

    const { data, count, error: e } = await supabase.from('ideas')
      .select('id, title, slug, status, is_public, likes_count, views_count, created_at, idea_categories(name, icon), idea_rewards(reward_status, reward_amount), idea_partnerships(partnership_status, partnership_type)', { count: 'exact' })
      .eq('user_id', req.user!.id).is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) { return err(res, e.message, 500); }
}

async function ownIdea(id: number, userId: number) {
  const { data } = await supabase.from('ideas').select('*').eq('id', id).eq('user_id', userId).is('deleted_at', null).maybeSingle();
  return data || null;
}

// GET /ideas/me/:id — idea + timeline + visible feedback + reward + partnership
export async function getMine(req: Request, res: Response) {
  try {
    const idea = await ownIdea(parseInt(req.params.id), req.user!.id);
    if (!idea) return err(res, 'Idea not found', 404);

    const [logs, feedback, rewards, partnerships, category] = await Promise.all([
      supabase.from('idea_status_logs').select('old_status, new_status, remark, created_at').eq('idea_id', idea.id).order('created_at'),
      supabase.from('idea_feedbacks').select('message, created_at').eq('idea_id', idea.id).eq('is_visible_to_user', true).order('created_at'),
      supabase.from('idea_rewards').select('reward_amount, reward_currency, reward_status, reward_note, reward_payment_date, created_at').eq('idea_id', idea.id).order('created_at'),
      supabase.from('idea_partnerships').select('partnership_status, partnership_type, partnership_note, offered_at, responded_at').eq('idea_id', idea.id).order('created_at'),
      idea.category_id ? supabase.from('idea_categories').select('name, icon, slug').eq('id', idea.category_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    return ok(res, {
      ...idea,
      category: (category as any).data,
      timeline: logs.data || [],
      feedback: feedback.data || [],
      rewards: rewards.data || [],
      partnerships: partnerships.data || [],
      can_edit: EDITABLE_STATUSES.includes(idea.status),
    });
  } catch (e: any) { return err(res, e.message, 500); }
}

// PATCH /ideas/me/:id — only while still in review
export async function updateMine(req: Request, res: Response) {
  try {
    const idea = await ownIdea(parseInt(req.params.id), req.user!.id);
    if (!idea) return err(res, 'Idea not found', 404);
    if (!EDITABLE_STATUSES.includes(idea.status)) {
      return err(res, `This idea is ${idea.status.replace(/_/g, ' ')} and can no longer be edited. Contact support if a change is essential.`, 400);
    }

    const body = ownerBody(req);
    const v = validateIdea(body, true);
    if (v) return err(res, v, 400);
    if (body.category_id) {
      const { data: cat } = await supabase.from('idea_categories').select('id').eq('id', body.category_id).eq('is_active', true).is('deleted_at', null).maybeSingle();
      if (!cat) return err(res, 'Invalid category', 400);
    }
    (body as any).updated_at = new Date().toISOString();

    const { data, error: e } = await supabase.from('ideas').update(body).eq('id', idea.id).select('*').single();
    if (e) return err(res, e.message, 500);
    return ok(res, data, 'Idea updated');
  } catch (e: any) { return err(res, e.message, 500); }
}

// DELETE /ideas/me/:id (soft) — only while still in review
export async function deleteMine(req: Request, res: Response) {
  try {
    const idea = await ownIdea(parseInt(req.params.id), req.user!.id);
    if (!idea) return err(res, 'Idea not found', 404);
    if (!EDITABLE_STATUSES.includes(idea.status)) return err(res, 'Reviewed ideas cannot be withdrawn — contact support.', 400);

    await supabase.from('ideas').update({ deleted_at: new Date().toISOString(), is_active: false, is_public: false }).eq('id', idea.id);
    return ok(res, { id: idea.id }, 'Idea withdrawn');
  } catch (e: any) { return err(res, e.message, 500); }
}

// POST /ideas/me/:id/attachment
export async function uploadAttachment(req: Request, res: Response) {
  try {
    const idea = await ownIdea(parseInt(req.params.id), req.user!.id);
    if (!idea) return err(res, 'Idea not found', 404);
    if (!EDITABLE_STATUSES.includes(idea.status)) return err(res, 'This idea can no longer be changed.', 400);
    if (!req.file) return err(res, 'No file provided', 400);

    const isImage = req.file.mimetype.startsWith('image/');
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `ideas/idea-${idea.id}/${Date.now()}-${safeName}`;
    const url = isImage
      ? await processAndUploadImage(req.file.buffer, path, { width: 1600, height: 1600, quality: 85 })
      : await uploadRawFile(req.file.buffer, path);

    const { data, error: e } = await supabase.from('ideas')
      .update({ attachment_url: url, updated_at: new Date().toISOString() }).eq('id', idea.id).select('id, attachment_url').single();
    if (e) return err(res, e.message, 500);
    return ok(res, data, 'Attachment uploaded');
  } catch (e: any) { return err(res, e.message, 500); }
}

// ════════════════ LIKES ════════════════

// BUG-80: GET /ideas/my-likes — authed-only. Returns the ids of ideas the current
// user has liked, so the (cacheable, unauth) public list/detail can hydrate hearts
// client-side without baking per-user state into the ISR payloads.
export async function myLikes(req: Request, res: Response) {
  try {
    const { data, error: e } = await supabase
      .from('idea_likes')
      .select('idea_id')
      .eq('user_id', req.user!.id);
    if (e) return err(res, e.message, 500);
    return ok(res, (data || []).map((r: any) => r.idea_id));
  } catch (e: any) { return err(res, e.message, 500); }
}

// POST /ideas/:id/like — public ideas only, once per user
export async function like(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: idea } = await supabase.from('ideas').select('id, is_public, likes_count').eq('id', id).eq('is_public', true).eq('is_active', true).is('deleted_at', null).maybeSingle();
    if (!idea) return err(res, 'Idea not found', 404);

    const { error: e } = await supabase.from('idea_likes').insert({ idea_id: id, user_id: req.user!.id });
    if (e) {
      if (e.message.includes('duplicate')) return ok(res, { liked: true, likes_count: idea.likes_count }, 'Already liked');
      return err(res, e.message, 500);
    }
    const { count } = await supabase.from('idea_likes').select('id', { count: 'exact', head: true }).eq('idea_id', id);
    await supabase.from('ideas').update({ likes_count: count || 0 }).eq('id', id);
    return ok(res, { liked: true, likes_count: count || 0 }, 'Liked');
  } catch (e: any) { return err(res, e.message, 500); }
}

// DELETE /ideas/:id/like
export async function unlike(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    await supabase.from('idea_likes').delete().eq('idea_id', id).eq('user_id', req.user!.id);
    const { count } = await supabase.from('idea_likes').select('id', { count: 'exact', head: true }).eq('idea_id', id);
    await supabase.from('ideas').update({ likes_count: count || 0 }).eq('id', id);
    return ok(res, { liked: false, likes_count: count || 0 }, 'Like removed');
  } catch (e: any) { return err(res, e.message, 500); }
}

// ════════════════ ADMIN ════════════════

// GET /ideas?status=&category_id=&user_type=&is_public=&rewarded=true&partnership=true&q=&from=&to=
export async function adminList(req: Request, res: Response) {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const rewardEmbed = req.query.rewarded === 'true' ? 'idea_rewards!inner(reward_status, reward_amount)' : 'idea_rewards(reward_status, reward_amount)';
    const partEmbed = req.query.partnership === 'true' ? 'idea_partnerships!inner(partnership_status, partnership_type)' : 'idea_partnerships(partnership_status, partnership_type)';

    let q = supabase.from('ideas')
      .select(`id, title, slug, status, user_type, is_public, likes_count, views_count, created_at, interested_as_partner,
        idea_categories(id, name, icon), users!ideas_user_id_fkey(id, first_name, last_name, email), ${rewardEmbed}, ${partEmbed}`, { count: 'exact' })
      .is('deleted_at', null);

    if (req.query.status) q = q.eq('status', String(req.query.status));
    if (req.query.category_id) q = q.eq('category_id', parseInt(String(req.query.category_id)));
    if (req.query.user_type) q = q.eq('user_type', String(req.query.user_type));
    if (req.query.is_public === 'true') q = q.eq('is_public', true);
    if (req.query.is_public === 'false') q = q.eq('is_public', false);
    if (req.query.q) q = q.ilike('title', `%${String(req.query.q).replace(/[%_]/g, '')}%`);
    if (req.query.from) q = q.gte('created_at', String(req.query.from));
    if (req.query.to) q = q.lte('created_at', String(req.query.to));

    const { data, count, error: e } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) { return err(res, e.message, 500); }
}

// GET /ideas/:id — everything, for the review modal
export async function adminGetById(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: idea, error: e } = await supabase.from('ideas')
      .select('*, idea_categories(id, name, icon), users!ideas_user_id_fkey(id, first_name, last_name, email, mobile)')
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (e) return err(res, e.message, 500);
    if (!idea) return err(res, 'Idea not found', 404);

    const [logs, feedback, rewards, partnerships, likes] = await Promise.all([
      supabase.from('idea_status_logs').select('*, users!idea_status_logs_changed_by_fkey(first_name, last_name)').eq('idea_id', id).order('created_at', { ascending: false }),
      supabase.from('idea_feedbacks').select('*, users!idea_feedbacks_admin_id_fkey(first_name, last_name)').eq('idea_id', id).order('created_at', { ascending: false }),
      supabase.from('idea_rewards').select('*').eq('idea_id', id).order('created_at', { ascending: false }),
      supabase.from('idea_partnerships').select('*').eq('idea_id', id).order('created_at', { ascending: false }),
      supabase.from('idea_likes').select('id', { count: 'exact', head: true }).eq('idea_id', id),
    ]);

    return ok(res, {
      ...idea,
      status_logs: logs.data || [],
      feedbacks: feedback.data || [],
      rewards: rewards.data || [],
      partnerships: partnerships.data || [],
      likes_total: likes.count || 0,
    });
  } catch (e: any) { return err(res, e.message, 500); }
}

async function getIdeaOr404(id: number) {
  const { data } = await supabase.from('ideas').select('id, user_id, title, status, is_public').eq('id', id).is('deleted_at', null).maybeSingle();
  return data || null;
}

// PATCH /ideas/:id/status  { status, remark }
export async function adminSetStatus(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const idea = await getIdeaOr404(id);
    if (!idea) return err(res, 'Idea not found', 404);

    const status = String(req.body.status || '');
    const remark = req.body.remark ? String(req.body.remark) : null;
    if (!STATUSES.includes(status as any)) return err(res, `Invalid status. One of: ${STATUSES.join(', ')}`, 400);
    if (status === idea.status) return err(res, 'Idea is already in this status', 400);

    const updates: any = { status, admin_remark: remark, updated_at: new Date().toISOString() };
    if (status === 'rejected' || status === 'closed') updates.is_public = false; // never showcase rejected/closed

    const { data, error: e } = await supabase.from('ideas').update(updates).eq('id', id).select('*').single();
    if (e) return err(res, e.message, 500);

    await logStatus(id, idea.status, status, req.user!.id, remark);

    const pretty = status.replace(/_/g, ' ');
    notifyOwner(idea, `Your idea is now: ${pretty}`,
      `"${idea.title}" moved to "${pretty}"${remark ? ` — ${remark}` : ''}.`, 'idea_status');
    return ok(res, data, 'Status updated');
  } catch (e: any) { return err(res, e.message, 500); }
}

// PATCH /ideas/:id/visibility  { is_public }
export async function adminSetVisibility(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const idea = await getIdeaOr404(id);
    if (!idea) return err(res, 'Idea not found', 404);

    const isPublic = req.body.is_public === true || req.body.is_public === 'true';
    if (isPublic && !PUBLICABLE_STATUSES.includes(idea.status)) {
      return err(res, 'Only approved/implemented ideas can be shown publicly — approve the idea first.', 400);
    }
    const { data, error: e } = await supabase.from('ideas')
      .update({ is_public: isPublic, visibility: isPublic ? 'public' : 'private', updated_at: new Date().toISOString() })
      .eq('id', id).select('id, is_public').single();
    if (e) return err(res, e.message, 500);

    if (isPublic) notifyOwner(idea, 'Your idea is featured publicly! 🎉', `"${idea.title}" is now live on the public Idea Showcase.`, 'idea_public');
    return ok(res, data, isPublic ? 'Idea is now public' : 'Idea is now private');
  } catch (e: any) { return err(res, e.message, 500); }
}

// POST /ideas/:id/feedback  { message, is_visible_to_user }
export async function adminAddFeedback(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const idea = await getIdeaOr404(id);
    if (!idea) return err(res, 'Idea not found', 404);

    const message = String(req.body.message || '').trim();
    if (!message) return err(res, 'message is required', 400);
    const visible = req.body.is_visible_to_user !== false && req.body.is_visible_to_user !== 'false';

    const { data, error: e } = await supabase.from('idea_feedbacks')
      .insert({ idea_id: id, admin_id: req.user!.id, message, is_visible_to_user: visible })
      .select('*').single();
    if (e) return err(res, e.message, 500);

    if (visible) notifyOwner(idea, 'New feedback on your idea', `"${idea.title}": ${message.slice(0, 120)}${message.length > 120 ? '…' : ''}`, 'idea_feedback');
    return ok(res, data, 'Feedback added', 201);
  } catch (e: any) { return err(res, e.message, 500); }
}

// POST|PATCH /ideas/:id/reward  { reward_amount, reward_currency?, reward_status, reward_note?, transaction_reference?, reward_payment_date? }
// Marking PAID credits the owner's GUM Wallet atomically (idempotent per idea).
export async function adminUpsertReward(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const idea = await getIdeaOr404(id);
    if (!idea) return err(res, 'Idea not found', 404);

    const amount = Number(req.body.reward_amount);
    const status = String(req.body.reward_status || 'pending');
    if (!amount || amount <= 0) return err(res, 'reward_amount must be a positive number', 400);
    if (!['pending', 'approved', 'paid', 'cancelled'].includes(status)) return err(res, 'Invalid reward_status', 400);

    const fields: any = {
      reward_amount: amount,
      reward_currency: String(req.body.reward_currency || 'INR'),
      reward_status: status,
      reward_note: req.body.reward_note ? String(req.body.reward_note) : null,
      transaction_reference: req.body.transaction_reference ? String(req.body.transaction_reference) : null,
      approved_by: req.user!.id,
      reward_payment_date: status === 'paid' ? (req.body.reward_payment_date || new Date().toISOString().slice(0, 10)) : (req.body.reward_payment_date || null),
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase.from('idea_rewards').select('*').eq('idea_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing && existing.reward_status === 'paid' && status !== 'paid') {
      return err(res, 'This reward is already PAID and cannot be changed.', 400);
    }

    let reward: any;
    if (existing) {
      const { data, error: e } = await supabase.from('idea_rewards').update(fields).eq('id', existing.id).select('*').single();
      if (e) return err(res, e.message, 500);
      reward = data;
    } else {
      const { data, error: e } = await supabase.from('idea_rewards').insert({ idea_id: id, ...fields }).select('*').single();
      if (e) return err(res, e.message, 500);
      reward = data;
    }

    // PAID → credit the GUM Wallet (same atomic rail as referral rewards)
    if (status === 'paid' && !(existing && existing.reward_status === 'paid')) {
      const credit = await creditWallet({
        userId: idea.user_id,
        amount,
        sourceType: 'idea_reward',
        sourceId: idea.id,
        description: `Idea reward — "${idea.title}"`,
        metadata: { idea_id: idea.id, reward_id: reward.id },
        createdBy: req.user!.id,
      });
      if (!credit.success) return err(res, `Reward saved but wallet credit failed: ${credit.error}. Fix and mark paid again.`, 500);
      await supabase.from('idea_rewards').update({ wallet_transaction_id: (credit as any).transactionId ?? null }).eq('id', reward.id);

      if (idea.status !== 'rewarded') {
        await supabase.from('ideas').update({ status: 'rewarded', updated_at: new Date().toISOString() }).eq('id', id);
        await logStatus(id, idea.status, 'rewarded', req.user!.id, `Reward of ₹${amount} paid to wallet`);
      }
      notifyOwner(idea, '🎉 Your idea earned a reward!', `₹${amount} has been credited to your GUM Wallet for "${idea.title}". Congratulations!`, 'idea_reward');
    } else {
      notifyOwner(idea, 'Reward update on your idea', `Reward for "${idea.title}" is now ${status} (₹${amount}).`, 'idea_reward');
    }

    return ok(res, reward, 'Reward saved');
  } catch (e: any) { return err(res, e.message, 500); }
}

// POST|PATCH /ideas/:id/partnership  { partnership_status, partnership_type, partnership_note }
export async function adminUpsertPartnership(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const idea = await getIdeaOr404(id);
    if (!idea) return err(res, 'Idea not found', 404);

    const status = String(req.body.partnership_status || 'offered');
    const type = req.body.partnership_type ? String(req.body.partnership_type) : null;
    if (!['not_offered', 'offered', 'accepted', 'rejected', 'completed'].includes(status)) return err(res, 'Invalid partnership_status', 400);
    if (type && !['partner', 'contributor', 'mentor', 'trainer', 'consultant', 'revenue_share'].includes(type)) return err(res, 'Invalid partnership_type', 400);

    const fields: any = {
      partnership_status: status,
      partnership_type: type,
      partnership_note: req.body.partnership_note ? String(req.body.partnership_note) : null,
      offered_by: req.user!.id,
      updated_at: new Date().toISOString(),
    };
    if (['accepted', 'rejected', 'completed'].includes(status)) fields.responded_at = new Date().toISOString();

    const { data: existing } = await supabase.from('idea_partnerships').select('id').eq('idea_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();

    let part: any;
    if (existing) {
      const { data, error: e } = await supabase.from('idea_partnerships').update(fields).eq('id', existing.id).select('*').single();
      if (e) return err(res, e.message, 500);
      part = data;
    } else {
      const { data, error: e } = await supabase.from('idea_partnerships').insert({ idea_id: id, ...fields, offered_at: new Date().toISOString() }).select('*').single();
      if (e) return err(res, e.message, 500);
      part = data;
    }

    if (status === 'offered') {
      if (idea.status !== 'partnership_offered') {
        await supabase.from('ideas').update({ status: 'partnership_offered', updated_at: new Date().toISOString() }).eq('id', id);
        await logStatus(id, idea.status, 'partnership_offered', req.user!.id, `Partnership offered${type ? ` (${type})` : ''}`);
      }
      notifyOwner(idea, '🤝 Partnership opportunity!', `We'd like to discuss a ${type || 'partnership'} role with you for "${idea.title}". Check your idea page for details.`, 'idea_partnership');
    } else {
      notifyOwner(idea, 'Partnership update', `Partnership for "${idea.title}" is now ${status.replace(/_/g, ' ')}.`, 'idea_partnership');
    }

    return ok(res, part, 'Partnership saved');
  } catch (e: any) { return err(res, e.message, 500); }
}
