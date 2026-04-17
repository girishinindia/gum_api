import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'specializations:all';
const clearCache = async (category?: string) => {
  await redis.del(CACHE_KEY);
  if (category) await redis.del(`specializations:category:${category}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  for (const k of Object.keys(body)) {
    if (body[k] === '') { if (k === 'description') body[k] = null; else delete body[k]; }
  }
  return body;
}

export async function list(req: Request, res: Response) {
  const category = req.query.category as string | undefined;
  const cacheKey = category ? `specializations:category:${category}` : CACHE_KEY;

  const cached = await redis.get(cacheKey);
  if (cached) return ok(res, JSON.parse(cached));

  let query = supabase.from('specializations').select('*').order('sort_order').order('name');
  if (category) query = query.eq('category', category);

  const { data, error: e } = await query;
  if (e) return err(res, e.message, 500);

  await redis.set(cacheKey, JSON.stringify(data), 'EX', config.redis.cacheTtl);
  return ok(res, data);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('specializations').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Specialization not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'specialization', 'activate')) {
    return err(res, 'Permission denied: specialization:activate required to create inactive', 403);
  }

  const { data, error: e } = await supabase.from('specializations').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Specialization name already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(data.category);
  logAdmin({ actorId: req.user!.id, action: 'specialization_created', targetType: 'specialization', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Specialization created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('specializations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Specialization not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'specialization', 'activate')) {
      return err(res, 'Permission denied: specialization:activate required to change active status', 403);
    }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('specializations').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Specialization name already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.category);
  if (updates.category && updates.category !== old.category) await clearCache(updates.category);

  logAdmin({ actorId: req.user!.id, action: 'specialization_updated', targetType: 'specialization', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Specialization updated');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('specializations').select('name, category').eq('id', id).single();
  if (!old) return err(res, 'Specialization not found', 404);

  const { error: e } = await supabase.from('specializations').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.category);
  logAdmin({ actorId: req.user!.id, action: 'specialization_deleted', targetType: 'specialization', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Specialization deleted');
}
