import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'employee_profiles:all';
const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

const SELECT_WITH_JOINS = `*, designations(name, code), departments(name), branches(name, code), users!employee_profiles_reporting_manager_id_fkey(full_name, email), shift_branch:branches!employee_profiles_shift_branch_id_fkey(name, code), user:users!employee_profiles_user_id_fkey(id, full_name, email, mobile, avatar_url)`;

function parseBody(req: Request): any {
  const body: any = { ...req.body };

  // Parse booleans
  for (const key of ['is_active', 'has_system_access', 'has_email_access', 'has_vpn_access', 'exit_interview_done', 'full_and_final_done']) {
    if (typeof body[key] === 'string') body[key] = body[key] === 'true';
  }

  // Parse numbers
  for (const key of ['designation_id', 'department_id', 'branch_id', 'reporting_manager_id', 'shift_branch_id', 'notice_period_days', 'sort_order']) {
    if (typeof body[key] === 'string') body[key] = parseInt(body[key]) || null;
  }

  // Empty strings to null
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }

  return body;
}

// GET /employee-profiles?page=1&limit=20&search=foo&sort=employee_code&order=asc
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'employee_code' });

  let q = supabase.from('employee_profiles').select(SELECT_WITH_JOINS, { count: 'exact' });

  // Search by employee_code or user full_name
  if (search) {
    // Search users table for matching IDs
    const { data: matchedUsers } = await supabase
      .from('users')
      .select('id')
      .ilike('full_name', `%${search}%`);

    const userIds = (matchedUsers || []).map((u: any) => u.id);

    if (userIds.length > 0) {
      q = q.or(`employee_code.ilike.%${search}%,user_id.in.(${userIds.join(',')})`);
    } else {
      q = q.ilike('employee_code', `%${search}%`);
    }
  }

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.employee_type) q = q.eq('employee_type', req.query.employee_type);
  if (req.query.branch_id) q = q.eq('branch_id', req.query.branch_id);
  if (req.query.department_id) q = q.eq('department_id', req.query.department_id);
  if (req.query.designation_id) q = q.eq('designation_id', req.query.designation_id);
  if (req.query.work_mode) q = q.eq('work_mode', req.query.work_mode);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /employee-profiles/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('employee_profiles').select(SELECT_WITH_JOINS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Employee profile not found', 404);
  return ok(res, data);
}

// POST /employee-profiles
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  // Verify user_id exists
  if (!body.user_id) return err(res, 'user_id is required', 400);
  const { data: user } = await supabase.from('users').select('id, full_name').eq('id', body.user_id).single();
  if (!user) return err(res, 'User not found', 404);

  // Verify user has no existing profile
  const { data: existingProfile } = await supabase.from('employee_profiles').select('id').eq('user_id', body.user_id).single();
  if (existingProfile) return err(res, 'User already has an employee profile', 409);

  // Verify designation_id exists
  if (body.designation_id) {
    const { data: designation } = await supabase.from('designations').select('id').eq('id', body.designation_id).single();
    if (!designation) return err(res, 'Designation not found', 404);
  }

  // Verify department_id exists
  if (body.department_id) {
    const { data: department } = await supabase.from('departments').select('id').eq('id', body.department_id).single();
    if (!department) return err(res, 'Department not found', 404);
  }

  // Verify branch_id exists
  if (body.branch_id) {
    const { data: branch } = await supabase.from('branches').select('id').eq('id', body.branch_id).single();
    if (!branch) return err(res, 'Branch not found', 404);
  }

  // Verify reporting_manager_id exists
  if (body.reporting_manager_id) {
    const { data: manager } = await supabase.from('users').select('id').eq('id', body.reporting_manager_id).single();
    if (!manager) return err(res, 'Reporting manager not found', 404);
  }

  // Verify shift_branch_id exists
  if (body.shift_branch_id) {
    const { data: shiftBranch } = await supabase.from('branches').select('id').eq('id', body.shift_branch_id).single();
    if (!shiftBranch) return err(res, 'Shift branch not found', 404);
  }

  // Set created_by
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('employee_profiles').insert(body).select(SELECT_WITH_JOINS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Employee code already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'employee_profile_created', targetType: 'employee_profile', targetId: data.id, targetName: data.employee_code, ip: getClientIp(req) });
  return ok(res, data, 'Employee profile created', 201);
}

// PATCH /employee-profiles/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('employee_profiles').select('*').eq('id', id).single();
  if (!old) return err(res, 'Employee profile not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'employee_profile', 'activate')) {
      return err(res, 'Permission denied: employee_profile:activate required to change active status', 403);
    }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  // Verify foreign keys if changed
  if ('designation_id' in updates && updates.designation_id !== old.designation_id && updates.designation_id) {
    const { data: designation } = await supabase.from('designations').select('id').eq('id', updates.designation_id).single();
    if (!designation) return err(res, 'Designation not found', 404);
  }

  if ('department_id' in updates && updates.department_id !== old.department_id && updates.department_id) {
    const { data: department } = await supabase.from('departments').select('id').eq('id', updates.department_id).single();
    if (!department) return err(res, 'Department not found', 404);
  }

  if ('branch_id' in updates && updates.branch_id !== old.branch_id && updates.branch_id) {
    const { data: branch } = await supabase.from('branches').select('id').eq('id', updates.branch_id).single();
    if (!branch) return err(res, 'Branch not found', 404);
  }

  if ('reporting_manager_id' in updates && updates.reporting_manager_id !== old.reporting_manager_id && updates.reporting_manager_id) {
    const { data: manager } = await supabase.from('users').select('id').eq('id', updates.reporting_manager_id).single();
    if (!manager) return err(res, 'Reporting manager not found', 404);
  }

  if ('shift_branch_id' in updates && updates.shift_branch_id !== old.shift_branch_id && updates.shift_branch_id) {
    const { data: shiftBranch } = await supabase.from('branches').select('id').eq('id', updates.shift_branch_id).single();
    if (!shiftBranch) return err(res, 'Shift branch not found', 404);
  }

  // Set updated_by
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from('employee_profiles').update(updates).eq('id', id).select(SELECT_WITH_JOINS).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Employee code already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'employee_profile_updated', targetType: 'employee_profile', targetId: id, targetName: data.employee_code, changes, ip: getClientIp(req) });
  return ok(res, data, 'Employee profile updated');
}

// DELETE /employee-profiles/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('employee_profiles').select('employee_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Employee profile not found', 404);
  if (old.deleted_at) return err(res, 'Employee profile is already in trash', 400);

  const { data, error: e } = await supabase
    .from('employee_profiles')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'employee_profile_soft_deleted', targetType: 'employee_profile', targetId: id, targetName: old.employee_code, ip: getClientIp(req) });
  return ok(res, data, 'Employee profile moved to trash');
}

// PATCH /employee-profiles/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('employee_profiles').select('employee_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Employee profile not found', 404);
  if (!old.deleted_at) return err(res, 'Employee profile is not in trash', 400);

  const { data, error: e } = await supabase
    .from('employee_profiles')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'employee_profile_restored', targetType: 'employee_profile', targetId: id, targetName: old.employee_code, ip: getClientIp(req) });
  return ok(res, data, 'Employee profile restored');
}

// DELETE /employee-profiles/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('employee_profiles').select('employee_code').eq('id', id).single();
  if (!old) return err(res, 'Employee profile not found', 404);

  const { error: e } = await supabase.from('employee_profiles').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'employee_profile_deleted', targetType: 'employee_profile', targetId: id, targetName: old.employee_code, ip: getClientIp(req) });
  return ok(res, null, 'Employee profile deleted');
}

// GET /employee-profiles/user/:userId
export async function getByUserId(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data, error: e } = await supabase.from('employee_profiles')
    .select(SELECT_WITH_JOINS)
    .eq('user_id', userId)
    .maybeSingle();
  if (e) return err(res, e.message, 500);
  return ok(res, data);
}

// PUT /employee-profiles/user/:userId (upsert by user ID)
export async function upsertByUserId(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data: user } = await supabase.from('users').select('id, full_name').eq('id', userId).single();
  if (!user) return err(res, 'User not found', 404);

  const body = parseBody(req);
  const { data: existing } = await supabase.from('employee_profiles').select('id').eq('user_id', userId).maybeSingle();

  let data: any;
  let action: string;

  if (existing) {
    const { data: updated, error: e } = await supabase.from('employee_profiles')
      .update({ ...body, updated_by: req.user!.id })
      .eq('user_id', userId)
      .select(SELECT_WITH_JOINS)
      .single();
    if (e) return err(res, e.message, 500);
    data = updated;
    action = 'employee_profile_updated';
  } else {
    const { data: created, error: e } = await supabase.from('employee_profiles')
      .insert({ ...body, user_id: userId, created_by: req.user!.id })
      .select(SELECT_WITH_JOINS)
      .single();
    if (e) {
      if (e.code === '23505') return err(res, 'Employee profile already exists for this user', 409);
      return err(res, e.message, 500);
    }
    data = created;
    action = 'employee_profile_created';
  }

  logAdmin({ actorId: req.user!.id, action, targetType: 'employee_profile', targetId: userId, targetName: user.full_name, ip: getClientIp(req) });
  return ok(res, data, existing ? 'Profile updated' : 'Profile created');
}
