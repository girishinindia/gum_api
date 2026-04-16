import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

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
  const { data, error: e } = await supabase.from('roles').insert(req.body).select().single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'role_created', targetType: 'role', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Role created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('roles').select('*').eq('id', id).single();
  if (!old) return err(res, 'Role not found', 404);
  if (old.is_system) return err(res, 'Cannot modify system roles', 403);

  const { data, error: e } = await supabase.from('roles').update(req.body).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  const changes: any = {};
  for (const k of Object.keys(req.body)) { if ((old as any)[k] !== req.body[k]) changes[k] = { old: (old as any)[k], new: req.body[k] }; }
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

export async function toggleActive(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('roles').select('name, is_active, is_system').eq('id', id).single();
  if (!old) return err(res, 'Role not found', 404);
  if (old.is_system) return err(res, 'Cannot deactivate system roles', 403);

  const newVal = !old.is_active;
  await supabase.from('roles').update({ is_active: newVal }).eq('id', id);

  logAdmin({ actorId: req.user!.id, action: 'role_updated', targetType: 'role', targetId: id, targetName: old.name, changes: { is_active: { old: old.is_active, new: newVal } }, ip: getClientIp(req) });
  return ok(res, { is_active: newVal }, `Role ${newVal ? 'activated' : 'deactivated'}`);
}

// ── Role-Permission Management (Dynamic assignment by super_admin) ──

export async function listPermissions(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  if (!role) return err(res, 'Role not found', 404);

  const { data, error: e } = await supabase
    .from('role_permissions')
    .select('id, permission_id, conditions, created_at, permissions(id, resource, action, display_name, is_active)')
    .eq('role_id', roleId)
    .order('created_at');
  if (e) return err(res, e.message, 500);
  return ok(res, { role: role.name, permissions: data });
}

export async function assignPermission(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const { permission_id, conditions = null } = req.body;

  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  if (!role) return err(res, 'Role not found', 404);

  const { data: perm } = await supabase.from('permissions').select('resource, action, display_name').eq('id', permission_id).single();
  if (!perm) return err(res, 'Permission not found', 404);

  const { error: e } = await supabase.from('role_permissions').insert({ role_id: roleId, permission_id, conditions, granted_by: req.user!.id });
  if (e) { if (e.code === '23505') return err(res, 'Permission already assigned to this role', 409); return err(res, e.message, 500); }

  logAdmin({ actorId: req.user!.id, action: 'permission_granted', targetType: 'role', targetId: roleId, targetName: role.name, changes: { permission: { old: null, new: `${perm.resource}:${perm.action}` } }, ip: getClientIp(req), metadata: { permission_id, conditions } });
  return ok(res, null, `${perm.display_name} assigned to ${role.name}`, 201);
}

export async function assignBulkPermissions(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const { permission_ids } = req.body;

  if (!Array.isArray(permission_ids) || permission_ids.length === 0) {
    return err(res, 'permission_ids must be a non-empty array', 400);
  }

  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  if (!role) return err(res, 'Role not found', 404);

  const rows = permission_ids.map((pid: number) => ({ role_id: roleId, permission_id: pid, granted_by: req.user!.id }));
  const { error: e, count } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'role_id,permission_id', ignoreDuplicates: true });
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: req.user!.id, action: 'permission_granted', targetType: 'role', targetId: roleId, targetName: role.name, ip: getClientIp(req), metadata: { permission_ids, bulk: true } });
  return ok(res, { assigned: permission_ids.length }, `${permission_ids.length} permissions assigned to ${role.name}`, 201);
}

export async function revokePermission(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const permissionId = parseInt(req.params.permissionId);

  const { data: rp } = await supabase.from('role_permissions').select('id').eq('role_id', roleId).eq('permission_id', permissionId).single();
  if (!rp) return err(res, 'Permission not assigned to this role', 404);

  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  const { data: perm } = await supabase.from('permissions').select('resource, action').eq('id', permissionId).single();

  await supabase.from('role_permissions').delete().eq('id', rp.id);

  logAdmin({ actorId: req.user!.id, action: 'permission_revoked', targetType: 'role', targetId: roleId, targetName: role?.name, changes: { permission: { old: perm ? `${perm.resource}:${perm.action}` : null, new: null } }, ip: getClientIp(req) });
  return ok(res, null, 'Permission revoked from role');
}

export async function revokeAllPermissions(req: Request, res: Response) {
  const roleId = parseInt(req.params.id);
  const { data: role } = await supabase.from('roles').select('name, is_system').eq('id', roleId).single();
  if (!role) return err(res, 'Role not found', 404);
  if (role.name === 'super_admin') return err(res, 'Cannot revoke super_admin permissions', 403);

  const { count } = await supabase.from('role_permissions').delete().eq('role_id', roleId);

  logAdmin({ actorId: req.user!.id, action: 'permission_revoked', targetType: 'role', targetId: roleId, targetName: role.name, ip: getClientIp(req), metadata: { revoked_all: true, count } });
  return ok(res, { revoked: count }, `All permissions revoked from ${role.name}`);
}
