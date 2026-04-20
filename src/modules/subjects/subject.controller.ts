import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'subjects:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.estimated_hours === 'string') body.estimated_hours = parseFloat(body.estimated_hours) || null;
  delete body.view_count;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('subjects').select('*', { count: 'exact' });

  if (search) q = q.or(`code.ilike.%${search}%,slug.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filter by active status
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('subjects').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Subject not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'subject', 'activate')) {
    return err(res, 'Permission denied: subject:activate required to create inactive', 403);
  }

  // Set audit field
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('subjects').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Subject code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_created', targetType: 'subject', targetId: data.id, targetName: data.code, ip: getClientIp(req) });
  return ok(res, data, 'Subject created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subjects').select('*').eq('id', id).single();
  if (!old) return err(res, 'Subject not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'subject', 'activate')) {
      return err(res, 'Permission denied: subject:activate required to change active status', 403);
    }
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('subjects').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Subject code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') {
      // skip audit field from changes
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_updated', targetType: 'subject', targetId: id, targetName: data.code, changes, ip: getClientIp(req) });

  return ok(res, data, 'Subject updated');
}

// DELETE /subjects/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subjects').select('code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Subject not found', 404);
  if (old.deleted_at) return err(res, 'Subject is already in trash', 400);

  const { data, error: e } = await supabase
    .from('subjects')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_soft_deleted', targetType: 'subject', targetId: id, targetName: old.code, ip: getClientIp(req) });
  return ok(res, data, 'Subject moved to trash');
}

// PATCH /subjects/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subjects').select('code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Subject not found', 404);
  if (!old.deleted_at) return err(res, 'Subject is not in trash', 400);

  const { data, error: e } = await supabase
    .from('subjects')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_restored', targetType: 'subject', targetId: id, targetName: old.code, ip: getClientIp(req) });
  return ok(res, data, 'Subject restored');
}

// DELETE /subjects/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('subjects').select('code').eq('id', id).single();
  if (!old) return err(res, 'Subject not found', 404);

  const { error: e } = await supabase.from('subjects').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: chapters or translations still reference this subject', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'subject_deleted', targetType: 'subject', targetId: id, targetName: old.code, ip: getClientIp(req) });

  return ok(res, null, 'Subject deleted');
}
