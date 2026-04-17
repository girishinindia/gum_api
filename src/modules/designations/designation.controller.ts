import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
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
  for (const k of Object.keys(body)) { if (body[k] === '') delete body[k]; }
  return body;
}

// GET /designations?level_band=senior
export async function list(req: Request, res: Response) {
  const band = req.query.level_band as string | undefined;
  const cacheKey = band ? `designations:band:${band}` : CACHE_KEY;

  const cached = await redis.get(cacheKey);
  if (cached) return ok(res, JSON.parse(cached));

  let query = supabase.from('designations').select('*').order('level').order('sort_order').order('name');
  if (band) query = query.eq('level_band', band);

  const { data, error: e } = await query;
  if (e) return err(res, e.message, 500);

  await redis.set(cacheKey, JSON.stringify(data), 'EX', config.redis.cacheTtl);
  return ok(res, data);
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

// DELETE /designations/:id
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
