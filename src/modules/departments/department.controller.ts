import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'departments:all';
const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.parent_department_id === 'string') body.parent_department_id = body.parent_department_id === 'null' ? null : parseInt(body.parent_department_id) || null;
  if (typeof body.head_user_id === 'string') body.head_user_id = body.head_user_id === 'null' ? null : parseInt(body.head_user_id) || null;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /departments?page=1&limit=20&search=foo&sort=name&order=asc&parent_department_id=null
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'name' });

  // NOTE: Self-referencing FK join (departments→departments) is not reliably supported
  // by PostgREST schema cache. We fetch parent_department_id as a plain field and
  // resolve the parent name on the client side from the full list.
  const selectFields = '*, head:users!departments_head_user_id_fkey(full_name, email)';
  let q = supabase.from('departments').select(selectFields, { count: 'exact' });

  // Search
  if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%,description.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filter by is_active
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Filter by parent_department_id
  if (req.query.parent_department_id !== undefined) {
    if (req.query.parent_department_id === 'null') {
      q = q.is('parent_department_id', null);
    } else {
      q = q.eq('parent_department_id', req.query.parent_department_id);
    }
  }

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /departments/:id
export async function getById(req: Request, res: Response) {
  const selectFields = '*, head:users!departments_head_user_id_fkey(full_name, email)';
  const { data, error: e } = await supabase.from('departments').select(selectFields).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Department not found', 404);
  return ok(res, data);
}

// POST /departments
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'department', 'activate')) {
    return err(res, 'Permission denied: department:activate required to create inactive', 403);
  }

  // Prevent self-reference (guard against both being undefined)
  if (body.parent_department_id != null && body.parent_department_id === body.id) {
    return err(res, 'A department cannot be its own parent', 400);
  }

  // Verify parent department exists if provided
  if (body.parent_department_id) {
    const { data: parent } = await supabase.from('departments').select('id').eq('id', body.parent_department_id).single();
    if (!parent) return err(res, 'Parent department not found', 404);
  }

  // Verify head user exists if provided
  if (body.head_user_id) {
    const { data: user } = await supabase.from('users').select('id').eq('id', body.head_user_id).single();
    if (!user) return err(res, 'Head user not found', 404);
  }

  const selectFields = '*, head:users!departments_head_user_id_fkey(full_name, email)';
  const { data, error: e } = await supabase.from('departments').insert(body).select(selectFields).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Department name or code already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'department_created', targetType: 'department', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Department created', 201);
}

// PATCH /departments/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const selectFields = '*, head:users!departments_head_user_id_fkey(full_name, email)';
  const { data: old } = await supabase.from('departments').select('*').eq('id', id).single();
  if (!old) return err(res, 'Department not found', 404);
  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'department', 'activate')) {
      return err(res, 'Permission denied: department:activate required to change active status', 403);
    }
  }

  // Prevent self-reference
  if ('parent_department_id' in updates && updates.parent_department_id === id) {
    return err(res, 'A department cannot be its own parent', 400);
  }

  // Verify parent department exists if provided and changed
  if ('parent_department_id' in updates && updates.parent_department_id) {
    const { data: parent } = await supabase.from('departments').select('id').eq('id', updates.parent_department_id).single();
    if (!parent) return err(res, 'Parent department not found', 404);
  }

  // Verify head user exists if provided and changed
  if ('head_user_id' in updates && updates.head_user_id) {
    const { data: user } = await supabase.from('users').select('id').eq('id', updates.head_user_id).single();
    if (!user) return err(res, 'Head user not found', 404);
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('departments').update(updates).eq('id', id).select(selectFields).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Department name or code already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'department_updated', targetType: 'department', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Department updated');
}

// DELETE /departments/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('departments').select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Department not found', 404);
  if (old.deleted_at) return err(res, 'Department is already in trash', 400);

  const { data, error: e } = await supabase
    .from('departments')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'department_soft_deleted', targetType: 'department', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Department moved to trash');
}

// PATCH /departments/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('departments').select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Department not found', 404);
  if (!old.deleted_at) return err(res, 'Department is not in trash', 400);

  const { data, error: e } = await supabase
    .from('departments')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'department_restored', targetType: 'department', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Department restored');
}

// DELETE /departments/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('departments').select('name').eq('id', id).single();
  if (!old) return err(res, 'Department not found', 404);

  const { error: e } = await supabase.from('departments').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'department_deleted', targetType: 'department', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Department deleted');
}
