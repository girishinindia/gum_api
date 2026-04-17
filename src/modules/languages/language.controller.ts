import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'languages:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.for_material === 'string') body.for_material = body.for_material === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') delete body[k]; }
  return body;
}

// GET /languages?for_material=true
export async function list(req: Request, res: Response) {
  const forMaterial = req.query.for_material;
  const cacheKey = forMaterial === 'true' ? 'languages:material' : CACHE_KEY;

  const cached = await redis.get(cacheKey);
  if (cached) return ok(res, JSON.parse(cached));

  let query = supabase.from('languages').select('*').order('sort_order').order('name');
  if (forMaterial === 'true') query = query.eq('for_material', true);

  const { data, error: e } = await query;
  if (e) return err(res, e.message, 500);

  await redis.set(cacheKey, JSON.stringify(data), 'EX', config.redis.cacheTtl);
  return ok(res, data);
}

// GET /languages/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('languages').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Language not found', 404);
  return ok(res, data);
}

// POST /languages
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'language', 'activate')) {
    return err(res, 'Permission denied: language:activate required to create inactive language', 403);
  }

  const { data, error: e } = await supabase.from('languages').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Language name already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  await redis.del('languages:material');
  logAdmin({ actorId: req.user!.id, action: 'language_created', targetType: 'language', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Language created', 201);
}

// PATCH /languages/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('languages').select('*').eq('id', id).single();
  if (!old) return err(res, 'Language not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'language', 'activate')) {
      return err(res, 'Permission denied: language:activate required to change active status', 403);
    }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('languages').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Language name already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  await redis.del('languages:material');
  logAdmin({ actorId: req.user!.id, action: 'language_updated', targetType: 'language', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Language updated');
}

// DELETE /languages/:id
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('languages').select('name').eq('id', id).single();
  if (!old) return err(res, 'Language not found', 404);

  const { error: e } = await supabase.from('languages').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  await redis.del('languages:material');
  logAdmin({ actorId: req.user!.id, action: 'language_deleted', targetType: 'language', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Language deleted');
}
