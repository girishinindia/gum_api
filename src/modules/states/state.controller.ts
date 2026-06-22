import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';

const CACHE_KEY = 'states:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.country_id === 'string') body.country_id = parseInt(body.country_id) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /states?country_id=1
// `maxLimit: 500` accommodates countries with hundreds of admin
// subdivisions while staying defensive against pathological queries.
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'name', maxLimit: 500 });

  let q = supabase.from('states').select('*, countries(name, iso2)', { count: 'exact' });

  // Search
  if (search) q = applySearch(q, search, { ilike: ['name', 'state_code'] });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.country_id) q = q.eq('country_id', parseInt(req.query.country_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /states/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('states').select('*, countries(name, iso2)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'State not found', 404);
  return ok(res, data);
}

// POST /states
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (typeof body.name === 'string') body.name = body.name.trim();

  if (body.is_active === false && !hasPermission(req, 'state', 'activate')) {
    return err(res, 'Permission denied: state:activate required to create inactive state', 403);
  }

  // Verify country exists
  const { data: country } = await supabase.from('countries').select('id').eq('id', body.country_id).single();
  if (!country) return err(res, 'Country not found', 404);

  // Case-insensitive duplicate guard within the country (the DB unique index is
  // case-sensitive, so "Gujarat" vs "gujarat"/extra spaces would otherwise slip through).
  if (body.name) {
    const { data: dup } = await supabase.from('states').select('id').eq('country_id', body.country_id).ilike('name', body.name).is('deleted_at', null).maybeSingle();
    if (dup) return err(res, 'A state with this name already exists in this country', 409);
  }

  const { data, error: e } = await supabase.from('states').insert(body).select('*, countries(name, iso2)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'State already exists in this country', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  // Also clear country-specific cache
  await redis.del(`states:country:${body.country_id}`);

  logAdmin({ actorId: req.user!.id, action: 'state_created', targetType: 'state', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'State created', 201);
}

// PATCH /states/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('states').select('*').eq('id', id).single();
  if (!old) return err(res, 'State not found', 404);

  const updates = parseBody(req);
  if (typeof updates.name === 'string') updates.name = updates.name.trim();

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'state', 'activate')) {
      return err(res, 'Permission denied: state:activate required to change active status', 403);
    }
  }

  // If changing country, verify it exists
  if (updates.country_id && updates.country_id !== old.country_id) {
    const { data: country } = await supabase.from('countries').select('id').eq('id', updates.country_id).single();
    if (!country) return err(res, 'Country not found', 404);
  }

  // Case-insensitive duplicate guard within the (possibly new) country, excluding self.
  const targetCountryId = updates.country_id ?? old.country_id;
  const targetName = (updates.name ?? old.name) as string | null;
  if (targetName) {
    const { data: dup } = await supabase.from('states').select('id').eq('country_id', targetCountryId).ilike('name', targetName).is('deleted_at', null).neq('id', id).maybeSingle();
    if (dup) return err(res, 'A state with this name already exists in this country', 409);
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('states').update(updates).eq('id', id).select('*, countries(name, iso2)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'State already exists in this country', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  await redis.del(`states:country:${old.country_id}`);
  if (updates.country_id && updates.country_id !== old.country_id) {
    await redis.del(`states:country:${updates.country_id}`);
  }

  logAdmin({ actorId: req.user!.id, action: 'state_updated', targetType: 'state', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'State updated');
}

// DELETE /states/:id  (soft delete — move to trash)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('states').select('name, country_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'State not found', 404);
  if (old.deleted_at) return err(res, 'State is already in trash', 400);

  // Block trashing a state that still owns city records (mirror of the country
  // guard). cities.state_id is RESTRICT, so we guard soft-delete too so a
  // state with cities can't be trashed and leave its cities orphaned.
  const { count: cityCount } = await supabase
    .from('cities')
    .select('id', { count: 'exact', head: true })
    .eq('state_id', id)
    .is('deleted_at', null);
  if (cityCount && cityCount > 0) {
    return err(res, `Cannot delete: this state has ${cityCount === 1 ? '1 city' : `${cityCount} cities`}. Delete or reassign them first.`, 409);
  }

  const { data, error: e } = await supabase
    .from('states')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  await redis.del(`states:country:${old.country_id}`);

  logAdmin({ actorId: req.user!.id, action: 'state_soft_deleted', targetType: 'state', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'State moved to trash');
}

// PATCH /states/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('states').select('name, country_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'State not found', 404);
  if (!old.deleted_at) return err(res, 'State is not in trash', 400);

  const { data, error: e } = await supabase
    .from('states')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  await redis.del(`states:country:${old.country_id}`);

  logAdmin({ actorId: req.user!.id, action: 'state_restored', targetType: 'state', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'State restored');
}

// DELETE /states/:id/permanent  (hard delete)
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('states').select('name, country_id').eq('id', id).single();
  if (!old) return err(res, 'State not found', 404);

  // Pre-check the cities FK (RESTRICT) so we return a clean, counted 409 instead
  // of a raw DB error. Counts ALL cities (incl. trashed) since the FK references
  // the rows regardless of soft-delete state.
  const { count: cityCount } = await supabase
    .from('cities')
    .select('id', { count: 'exact', head: true })
    .eq('state_id', id);
  if (cityCount && cityCount > 0) {
    return err(res, `Cannot permanently delete: this state still has ${cityCount === 1 ? '1 city' : `${cityCount} cities`}. Delete those first.`, 409);
  }

  const { error: e } = await supabase.from('states').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: cities still reference this state', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  await redis.del(`states:country:${old.country_id}`);

  logAdmin({ actorId: req.user!.id, action: 'state_deleted', targetType: 'state', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'State permanently deleted');
}
