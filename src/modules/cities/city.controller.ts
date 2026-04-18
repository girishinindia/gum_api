import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'cities:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.state_id === 'string') body.state_id = parseInt(body.state_id) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /cities?state_id=1
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'name' });

  let q = supabase.from('cities').select('*, states(name, state_code, country_id, countries(name, iso2))', { count: 'exact' });

  // Search
  if (search) q = q.or(`name.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.state_id) q = q.eq('state_id', parseInt(req.query.state_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /cities/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('cities').select('*, states(name, state_code, country_id, countries(name, iso2))').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'City not found', 404);
  return ok(res, data);
}

// POST /cities
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'city', 'activate')) {
    return err(res, 'Permission denied: city:activate required to create inactive city', 403);
  }

  // Verify state exists
  const { data: state } = await supabase.from('states').select('id').eq('id', body.state_id).single();
  if (!state) return err(res, 'State not found', 404);

  const { data, error: e } = await supabase.from('cities').insert(body).select('*, states(name, state_code, country_id, countries(name, iso2))').single();
  if (e) {
    if (e.code === '23505') return err(res, 'City already exists in this state', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  await redis.del(`cities:state:${body.state_id}`);

  logAdmin({ actorId: req.user!.id, action: 'city_created', targetType: 'city', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'City created', 201);
}

// PATCH /cities/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('cities').select('*').eq('id', id).single();
  if (!old) return err(res, 'City not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'city', 'activate')) {
      return err(res, 'Permission denied: city:activate required to change active status', 403);
    }
  }

  // If changing state, verify it exists
  if (updates.state_id && updates.state_id !== old.state_id) {
    const { data: state } = await supabase.from('states').select('id').eq('id', updates.state_id).single();
    if (!state) return err(res, 'State not found', 404);
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('cities').update(updates).eq('id', id).select('*, states(name, state_code, country_id, countries(name, iso2))').single();
  if (e) {
    if (e.code === '23505') return err(res, 'City already exists in this state', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  await redis.del(`cities:state:${old.state_id}`);
  if (updates.state_id && updates.state_id !== old.state_id) {
    await redis.del(`cities:state:${updates.state_id}`);
  }

  logAdmin({ actorId: req.user!.id, action: 'city_updated', targetType: 'city', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'City updated');
}

// DELETE /cities/:id  (soft delete — move to trash)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('cities').select('name, state_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'City not found', 404);
  if (old.deleted_at) return err(res, 'City is already in trash', 400);

  const { data, error: e } = await supabase
    .from('cities')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  await redis.del(`cities:state:${old.state_id}`);

  logAdmin({ actorId: req.user!.id, action: 'city_soft_deleted', targetType: 'city', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'City moved to trash');
}

// PATCH /cities/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('cities').select('name, state_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'City not found', 404);
  if (!old.deleted_at) return err(res, 'City is not in trash', 400);

  const { data, error: e } = await supabase
    .from('cities')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  await redis.del(`cities:state:${old.state_id}`);

  logAdmin({ actorId: req.user!.id, action: 'city_restored', targetType: 'city', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'City restored');
}

// DELETE /cities/:id/permanent  (hard delete)
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('cities').select('name, state_id').eq('id', id).single();
  if (!old) return err(res, 'City not found', 404);

  const { error: e } = await supabase.from('cities').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  await redis.del(`cities:state:${old.state_id}`);

  logAdmin({ actorId: req.user!.id, action: 'city_deleted', targetType: 'city', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'City permanently deleted');
}
