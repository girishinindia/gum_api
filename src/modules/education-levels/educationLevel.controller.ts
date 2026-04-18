import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'education_levels:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.level_order === 'string') body.level_order = parseInt(body.level_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /education-levels?level_category=school
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'level_order' });

  let q = supabase.from('education_levels').select('*', { count: 'exact' });

  // Search
  if (search) q = q.or(`name.ilike.%${search}%,abbreviation.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.level_category) q = q.eq('level_category', req.query.level_category);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /education-levels/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('education_levels').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Education level not found', 404);
  return ok(res, data);
}

// POST /education-levels
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'education_level', 'activate')) {
    return err(res, 'Permission denied: education_level:activate required to create inactive', 403);
  }

  const { data, error: e } = await supabase.from('education_levels').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Education level name already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'education_level_created', targetType: 'education_level', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Education level created', 201);
}

// PATCH /education-levels/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('education_levels').select('*').eq('id', id).single();
  if (!old) return err(res, 'Education level not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'education_level', 'activate')) {
      return err(res, 'Permission denied: education_level:activate required to change active status', 403);
    }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('education_levels').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Education level name already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'education_level_updated', targetType: 'education_level', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Education level updated');
}

// DELETE /education-levels/:id  (soft delete — move to trash)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('education_levels').select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Education level not found', 404);
  if (old.deleted_at) return err(res, 'Education level is already in trash', 400);

  const { data, error: e } = await supabase
    .from('education_levels')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'education_level_soft_deleted', targetType: 'education_level', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Education level moved to trash');
}

// PATCH /education-levels/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('education_levels').select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Education level not found', 404);
  if (!old.deleted_at) return err(res, 'Education level is not in trash', 400);

  const { data, error: e } = await supabase
    .from('education_levels')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'education_level_restored', targetType: 'education_level', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Education level restored');
}

// DELETE /education-levels/:id/permanent  (hard delete)
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('education_levels').select('name').eq('id', id).single();
  if (!old) return err(res, 'Education level not found', 404);

  const { error: e } = await supabase.from('education_levels').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'education_level_deleted', targetType: 'education_level', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Education level permanently deleted');
}
