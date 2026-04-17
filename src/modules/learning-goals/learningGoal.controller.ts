import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'learning_goals:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return ok(res, JSON.parse(cached));

  const { data, error: e } = await supabase.from('learning_goals').select('*').order('display_order').order('sort_order').order('name');
  if (e) return err(res, e.message, 500);

  await redis.set(CACHE_KEY, JSON.stringify(data), 'EX', config.redis.cacheTtl);
  return ok(res, data);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('learning_goals').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Learning goal not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'learning_goal', 'activate')) {
    return err(res, 'Permission denied: learning_goal:activate required to create inactive', 403);
  }

  const { data, error: e } = await supabase.from('learning_goals').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Learning goal name already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'learning_goal_created', targetType: 'learning_goal', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Learning goal created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('learning_goals').select('*').eq('id', id).single();
  if (!old) return err(res, 'Learning goal not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'learning_goal', 'activate')) {
      return err(res, 'Permission denied: learning_goal:activate required to change active status', 403);
    }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('learning_goals').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Learning goal name already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'learning_goal_updated', targetType: 'learning_goal', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Learning goal updated');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('learning_goals').select('name').eq('id', id).single();
  if (!old) return err(res, 'Learning goal not found', 404);

  const { error: e } = await supabase.from('learning_goals').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'learning_goal_deleted', targetType: 'learning_goal', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Learning goal deleted');
}
