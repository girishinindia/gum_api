import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'branches:all';
const clearCache = async (countryId?: number) => {
  await redis.del(CACHE_KEY);
  if (countryId) await redis.del(`branches:country:${countryId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.country_id === 'string') body.country_id = parseInt(body.country_id) || null;
  if (typeof body.state_id === 'string') body.state_id = parseInt(body.state_id) || null;
  if (typeof body.city_id === 'string') body.city_id = parseInt(body.city_id) || null;
  if (typeof body.branch_manager_id === 'string') body.branch_manager_id = parseInt(body.branch_manager_id) || null;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /branches?country_id=1&state_id=2&city_id=3&branch_type=office&page=1&limit=20&search=foo&sort=name&order=asc
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'name' });

  let q = supabase.from('branches').select('*, countries(name, iso2), states(name, state_code), cities(name), users!branches_branch_manager_id_fkey(full_name, email)', { count: 'exact' });

  // Search
  if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%,email.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.country_id) q = q.eq('country_id', req.query.country_id);
  if (req.query.state_id) q = q.eq('state_id', req.query.state_id);
  if (req.query.city_id) q = q.eq('city_id', req.query.city_id);
  if (req.query.branch_type) q = q.eq('branch_type', req.query.branch_type);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /branches/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('branches').select('*, countries(name, iso2), states(name, state_code), cities(name), users!branches_branch_manager_id_fkey(full_name, email)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Branch not found', 404);
  return ok(res, data);
}

// POST /branches
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'branch', 'activate')) {
    return err(res, 'Permission denied: branch:activate required to create inactive', 403);
  }

  // Verify foreign keys if provided
  if (body.country_id) {
    const { data: country } = await supabase.from('countries').select('id').eq('id', body.country_id).single();
    if (!country) return err(res, 'Country not found', 404);
  }

  if (body.state_id) {
    const { data: state } = await supabase.from('states').select('id').eq('id', body.state_id).single();
    if (!state) return err(res, 'State not found', 404);
  }

  if (body.city_id) {
    const { data: city } = await supabase.from('cities').select('id').eq('id', body.city_id).single();
    if (!city) return err(res, 'City not found', 404);
  }

  if (body.branch_manager_id) {
    const { data: manager } = await supabase.from('users').select('id').eq('id', body.branch_manager_id).single();
    if (!manager) return err(res, 'Branch manager not found', 404);
  }

  const { data, error: e } = await supabase.from('branches').insert(body).select('*, countries(name, iso2), states(name, state_code), cities(name), users!branches_branch_manager_id_fkey(full_name, email)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Branch code already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(data.country_id);
  logAdmin({ actorId: req.user!.id, action: 'branch_created', targetType: 'branch', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Branch created', 201);
}

// PATCH /branches/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('branches').select('*').eq('id', id).single();
  if (!old) return err(res, 'Branch not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'branch', 'activate')) {
      return err(res, 'Permission denied: branch:activate required to change active status', 403);
    }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  // Verify foreign keys if changed
  if ('country_id' in updates && updates.country_id !== old.country_id && updates.country_id) {
    const { data: country } = await supabase.from('countries').select('id').eq('id', updates.country_id).single();
    if (!country) return err(res, 'Country not found', 404);
  }

  if ('state_id' in updates && updates.state_id !== old.state_id && updates.state_id) {
    const { data: state } = await supabase.from('states').select('id').eq('id', updates.state_id).single();
    if (!state) return err(res, 'State not found', 404);
  }

  if ('city_id' in updates && updates.city_id !== old.city_id && updates.city_id) {
    const { data: city } = await supabase.from('cities').select('id').eq('id', updates.city_id).single();
    if (!city) return err(res, 'City not found', 404);
  }

  if ('branch_manager_id' in updates && updates.branch_manager_id !== old.branch_manager_id && updates.branch_manager_id) {
    const { data: manager } = await supabase.from('users').select('id').eq('id', updates.branch_manager_id).single();
    if (!manager) return err(res, 'Branch manager not found', 404);
  }

  const { data, error: e } = await supabase.from('branches').update(updates).eq('id', id).select('*, countries(name, iso2), states(name, state_code), cities(name), users!branches_branch_manager_id_fkey(full_name, email)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Branch code already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.country_id);
  if (updates.country_id && updates.country_id !== old.country_id) await clearCache(updates.country_id);

  logAdmin({ actorId: req.user!.id, action: 'branch_updated', targetType: 'branch', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Branch updated');
}

// DELETE /branches/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('branches').select('name, country_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Branch not found', 404);
  if (old.deleted_at) return err(res, 'Branch is already in trash', 400);

  const { data, error: e } = await supabase
    .from('branches')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.country_id);
  logAdmin({ actorId: req.user!.id, action: 'branch_soft_deleted', targetType: 'branch', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Branch moved to trash');
}

// PATCH /branches/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('branches').select('name, country_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Branch not found', 404);
  if (!old.deleted_at) return err(res, 'Branch is not in trash', 400);

  const { data, error: e } = await supabase
    .from('branches')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.country_id);
  logAdmin({ actorId: req.user!.id, action: 'branch_restored', targetType: 'branch', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Branch restored');
}

// DELETE /branches/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('branches').select('name, country_id').eq('id', id).single();
  if (!old) return err(res, 'Branch not found', 404);

  const { error: e } = await supabase.from('branches').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.country_id);
  logAdmin({ actorId: req.user!.id, action: 'branch_deleted', targetType: 'branch', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Branch deleted');
}
