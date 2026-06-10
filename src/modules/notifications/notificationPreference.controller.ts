import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'notification_preferences';
const CACHE_KEY = 'notification_preferences:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  for (const k of ['email_enabled', 'sms_enabled', 'in_app_enabled', 'is_active']) {
    if (typeof body[k] === 'string') body[k] = body[k] === 'true';
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

    let q = supabase.from(TABLE).select('*, users!inner(full_name, email)', { count: 'exact' });

    if (search) q = q.or(`notification_type.ilike.%${search}%,users.full_name.ilike.%${search}%,users.email.ilike.%${search}%`);
    if (req.query.user_id) q = q.eq('user_id', Number(req.query.user_id));
    if (req.query.notification_type) q = q.eq('notification_type', String(req.query.notification_type));
    if (req.query.is_active === 'true') q = q.eq('is_active', true);
    if (req.query.is_active === 'false') q = q.eq('is_active', false);

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
    const { data, error: e } = await supabase.from(TABLE).select('*, users!inner(full_name, email)').eq('id', req.params.id).single();
    if (e || !data) return err(res, 'Notification preference not found', 404);
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function getByUser(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId as string);
    const { data, error: e } = await supabase.from(TABLE).select('*').eq('user_id', userId).order('notification_type');
    if (e) return err(res, e.message, 500);
    return ok(res, data || []);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id as string);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Notification preference not found', 404);

    const updates = parseBody(req);
    // Only allow updating channel toggles and is_active
    const allowed: any = {};
    for (const k of ['email_enabled', 'sms_enabled', 'in_app_enabled', 'is_active']) {
      if (updates[k] !== undefined) allowed[k] = updates[k];
    }

    if (Object.keys(allowed).length === 0) return err(res, 'No valid fields to update', 400);

    const { data, error: e } = await supabase.from(TABLE).update(allowed).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'notification_preference_updated', targetType: 'notification_preference', targetId: id, targetName: `${old.notification_type} (user ${old.user_id})`, ip: getClientIp(req) });
    return ok(res, data, 'Notification preference updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function bulkUpdate(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId as string);
    const { preferences } = req.body;
    if (!Array.isArray(preferences)) return err(res, 'preferences must be an array', 400);

    const results: any[] = [];
    for (const pref of preferences) {
      if (!pref.notification_type) continue;
      const updates: any = {};
      for (const k of ['email_enabled', 'sms_enabled', 'in_app_enabled', 'is_active']) {
        if (pref[k] !== undefined) updates[k] = typeof pref[k] === 'string' ? pref[k] === 'true' : pref[k];
      }
      if (Object.keys(updates).length === 0) continue;

      const { data, error: e } = await supabase
        .from(TABLE)
        .upsert({ user_id: userId, notification_type: pref.notification_type, ...updates }, { onConflict: 'user_id,notification_type' })
        .select()
        .single();

      if (!e && data) results.push(data);
    }

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'notification_preferences_bulk_updated', targetType: 'notification_preference', targetId: userId, targetName: `user ${userId} (${results.length} prefs)`, ip: getClientIp(req) });
    return ok(res, results, `${results.length} preferences updated`);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function summary(_req: Request, res: Response) {
  try {
    const { count: activeCount } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('is_active', true);
    const { count: inactiveCount } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('is_active', false);

    const a = activeCount || 0;
    const i = inactiveCount || 0;

    return ok(res, [{ table_name: TABLE, is_active: a, is_inactive: i, is_deleted: 0, total: a + i }]);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}


// ══════════════════════════════════════════════════
// SELF-SERVE (current authenticated user) — own preferences only.
// ══════════════════════════════════════════════════

/** GET /notification-preferences/me — caller's preference rows. */
export async function listMine(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const { data, error: e } = await supabase
      .from(TABLE)
      .select('id, notification_type, email_enabled, sms_enabled, in_app_enabled, push_enabled, is_active')
      .eq('user_id', userId)
      .order('notification_type');
    if (e) return err(res, e.message, 500);
    return ok(res, data || []);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

/** PATCH /notification-preferences/me — upsert one preference for the caller. */
export async function upsertMine(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const notificationType = String(req.body.notification_type || '').trim();
    if (!notificationType) return err(res, 'notification_type is required', 400);

    const row: any = { user_id: userId, notification_type: notificationType };
    for (const k of ['email_enabled', 'sms_enabled', 'in_app_enabled', 'push_enabled', 'is_active']) {
      if (req.body[k] !== undefined) row[k] = typeof req.body[k] === 'string' ? req.body[k] === 'true' : !!req.body[k];
    }

    const { data, error: e } = await supabase
      .from(TABLE)
      .upsert(row, { onConflict: 'user_id,notification_type' })
      .select('id, notification_type, email_enabled, sms_enabled, in_app_enabled, push_enabled, is_active')
      .single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    return ok(res, data, 'Preference updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
