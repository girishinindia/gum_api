import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'session_attendance';
const CACHE_KEY = 'session_attendance:all';

const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['session_id', 'user_id', 'duration_attended', 'rating']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = '*, users!session_attendance_user_id_fkey(id, first_name, last_name, email), live_sessions!session_attendance_session_id_fkey(id, title, scheduled_at)';

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['feedback'] });
  if (req.query.session_id) q = q.eq('session_id', parseInt(req.query.session_id as string));
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.attendance_status) q = q.eq('attendance_status', req.query.attendance_status as string);

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
  if (e || !data) return err(res, 'Session attendance not found', 404);
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
  logAdmin({ actorId: req.user!.id, action: 'session_attendance_created', targetType: 'session_attendance', targetId: data.id, targetName: `attendance:${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Session attendance created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Session attendance not found', 404);

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
  logAdmin({ actorId: req.user!.id, action: 'session_attendance_updated', targetType: 'session_attendance', targetId: id, targetName: `attendance:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Session attendance updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Session attendance not found', 404);
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
  logAdmin({ actorId: req.user!.id, action: 'session_attendance_soft_deleted', targetType: 'session_attendance', targetId: id, targetName: `attendance:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Session attendance moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Session attendance not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'session_attendance_restored', targetType: 'session_attendance', targetId: id, targetName: `attendance:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Session attendance restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Session attendance not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'session_attendance_deleted', targetType: 'session_attendance', targetId: id, targetName: `attendance:${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Session attendance permanently deleted');
}

export async function markAttendance(req: Request, res: Response) {
  const body = parseBody(req);
  const { session_id, user_id, attendance_status, joined_at } = body;

  if (!session_id || !user_id) return err(res, 'session_id and user_id are required', 400);

  const upsertData: any = { session_id, user_id, attendance_status, joined_at };
  // Nullify empty strings
  for (const k of Object.keys(upsertData)) { if (upsertData[k] === '') upsertData[k] = null; }

  const { data, error: e } = await supabase
    .from(TABLE)
    .upsert(upsertData, { onConflict: 'session_id,user_id' })
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'session_attendance_marked', targetType: 'session_attendance', targetId: data.id, targetName: `attendance:${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Attendance marked');
}
