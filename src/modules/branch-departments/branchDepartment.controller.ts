import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'branch_departments:all';
const clearCache = async (branchId?: number) => {
  await redis.del(CACHE_KEY);
  if (branchId) await redis.del(`branch_departments:branch:${branchId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.branch_id === 'string') body.branch_id = parseInt(body.branch_id);
  if (typeof body.department_id === 'string') body.department_id = parseInt(body.department_id);
  if (typeof body.local_head_user_id === 'string') body.local_head_user_id = parseInt(body.local_head_user_id) || null;
  if (typeof body.employee_capacity === 'string') body.employee_capacity = parseInt(body.employee_capacity) || null;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const SELECT_FIELDS = '*, branches(name, code, branch_type), departments(name, code), local_head:users!branch_departments_local_head_user_id_fkey(full_name, email)';

// GET /branch-departments?branch_id=1&department_id=2&page=1&limit=20&sort=sort_order&order=asc
export async function list(req: Request, res: Response) {
  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'sort_order' });

  let q = supabase.from('branch_departments').select(SELECT_FIELDS, { count: 'exact' });

  // Filters
  if (req.query.branch_id) q = q.eq('branch_id', req.query.branch_id);
  if (req.query.department_id) q = q.eq('department_id', req.query.department_id);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /branch-departments/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('branch_departments').select(SELECT_FIELDS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Branch department not found', 404);
  return ok(res, data);
}

// POST /branch-departments
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'branch_department', 'activate')) {
    return err(res, 'Permission denied: branch_department:activate required to create inactive', 403);
  }

  // Verify branch exists
  const { data: branch } = await supabase.from('branches').select('id, name').eq('id', body.branch_id).single();
  if (!branch) return err(res, 'Branch not found', 404);

  // Verify department exists
  const { data: dept } = await supabase.from('departments').select('id, name').eq('id', body.department_id).single();
  if (!dept) return err(res, 'Department not found', 404);

  // Verify local_head_user exists if provided
  if (body.local_head_user_id) {
    const { data: user } = await supabase.from('users').select('id').eq('id', body.local_head_user_id).single();
    if (!user) return err(res, 'User not found', 404);
  }

  const { data, error: e } = await supabase.from('branch_departments').insert(body).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This department is already assigned to this branch', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.branch_id);
  logAdmin({ actorId: req.user!.id, action: 'branch_department_created', targetType: 'branch_department', targetId: data.id, targetName: `${branch.name} - ${dept.name}`, ip: getClientIp(req) });
  return ok(res, data, 'Branch department created', 201);
}

// PATCH /branch-departments/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('branch_departments').select('*').eq('id', id).single();
  if (!old) return err(res, 'Branch department not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'branch_department', 'activate')) {
      return err(res, 'Permission denied: branch_department:activate required to change active status', 403);
    }
  }

  // Verify changed FKs
  if (updates.branch_id && updates.branch_id !== old.branch_id) {
    const { data: branch } = await supabase.from('branches').select('id, name').eq('id', updates.branch_id).single();
    if (!branch) return err(res, 'Branch not found', 404);
  }

  if (updates.department_id && updates.department_id !== old.department_id) {
    const { data: dept } = await supabase.from('departments').select('id, name').eq('id', updates.department_id).single();
    if (!dept) return err(res, 'Department not found', 404);
  }

  if (updates.local_head_user_id && updates.local_head_user_id !== old.local_head_user_id) {
    const { data: user } = await supabase.from('users').select('id').eq('id', updates.local_head_user_id).single();
    if (!user) return err(res, 'User not found', 404);
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('branch_departments').update(updates).eq('id', id).select(SELECT_FIELDS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'This department is already assigned to this branch', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.branch_id);
  if (updates.branch_id && updates.branch_id !== old.branch_id) await clearCache(updates.branch_id);

  logAdmin({ actorId: req.user!.id, action: 'branch_department_updated', targetType: 'branch_department', targetId: id, targetName: `${data.branches.name} - ${data.departments.name}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Branch department updated');
}

// DELETE /branch-departments/:id
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('branch_departments').select('branch_id, branches(name), departments(name)').eq('id', id).single();
  if (!old) return err(res, 'Branch department not found', 404);

  const { error: e } = await supabase.from('branch_departments').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.branch_id);
  logAdmin({ actorId: req.user!.id, action: 'branch_department_deleted', targetType: 'branch_department', targetId: id, targetName: `${(old.branches as any).name} - ${(old.departments as any).name}`, ip: getClientIp(req) });
  return ok(res, null, 'Branch department deleted');
}
