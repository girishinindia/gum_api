import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { enqueuePush } from '../../services/push.service';
import { sendEmailDirect } from '../../services/email.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'notifications';
const CACHE_KEY = 'notifications:all';

const FK_SELECT = '*, users!notifications_user_id_fkey(id, first_name, last_name, email)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

// Columns that actually exist on public.notifications. Anything else in the
// request body is dropped BEFORE the insert/update — a stray form field must
// produce a clean 400/ignore, never a PostgREST "schema cache" 500.
// (That exact failure shipped once: the admin form sent `action_url` before
// the column existed. June 2026.)
const ALLOWED_COLUMNS = new Set([
  'user_id', 'notification_type', 'title', 'message', 'channel',
  'delivery_status', 'is_read', 'read_at', 'reference_type', 'reference_id',
  'metadata', 'is_active', 'action_url', 'priority', 'sent_at',
]);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // The admin form's textarea is named `body`; the column is `message`.
  if (body.body !== undefined && body.message === undefined) body.message = body.body;
  // Boolean fields
  if (typeof body.is_read === 'string') body.is_read = body.is_read === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['user_id', 'reference_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // JSON fields
  if (typeof body.metadata === 'string') {
    try { body.metadata = JSON.parse(body.metadata); } catch { body.metadata = null; }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  // Whitelist — drop unknown keys (audit columns are set explicitly by handlers)
  for (const k of Object.keys(body)) { if (!ALLOWED_COLUMNS.has(k)) delete body[k]; }
  return body;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

    let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

    // BUG-20 fix: an all-digits search matches the notification ID exactly
    if (search && /^\d+$/.test(search.trim())) q = q.eq('id', parseInt(search.trim()));
    else if (search) q = applySearch(q, search, { ilike: ['title', 'message'] });
    if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
    if (req.query.notification_type) q = q.eq('notification_type', req.query.notification_type as string);
    if (req.query.channel) q = q.eq('channel', req.query.channel as string);
    if (req.query.delivery_status) q = q.eq('delivery_status', req.query.delivery_status as string);
    if (req.query.is_read === 'true') q = q.eq('is_read', true);
    if (req.query.is_read === 'false') q = q.eq('is_read', false);
    // BUG-22 fix: Sent At date-range filter
    if (req.query.sent_from) q = q.gte('sent_at', String(req.query.sent_from));
    if (req.query.sent_to) q = q.lte('sent_at', String(req.query.sent_to) + 'T23:59:59');

    if (req.query.show_deleted === 'true') {
      q = q.not('deleted_at', 'is', null);
    } else {
      q = q.is('deleted_at', null);
    }

    q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

    const { data, count, error: e } = await q;
    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
    if (e || !data) return err(res, 'Notification not found', 404);
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (!body.user_id) return err(res, 'user_id is required', 400);
    if (!body.title) return err(res, 'title is required', 400);

    // In-app notifications are delivered the moment the row exists; other
    // channels (email/sms/push) get sent_at stamped by their dispatchers.
    if (!body.sent_at && (body.channel ?? 'in_app') === 'in_app') {
      body.sent_at = new Date().toISOString();
    }

    // BUG-04 fix: admin-created in-app notifications must respect the user's
    // notification settings — don't create rows for opted-out types.
    // BUG-60: notification_preferences has no deleted_at column; the phantom
    // filter errored the query so the skip check never fired. Drop it so the
    // opt-out is actually honored, and surface a `skipped` flag the admin UI
    // can branch on to show a "skipped" message.
    // Respect the user's per-type opt-out for the TARGET channel — not just
    // in-app. email/push default ON, sms defaults OFF (matches the settings UI).
    if (body.notification_type) {
      const channel = String(body.channel ?? 'in_app');
      const COL: Record<string, string> = { in_app: 'in_app_enabled', email: 'email_enabled', push: 'push_enabled', sms: 'sms_enabled' };
      const DEFAULT_ON: Record<string, boolean> = { in_app_enabled: true, email_enabled: true, push_enabled: true, sms_enabled: false };
      const col = COL[channel];
      if (col) {
        const { data: pref } = await supabase
          .from('notification_preferences')
          .select(col)
          .eq('user_id', body.user_id)
          .eq('notification_type', canonType(String(body.notification_type)))
          .maybeSingle();
        const raw = pref ? (pref as any)[col] : undefined;
        const enabled = raw == null ? DEFAULT_ON[col] : raw;
        if (enabled === false) {
          const nice = channel === 'in_app' ? 'in-app' : channel;
          return ok(res, { skipped: true, reason: `user_disabled_${channel}` }, `Skipped — the user turned off ${nice} notifications for this type`);
        }
      }
    }

    body.created_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    // BUG-23 (June 2026): Channel=Push actually dispatches to the user's
    // registered web-push devices (best-effort; row stays as the record).
    if ((body.channel ?? 'in_app') === 'push') {
      enqueuePush(Number(body.user_id), {
        title: String(body.title || 'Notification'),
        body: String(body.message || ''),
        url: body.action_url || undefined,
      }).then(async (r) => {
        await supabase.from(TABLE).update({ delivery_status: r.enqueued > 0 ? 'delivered' : 'failed', sent_at: new Date().toISOString() }).eq('id', data.id);
      }).catch(() => {});
    }

    // Channel=Email now actually DELIVERS by email — previously the row was just
    // inserted ("SENT AT —", never sent). Fire-and-forget; stamp delivery_status/sent_at.
    if ((body.channel ?? 'in_app') === 'email') {
      (async () => {
        const { data: u } = await supabase.from('users').select('email, full_name, first_name').eq('id', body.user_id).maybeSingle();
        if (!u?.email) { await supabase.from(TABLE).update({ delivery_status: 'failed' }).eq('id', data.id); return; }
        const name = u.full_name || u.first_name || 'there';
        const subject = String(body.title || 'Notification from GrowUpMore');
        const safeMsg = String(body.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
        const html = `<p>Hi ${name},</p><p>${safeMsg}</p>${body.action_url ? `<p><a href="${body.action_url}">View</a></p>` : ''}<p>— GrowUpMore</p>`;
        try {
          await sendEmailDirect(u.email, name, subject, html);
          await supabase.from(TABLE).update({ delivery_status: 'delivered', sent_at: new Date().toISOString() }).eq('id', data.id);
        } catch (mailErr) {
          await supabase.from(TABLE).update({ delivery_status: 'failed' }).eq('id', data.id);
          console.error('[notification email] send failed:', mailErr);
        }
      })();
    }

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'notification_created', targetType: 'notification', targetId: data.id, targetName: data.title, ip: getClientIp(req) });
    return ok(res, data, 'Notification created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Notification not found', 404);

    const updates = parseBody(req);
    updates.updated_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'notification_updated', targetType: 'notification', targetId: id, targetName: data.title, ip: getClientIp(req) });
    return ok(res, data, 'Notification updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Notification not found', 404);
    if (old.deleted_at) return err(res, 'Already in trash', 400);

    const now = new Date().toISOString();
    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'notification_soft_deleted', targetType: 'notification', targetId: id, targetName: old.title, ip: getClientIp(req) });
    return ok(res, data, 'Notification moved to trash');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Notification not found', 404);
    if (!old.deleted_at) return err(res, 'Not in trash', 400);

    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'notification_restored', targetType: 'notification', targetId: id, targetName: old.title, ip: getClientIp(req) });
    return ok(res, data, 'Notification restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
    if (!old) return err(res, 'Notification not found', 404);

    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'notification_deleted', targetType: 'notification', targetId: id, targetName: old.title, ip: getClientIp(req) });
    return ok(res, null, 'Notification permanently deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function markAsRead(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('title, is_read').eq('id', id).single();
    if (!old) return err(res, 'Notification not found', 404);
    if (old.is_read) return ok(res, old, 'Already read');

    const now = new Date().toISOString();
    const { data, error: e } = await supabase.from(TABLE).update({ is_read: true, read_at: now, updated_by: req.user!.id }).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'notification_marked_read', targetType: 'notification', targetId: id, targetName: old.title, ip: getClientIp(req) });
    return ok(res, data, 'Notification marked as read');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function markAllAsRead(req: Request, res: Response) {
  try {
    const { user_id } = req.body;
    if (!user_id) return err(res, 'user_id is required', 400);

    const now = new Date().toISOString();
    const { data, error: e } = await supabase
      .from(TABLE)
      .update({ is_read: true, read_at: now, updated_by: req.user!.id })
      .eq('user_id', parseInt(user_id))
      .eq('is_read', false)
      .is('deleted_at', null)
      .select('id');

    if (e) return err(res, e.message, 500);

    await clearCache();
    const count = data?.length || 0;
    logAdmin({ actorId: req.user!.id, action: 'notification_marked_all_read', targetType: 'notification', targetId: parseInt(user_id), targetName: `${count} notifications`, ip: getClientIp(req) });
    return ok(res, { marked: count }, `${count} notifications marked as read`);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function getUnreadCount(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);
    if (!userId) return err(res, 'userId is required', 400);

    const { count, error: e } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .is('deleted_at', null);

    if (e) return err(res, e.message, 500);
    return ok(res, { unread_count: count || 0 });
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}


// ══════════════════════════════════════════════════
// SELF-SERVE (current authenticated user)
// Strictly scoped to req.user.id — NO admin permission required.
// The "inbox" is the in_app channel; email/push rows are delivery records.
// ══════════════════════════════════════════════════

// Legacy/admin short keys ↔ canonical preference keys. The settings panel and
// system notifiers use canonical keys (enrollment_confirmed, …); some older
// admin-created rows used short keys ('enrollment', …). Normalizing both ways
// means a user's in-app opt-out applies no matter which key variant was used.
const TYPE_TO_CANON: Record<string, string> = {
  enrollment: 'enrollment_confirmed',
  payment: 'payment_received',
  refund: 'refund_processed',
  reminder: 'course_reminder',
  class_reminder: 'course_reminder',
};
const CANON_TO_VARIANTS: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const [short, canon] of Object.entries(TYPE_TO_CANON)) { (m[canon] ||= [canon]).push(short); }
  return m;
})();
function canonType(t: string): string { return TYPE_TO_CANON[t] || t; }
function expandDisabled(types: string[]): string[] {
  const out = new Set<string>();
  for (const t of types) { out.add(t); const c = canonType(t); for (const v of (CANON_TO_VARIANTS[c] || [c])) out.add(v); }
  return [...out];
}

/**
 * BUG-04 fix (June 2026): the inbox must respect notification settings.
 * Returns the notification types this user has turned OFF for in-app.
 */
async function disabledInAppTypes(userId: number): Promise<string[]> {
  // BUG-60/BUG-62: notification_preferences has no deleted_at column; the
  // phantom filter errored the query → no types returned → the inbox showed
  // everything, including types the user disabled. Drop the filter.
  const { data } = await supabase
    .from('notification_preferences')
    .select('notification_type')
    .eq('user_id', userId)
    .eq('in_app_enabled', false);
  return (data || []).map((p: any) => String(p.notification_type)).filter(Boolean);
}

const notInTypes = (types: string[]) => `(${types.map((t) => `"${t.replace(/"/g, '')}"`).join(',')})`;

/** GET /notifications/me — current user's in-app inbox (paginated). */
export async function listMine(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const { page, limit, offset } = parseListParams(req, { sort: 'created_at' });

    let q = supabase
      .from(TABLE)
      .select('id, notification_type, title, message, is_read, read_at, reference_type, reference_id, metadata, action_url, priority, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .eq('channel', 'in_app')
      .is('deleted_at', null);

    if (req.query.is_read === 'true')  q = q.eq('is_read', true);
    if (req.query.is_read === 'false') q = q.eq('is_read', false);
    if (req.query.notification_type)   q = q.eq('notification_type', String(req.query.notification_type));

    // BUG-04: hide types the user disabled (covers rows created before opt-out too)
    const disabled = expandDisabled(await disabledInAppTypes(userId));
    if (disabled.length) q = q.not('notification_type', 'in', notInTypes(disabled));

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error: e } = await q;
    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

/** GET /notifications/me/unread-count — current user's unread in-app count. */
export async function unreadCountMine(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    let q = supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('channel', 'in_app')
      .eq('is_read', false)
      .is('deleted_at', null);
    // BUG-04: badge must match the filtered inbox
    const disabled = expandDisabled(await disabledInAppTypes(userId));
    if (disabled.length) q = q.not('notification_type', 'in', notInTypes(disabled));
    const { count, error: e } = await q;
    if (e) return err(res, e.message, 500);
    return ok(res, { unread_count: count || 0 });
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

/** PATCH /notifications/me/:id/read — mark one of the caller's notifications read. */
export async function markMineRead(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id);
    const { data: row } = await supabase.from(TABLE).select('id, user_id, is_read').eq('id', id).single();
    if (!row || row.user_id !== userId) return err(res, 'Notification not found', 404);
    if (row.is_read) return ok(res, { id, is_read: true }, 'Already read');

    const { error: e } = await supabase
      .from(TABLE)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    return ok(res, { id, is_read: true }, 'Marked as read');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

/** PATCH /notifications/me/read-all — mark all the caller's notifications read. */
export async function markAllMineRead(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const { data, error: e } = await supabase
      .from(TABLE)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false)
      .is('deleted_at', null)
      .select('id');
    if (e) return err(res, e.message, 500);

    await clearCache();
    return ok(res, { marked: data?.length || 0 }, `${data?.length || 0} notifications marked as read`);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

/** DELETE /notifications/me/:id — dismiss (soft-delete) one of the caller's notifications. */
export async function dismissMine(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id);
    const { data: row } = await supabase.from(TABLE).select('id, user_id').eq('id', id).single();
    if (!row || row.user_id !== userId) return err(res, 'Notification not found', 404);

    const { error: e } = await supabase
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    return ok(res, { id }, 'Notification dismissed');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
