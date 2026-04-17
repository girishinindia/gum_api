import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'cities:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.state_id === 'string') body.state_id = parseInt(body.state_id) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') delete body[k]; }
  return body;
}

// GET /cities?state_id=1
export async function list(req: Request, res: Response) {
  const stateId = req.query.state_id ? parseInt(req.query.state_id as string) : null;
  const cacheKey = stateId ? `cities:state:${stateId}` : CACHE_KEY;

  const cached = await redis.get(cacheKey);
  if (cached) return ok(res, JSON.parse(cached));

  let query = supabase.from('cities').select('*, states(name, state_code, country_id, countries(name, iso2))').order('sort_order').order('name');
  if (stateId) query = query.eq('state_id', stateId);

  const { data, error: e } = await query;
  if (e) return err(res, e.message, 500);

  await redis.set(cacheKey, JSON.stringify(data), 'EX', config.redis.cacheTtl);
  return ok(res, data);
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

// DELETE /cities/:id
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('cities').select('name, state_id').eq('id', id).single();
  if (!old) return err(res, 'City not found', 404);

  const { error: e } = await supabase.from('cities').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  await redis.del(`cities:state:${old.state_id}`);

  logAdmin({ actorId: req.user!.id, action: 'city_deleted', targetType: 'city', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'City deleted');
}
