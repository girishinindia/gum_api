import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'designations:all';
const clearCache = async (band?: string) => {
  await redis.del(CACHE_KEY);
  if (band) await redis.del(`designations:band:${band}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.level === 'string') body.level = parseInt(body.level) || 1;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /designations?level_band=senior&page=1&limit=20&search=foo&sort=level&order=asc
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'level' });

  let q = supabase.from('designations').select('*', { count: 'exact' });

  // Search
  if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.level_band) q = q.eq('level_band', req.query.level_band);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /designations/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('designations').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Designation not found', 404);
  return ok(res, data);
}

// POST /designations
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'designation', 'activate')) {
    return err(res, 'Permission denied: designation:activate required to create inactive', 403);
  }

  const { data, error: e } = await supabase.from('designations').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Designation name or code already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(data.level_band);
  logAdmin({ actorId: req.user!.id, action: 'designation_created', targetType: 'designation', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Designation created', 201);
}

// PATCH /designations/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('designations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Designation not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'designation', 'activate')) {
      return err(res, 'Permission denied: designation:activate required to change active status', 403);
    }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('designations').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Designation name or code already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.level_band);
  if (updates.level_band && updates.level_band !== old.level_band) await clearCache(updates.level_band);

  logAdmin({ actorId: req.user!.id, action: 'designation_updated', targetType: 'designation', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Designation updated');
}

// DELETE /designations/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('designations').select('name, level_band, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Designation not found', 404);
  if (old.deleted_at) return err(res, 'Designation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('designations')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.level_band);
  logAdmin({ actorId: req.user!.id, action: 'designation_soft_deleted', targetType: 'designation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Designation moved to trash');
}

// PATCH /designations/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('designations').select('name, level_band, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Designation not found', 404);
  if (!old.deleted_at) return err(res, 'Designation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('designations')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.level_band);
  logAdmin({ actorId: req.user!.id, action: 'designation_restored', targetType: 'designation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Designation restored');
}

// DELETE /designations/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('designations').select('name, level_band').eq('id', id).single();
  if (!old) return err(res, 'Designation not found', 404);

  const { error: e } = await supabase.from('designations').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.level_band);
  logAdmin({ actorId: req.user!.id, action: 'designation_deleted', targetType: 'designation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Designation deleted');
}
