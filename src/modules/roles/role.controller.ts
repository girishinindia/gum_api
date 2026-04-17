import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { hasPermission, clearPermissionCacheForRole, revokeSessionsForRole } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

const ALLOWED_FIELDS = ['name', 'display_name', 'description', 'level'];

export async function list(_req: Request, res: Response) {
  const { data, error: e } = await supabase.from('roles').select('*').order('level', { ascending: false });
  if (e) return err(res, e.message, 500);
  return ok(res, data);
}

export async function getById(req: Request, res: Response) {
  const { data: role } = await supabase.from('roles').select('*').eq('id', req.params.id).single();
  if (!role) return err(res, 'Role not found', 404);
  const { data: perms } = await supabase.from('role_permissions').select('*, permissions(resource, action, display_name)').eq('role_id', req.params.id);
  return ok(res, { ...role, permissions: perms });
}

export async function create(req: Request, res: Response) {
  const body: any = {};
  for (const k of [...ALLOWED_FIELDS, 'is_active']) { if (req.body[k] !== undefined) body[k] = req.body[k]; }

  if (body.is_active === false && !hasPermission(req, 'role', 'activate')) {
    return err(res, 'Permission denied: role:activate required', 403);
  }

  const { data, error: e } = await supabase.from('roles').insert(body).select().single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'role_created', targetType: 'role', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Role created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('roles').select('*').eq('id', id).single();
  if (!old) return err(res, 'Role not found', 404);
  if (old.is_system && (req.body.name !== undefined || req.body.level !== undefined)) {
    return err(res, 'Cannot change name or level of system roles', 403);
  }

  const updates: any = {};
  for (const k of ALLOWED_FIELDS) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }

  if (req.body.is_active !== undefined && req.body.is_active !== old.is_active) {
    if (old.is_system && req.body.is_active === false) return err(res, 'Cannot deactivate system roles', 403);
    if (!hasPermission(req, 'role', 'activate')) return err(res, 'Permission denied: role:activate required', 403);
    updates.is_active = req.body.is_active;
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('roles').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if ((old as any)[k] !== updates[k]) changes[k] = { old: (old as any)[k], new: updates[k] };
  }
  logAdmin({ actorId: req.user!.id, action: 'role_updated', targetType: 'role', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Role updated');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: role } = await supabase.from('roles').select('name, is_system').eq('id', id).single();
  if (!role) return err(res, 'Role not found', 404);
  if (role.is_system) return err(res, 'Cannot delete system roles', 403);

  const { error: e } = await supabase.from('roles').delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'role_deleted', targetType: 'role', targetId: id, targetName: role.name, ip: getClientIp(req) });
  return ok(res, null, 'Role deleted');
}

// ── Role-Permission Management ──
// All endpoints exclude the acting super admin from session revocation

export async function listPermissions(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  if (!role) return err(res, 'Role not found', 404);

  const { data, error: e } = await supabase
    .from('role_permissions')
    .select('id, permission_id, conditions, created_at, permissions(id, resource, action, display_name, is_active)')
    .eq('role_id', roleId).order('created_at');
  if (e) return err(res, e.message, 500);
  return ok(res, { role: role.name, permissions: data });
}

export async function assignPermission(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const actorId = req.user!.id;
  const { permission_id, conditions = null } = req.body;

  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  if (!role) return err(res, 'Role not found', 404);
  const { data: perm } = await supabase.from('permissions').select('resource, action, display_name').eq('id', permission_id).single();
  if (!perm) return err(res, 'Permission not found', 404);

  const { error: e } = await supabase.from('role_permissions').insert({ role_id: roleId, permission_id, conditions, granted_by: actorId });
  if (e) { if (e.code === '23505') return err(res, 'Permission already assigned', 409); return err(res, e.message, 500); }

  await clearPermissionCacheForRole(roleId);
  // Exclude actorId → super admin stays logged in while making changes
  const revoked = await revokeSessionsForRole(roleId, 'role_permissions_changed', actorId);

  logAdmin({ actorId, action: 'permission_granted', targetType: 'role', targetId: roleId, targetName: role.name, changes: { permission: { old: null, new: `${perm.resource}:${perm.action}` } }, ip: getClientIp(req), metadata: { sessions_revoked: revoked } });
  return ok(res, { sessions_revoked: revoked }, `${perm.display_name} assigned to ${role.name}`, 201);
}

export async function assignBulkPermissions(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const actorId = req.user!.id;
  const { permission_ids } = req.body;
  if (!Array.isArray(permission_ids) || permission_ids.length === 0) return err(res, 'permission_ids must be a non-empty array', 400);

  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  if (!role) return err(res, 'Role not found', 404);

  const rows = permission_ids.map((pid: number) => ({ role_id: roleId, permission_id: pid, granted_by: actorId }));
  const { error: e } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'role_id,permission_id', ignoreDuplicates: true });
  if (e) return err(res, e.message, 500);

  await clearPermissionCacheForRole(roleId);
  const revoked = await revokeSessionsForRole(roleId, 'role_permissions_changed', actorId);

  logAdmin({ actorId, action: 'permission_granted', targetType: 'role', targetId: roleId, targetName: role.name, ip: getClientIp(req), metadata: { permission_ids, bulk: true, sessions_revoked: revoked } });
  return ok(res, { assigned: permission_ids.length, sessions_revoked: revoked }, `${permission_ids.length} permissions assigned to ${role.name}`, 201);
}

export async function revokePermission(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const actorId = req.user!.id;
  const permissionId = parseInt(req.params.permissionId);

  const { data: rp } = await supabase.from('role_permissions').select('id').eq('role_id', roleId).eq('permission_id', permissionId).single();
  if (!rp) return err(res, 'Permission not assigned to this role', 404);

  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  const { data: perm } = await supabase.from('permissions').select('resource, action').eq('id', permissionId).single();

  await supabase.from('role_permissions').delete().eq('id', rp.id);
  await clearPermissionCacheForRole(roleId);
  const revoked = await revokeSessionsForRole(roleId, 'role_permissions_changed', actorId);

  logAdmin({ actorId, action: 'permission_revoked', targetType: 'role', targetId: roleId, targetName: role?.name, changes: { permission: { old: perm ? `${perm.resource}:${perm.action}` : null, new: null } }, ip: getClientIp(req), metadata: { sessions_revoked: revoked } });
  return ok(res, { sessions_revoked: revoked }, 'Permission revoked');
}

export async function revokeAllPermissions(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const actorId = req.user!.id;
  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  if (!role) return err(res, 'Role not found', 404);
  if (role.name === 'super_admin') return err(res, 'Cannot revoke super_admin permissions', 403);

  const { count } = await supabase.from('role_permissions').delete().eq('role_id', roleId);
  await clearPermissionCacheForRole(roleId);
  const revoked = await revokeSessionsForRole(roleId, 'role_permissions_changed', actorId);

  logAdmin({ actorId, action: 'permission_revoked', targetType: 'role', targetId: roleId, targetName: role.name, ip: getClientIp(req), metadata: { revoked_all: true, count, sessions_revoked: revoked } });
  return ok(res, { revoked: count, sessions_revoked: revoked }, `All permissions revoked from ${role.name}`);
}
