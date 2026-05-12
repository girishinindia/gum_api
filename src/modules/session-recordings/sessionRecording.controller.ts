import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';

const TABLE = 'session_recordings';
const CACHE_KEY = 'session_recordings:all';

const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['session_id', 'duration_seconds']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Bigint fields (use parseInt)
  if (typeof body.file_size_bytes === 'string') body.file_size_bytes = body.file_size_bytes ? parseInt(body.file_size_bytes) || null : null;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = '*, live_sessions!session_recordings_session_id_fkey(id, title, scheduled_at)';

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['title'] });
  if (req.query.session_id) q = q.eq('session_id', parseInt(req.query.session_id as string));
  if (req.query.recording_status) q = q.eq('recording_status', req.query.recording_status as string);
  if (req.query.bunny_video_id) q = q.eq('bunny_video_id', req.query.bunny_video_id as string);

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
  if (e || !data) return err(res, 'Session recording not found', 404);
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
  logAdmin({ actorId: req.user!.id, action: 'session_recording_created', targetType: 'session_recording', targetId: data.id, targetName: body.title || `recording:${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Session recording created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Session recording not found', 404);

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
  logAdmin({ actorId: req.user!.id, action: 'session_recording_updated', targetType: 'session_recording', targetId: id, targetName: updates.title || old.title || `recording:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Session recording updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Session recording not found', 404);
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
  logAdmin({ actorId: req.user!.id, action: 'session_recording_soft_deleted', targetType: 'session_recording', targetId: id, targetName: old.title || `recording:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Session recording moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Session recording not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'session_recording_restored', targetType: 'session_recording', targetId: id, targetName: old.title || `recording:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Session recording restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id as string);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Session recording not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'session_recording_deleted', targetType: 'session_recording', targetId: id, targetName: old.title || `recording:${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Session recording permanently deleted');
}
