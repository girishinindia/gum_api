import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'live_sessions';
const CACHE_KEY = 'live_sessions:all';

const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_recurring === 'string') body.is_recurring = body.is_recurring === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['item_id', 'instructor_id', 'duration_minutes', 'max_attendees', 'parent_session_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // JSONB fields
  if (typeof body.recurrence_rule === 'string') {
    try { body.recurrence_rule = JSON.parse(body.recurrence_rule); } catch { /* leave as-is */ }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = '*, users!live_sessions_instructor_id_fkey(id, first_name, last_name, email)';

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  if (req.query.item_type) q = q.eq('item_type', req.query.item_type as string);
  if (req.query.item_id) q = q.eq('item_id', parseInt(req.query.item_id as string));
  if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
  if (req.query.session_status) q = q.eq('session_status', req.query.session_status as string);
  if (req.query.is_recurring === 'true') q = q.eq('is_recurring', true);
  else if (req.query.is_recurring === 'false') q = q.eq('is_recurring', false);
  if (req.query.meeting_platform) q = q.eq('meeting_platform', req.query.meeting_platform as string);
  if (req.query.parent_session_id) q = q.eq('parent_session_id', parseInt(req.query.parent_session_id as string));

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Live session not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'live_session_created', targetType: 'live_session', targetId: data.id, targetName: body.title || `live_session:${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Live session created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Live session not found', 404);

  const updates = parseBody(req);
  updates.updated_at = new Date().toISOString();

  if (Object.keys(updates).filter(k => k !== 'updated_at').length === 0) {
    return err(res, 'Nothing to update', 400);
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'live_session_updated', targetType: 'live_session', targetId: id, targetName: updates.title || old.title || `live_session:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Live session updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Live session not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'live_session_soft_deleted', targetType: 'live_session', targetId: id, targetName: old.title || `live_session:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Live session moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Live session not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'live_session_restored', targetType: 'live_session', targetId: id, targetName: old.title || `live_session:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Live session restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Live session not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'live_session_deleted', targetType: 'live_session', targetId: id, targetName: old.title || `live_session:${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Live session permanently deleted');
}

export async function startSession(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Live session not found', 404);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ session_status: 'live', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'live_session_started', targetType: 'live_session', targetId: id, targetName: old.title || `live_session:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Live session started');
}

export async function endSession(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Live session not found', 404);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ session_status: 'completed', ended_at: now, updated_at: now })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'live_session_ended', targetType: 'live_session', targetId: id, targetName: old.title || `live_session:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Live session ended');
}

export async function cancelSession(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Live session not found', 404);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ session_status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'live_session_cancelled', targetType: 'live_session', targetId: id, targetName: old.title || `live_session:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Live session cancelled');
}

export async function rescheduleSession(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Live session not found', 404);

  const { scheduled_at } = req.body;
  if (!scheduled_at) return err(res, 'scheduled_at is required', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ scheduled_at, session_status: 'rescheduled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'live_session_rescheduled', targetType: 'live_session', targetId: id, targetName: old.title || `live_session:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Live session rescheduled');
}
