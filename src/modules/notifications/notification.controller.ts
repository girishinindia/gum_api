import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
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

function parseBody(req: Request): any {
  const body: any = { ...req.body };
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
  return body;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

    let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

    if (search) q = applySearch(q, search, { ilike: ['title', 'message'] });
    if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
    if (req.query.notification_type) q = q.eq('notification_type', req.query.notification_type as string);
    if (req.query.channel) q = q.eq('channel', req.query.channel as string);
    if (req.query.delivery_status) q = q.eq('delivery_status', req.query.delivery_status as string);
    if (req.query.is_read === 'true') q = q.eq('is_read', true);
    if (req.query.is_read === 'false') q = q.eq('is_read', false);

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

    body.created_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

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
