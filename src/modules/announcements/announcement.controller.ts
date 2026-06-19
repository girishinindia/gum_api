import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { dispatchAnnouncement, getReadStats } from '../../services/announcement.service';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'announcements';
const CACHE_KEY = 'announcements:all';

const FK_SELECT = `*,
  creator:users!announcements_created_by_fkey(id, first_name, last_name, email),
  publisher:users!announcements_published_by_fkey(id, first_name, last_name, email)`;

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_pinned === 'string') body.is_pinned = body.is_pinned === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['target_id', 'priority', 'sent_count']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Array fields (channels)
  if (typeof body.channels === 'string') {
    try { body.channels = JSON.parse(body.channels); } catch { body.channels = ['in_app']; }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

    let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

    if (search) q = applySearch(q, search, { ilike: ['title', 'content'] });
    if (req.query.status) q = q.eq('status', req.query.status as string);
    if (req.query.announcement_type) q = q.eq('announcement_type', req.query.announcement_type as string);
    if (req.query.target_scope) q = q.eq('target_scope', req.query.target_scope as string);
    if (req.query.target_audience) q = q.eq('target_audience', req.query.target_audience as string);
    if (req.query.priority !== undefined && req.query.priority !== '') q = q.eq('priority', parseInt(req.query.priority as string));
    if (req.query.is_pinned === 'true') q = q.eq('is_pinned', true);
    if (req.query.created_by) q = q.eq('created_by', parseInt(req.query.created_by as string));

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
    if (e || !data) return err(res, 'Announcement not found', 404);

    // Attach read stats
    const stats = await getReadStats(data.id);
    return ok(res, { ...data, read_stats: stats });
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (!body.title) return err(res, 'title is required', 400);
    if (!body.content) return err(res, 'content is required', 400);

    body.created_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'announcement_created', targetType: 'announcement', targetId: data.id, targetName: data.title, ip: getClientIp(req) });
    return ok(res, data, 'Announcement created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Announcement not found', 404);

    const updates = parseBody(req);
    updates.updated_by = req.user!.id;
    // Allow changing status directly from the edit form; when an admin sets it to
    // 'published' and it wasn't published before, stamp published_at/by so it
    // orders correctly and shows a publish time (the Publish action still handles dispatch).
    if (updates.status === 'published' && !old.published_at && !updates.published_at) {
      updates.published_at = new Date().toISOString();
      if (!updates.published_by) updates.published_by = req.user!.id;
    }

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'announcement_updated', targetType: 'announcement', targetId: id, targetName: data.title, changes: updates, ip: getClientIp(req) });
    return ok(res, data, 'Announcement updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function publish(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: announcement } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!announcement) return err(res, 'Announcement not found', 404);
    if (announcement.status === 'published') return err(res, 'Already published', 400);
    if (announcement.status === 'archived') return err(res, 'Cannot publish archived announcement', 400);

    // Update published_by before dispatch
    await supabase.from(TABLE).update({ published_by: req.user!.id }).eq('id', id);

    // Dispatch to target users
    const result = await dispatchAnnouncement(id);
    if (result.error && result.sent === 0) {
      return err(res, result.error, 400);
    }

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'announcement_published', targetType: 'announcement', targetId: id, targetName: announcement.title, metadata: { sent_count: result.sent }, ip: getClientIp(req) });

    // Re-fetch updated announcement
    const { data } = await supabase.from(TABLE).select(FK_SELECT).eq('id', id).single();
    return ok(res, data, `Announcement published to ${result.sent} users`);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function archive(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Announcement not found', 404);

    const { data, error: e } = await supabase.from(TABLE)
      .update({ status: 'archived', updated_by: req.user!.id })
      .eq('id', id)
      .select(FK_SELECT)
      .single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'announcement_archived', targetType: 'announcement', targetId: id, targetName: old.title, ip: getClientIp(req) });
    return ok(res, data, 'Announcement archived');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Announcement not found', 404);

    const { error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), updated_by: req.user!.id }).eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'announcement_soft_deleted', targetType: 'announcement', targetId: id, targetName: old.title, ip: getClientIp(req) });
    return ok(res, null, 'Announcement deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, updated_by: req.user!.id }).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);
    if (!data) return err(res, 'Announcement not found', 404);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'announcement_restored', targetType: 'announcement', targetId: id, targetName: data.title, ip: getClientIp(req) });
    return ok(res, data, 'Announcement restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Announcement not found', 404);

    // Also delete reads
    await supabase.from('announcement_reads').delete().eq('announcement_id', id);
    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'announcement_deleted', targetType: 'announcement', targetId: id, targetName: old.title, ip: getClientIp(req) });
    return ok(res, null, 'Announcement permanently deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── Read stats endpoint ──
export async function readStats(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const stats = await getReadStats(id);
    return ok(res, stats);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── List reads for an announcement ──
export async function listReads(req: Request, res: Response) {
  try {
    const announcementId = parseInt(req.params.id);
    const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'read_at' });

    const { data, count, error: e } = await supabase
      .from('announcement_reads')
      .select('*, users!announcement_reads_user_id_fkey(id, first_name, last_name, email)', { count: 'exact' })
      .eq('announcement_id', announcementId)
      .order(sort, { ascending })
      .range(offset, offset + limit - 1);

    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
