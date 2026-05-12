import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch, SEARCH_CONFIGS } from '../../utils/search';

const TABLE = 'enrollments';
const CACHE_KEY = 'enrollments:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['user_id', 'order_id', 'order_item_id', 'item_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of ['progress_pct']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseFloat(body[k]) || null : null;
  }
  if (typeof body.metadata === 'string') {
    try { body.metadata = JSON.parse(body.metadata); } catch { body.metadata = null; }
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, users!enrollments_user_id_fkey(full_name, email), orders(order_number)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, SEARCH_CONFIGS.enrollments);
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.item_type) q = q.eq('item_type', req.query.item_type as string);
  if (req.query.enrollment_status) q = q.eq('enrollment_status', req.query.enrollment_status as string);

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
  if (e || !data) return err(res, 'Enrollment not found', 404);

  // Also fetch enrollment_progress records
  const { data: progress } = await supabase.from('enrollment_progress').select('*').eq('enrollment_id', data.id).order('created_at', { ascending: true });

  return ok(res, { ...data, enrollment_progress: progress || [] });
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.user_id) return err(res, 'user_id is required', 400);
  if (!body.item_type) return err(res, 'item_type is required', 400);
  if (!body.item_id) return err(res, 'item_id is required', 400);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_created', targetType: 'enrollment', targetId: data.id, targetName: `Enrollment #${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Enrollment created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Enrollment not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_updated', targetType: 'enrollment', targetId: id, targetName: `Enrollment #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Enrollment updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Enrollment not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete related enrollment_progress
  await supabase.from('enrollment_progress').update({ deleted_at: now, is_active: false }).eq('enrollment_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_soft_deleted', targetType: 'enrollment', targetId: id, targetName: `Enrollment #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Enrollment moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Enrollment not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore related enrollment_progress
  await supabase.from('enrollment_progress').update({ deleted_at: null, is_active: true }).eq('enrollment_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_restored', targetType: 'enrollment', targetId: id, targetName: `Enrollment #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Enrollment restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Enrollment not found', 404);

  // Cascade handles enrollment_progress deletion
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_deleted', targetType: 'enrollment', targetId: id, targetName: `Enrollment #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Enrollment permanently deleted');
}

export async function getByUser(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' }).eq('user_id', userId).is('deleted_at', null);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getProgress(req: Request, res: Response) {
  const enrollmentId = parseInt(req.params.id);

  const { data: enrollment } = await supabase.from(TABLE).select('id').eq('id', enrollmentId).single();
  if (!enrollment) return err(res, 'Enrollment not found', 404);

  const { data, error: e } = await supabase.from('enrollment_progress').select('*').eq('enrollment_id', enrollmentId).order('created_at', { ascending: true });
  if (e) return err(res, e.message, 500);

  return ok(res, data || []);
}

export async function updateProgress(req: Request, res: Response) {
  const enrollmentId = parseInt(req.params.id);

  const { data: enrollment } = await supabase.from(TABLE).select('id').eq('id', enrollmentId).single();
  if (!enrollment) return err(res, 'Enrollment not found', 404);

  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }

  body.enrollment_id = enrollmentId;

  // Check if progress record already exists for this content
  const { data: existing } = await supabase
    .from('enrollment_progress')
    .select('id')
    .eq('enrollment_id', enrollmentId)
    .eq('content_type', body.content_type)
    .eq('content_id', body.content_id)
    .single();

  let progressData;
  if (existing) {
    // Update existing progress record
    body.updated_by = req.user!.id;
    const { data, error: e } = await supabase.from('enrollment_progress').update(body).eq('id', existing.id).select().single();
    if (e) return err(res, e.message, 500);
    progressData = data;
  } else {
    // Insert new progress record
    body.created_by = req.user!.id;
    const { data, error: e } = await supabase.from('enrollment_progress').insert(body).select().single();
    if (e) return err(res, e.message, 500);
    progressData = data;
  }

  // Recalculate enrollment progress_pct based on completed/total progress items
  const { count: totalCount } = await supabase.from('enrollment_progress').select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollmentId).is('deleted_at', null);
  const { count: completedCount } = await supabase.from('enrollment_progress').select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollmentId).eq('progress_status', 'completed').is('deleted_at', null);

  const total = totalCount || 0;
  const completed = completedCount || 0;
  const progressPct = total > 0 ? Math.round((completed / total) * 10000) / 100 : 0;

  await supabase.from(TABLE).update({ progress_pct: progressPct, updated_by: req.user!.id }).eq('id', enrollmentId);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'enrollment_progress_updated', targetType: 'enrollment_progress', targetId: progressData.id, targetName: `Progress #${progressData.id}`, ip: getClientIp(req) });
  return ok(res, { ...progressData, enrollment_progress_pct: progressPct }, existing ? 'Progress updated' : 'Progress created', existing ? 200 : 201);
}
