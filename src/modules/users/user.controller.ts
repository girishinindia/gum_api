import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { config } from '../../config';
import { clearPermissionCache } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin, logAuth, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '');
}

const ALLOWED_FIELDS = ['first_name', 'last_name', 'display_name', 'locale', 'preferences'];

export async function list(req: Request, res: Response) {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;
  let q = supabase.from('users').select('id, first_name, last_name, full_name, email, mobile, status, locale, avatar_url, last_login_at, login_count, created_at', { count: 'exact' });
  if (req.query.status) q = q.eq('status', req.query.status);
  if (req.query.search) q = q.or(`full_name.ilike.%${req.query.search}%,email.ilike.%${req.query.search}%,mobile.ilike.%${req.query.search}%`);
  const { data, count, error: e } = await q.range(offset, offset + limit - 1).order('created_at', { ascending: false });
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data } = await supabase.from('v_user_profile').select('*').eq('id', req.params.id).single();
  if (!data) return err(res, 'User not found', 404);
  return ok(res, data);
}

export async function getMe(req: Request, res: Response) {
  const { data } = await supabase.from('v_user_profile').select('*').eq('id', req.user!.id).single();
  if (!data) return err(res, 'User not found', 404);
  return ok(res, data);
}

// PATCH /users/me — update own profile + optional avatar
export async function updateMe(req: Request, res: Response) {
  req.params.id = String(req.user!.id);
  return update(req, res);
}

// PATCH /users/:id — update profile + optional avatar (old avatar auto-deleted)
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('users').select('*').eq('id', id).single();
  if (!old) return err(res, 'User not found', 404);

  // Extract allowed text fields
  const updates: any = {};
  for (const k of ALLOWED_FIELDS) {
    const val = req.body[k];
    if (val !== undefined && val !== '') {
      updates[k] = k === 'preferences' && typeof val === 'string' ? JSON.parse(val) : val;
    }
  }

  // Handle avatar if uploaded
  if (req.file) {
    // Delete old avatar from Bunny CDN
    if (old.avatar_url) {
      try { await deleteImage(extractBunnyPath(old.avatar_url)); } catch {}
    }
    const path = `avatars/user-${id}.webp`;
    updates.avatar_url = await processAndUploadImage(req.file.buffer, path, { width: 300, height: 300, quality: 80 });
  }

  // Handle explicit avatar removal: avatar_url = "null" or avatar_url = ""
  if (!req.file && (req.body.avatar_url === 'null' || req.body.avatar_url === '')) {
    if (old.avatar_url) {
      try { await deleteImage(extractBunnyPath(old.avatar_url)); } catch {}
    }
    updates.avatar_url = null;
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('users').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Build changes log
  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'avatar_url') {
      changes.avatar_url = { old: old.avatar_url || null, new: updates.avatar_url };
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  logAdmin({ actorId: req.user!.id, action: 'user_updated', targetType: 'user', targetId: id, targetName: data.email, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'user', resourceId: id, resourceName: data.email, ip: getClientIp(req), metadata: { type: 'avatar', old_url: old.avatar_url } });
  if (updates.avatar_url === null && old.avatar_url) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'user', resourceId: id, resourceName: data.email, ip: getClientIp(req), metadata: { type: 'avatar' } });

  return ok(res, data, 'User updated');
}

// PATCH /users/:id/status
export async function updateStatus(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!['active', 'inactive', 'suspended'].includes(status)) return err(res, 'Invalid status', 400);

  const { data: old } = await supabase.from('users').select('email, status').eq('id', id).single();
  if (!old) return err(res, 'User not found', 404);

  await supabase.from('users').update({ status }).eq('id', id);

  const action = status === 'suspended' ? 'user_suspended' : status === 'active' ? 'user_reactivated' : 'user_updated';
  logAdmin({ actorId: req.user!.id, action, targetType: 'user', targetId: id, targetName: old.email, changes: { status: { old: old.status, new: status } }, ip: getClientIp(req) });
  if (status === 'suspended') logAuth({ userId: id, action: 'account_suspended', ip: getClientIp(req) });
  if (status === 'active' && old.status === 'suspended') logAuth({ userId: id, action: 'account_reactivated', ip: getClientIp(req) });

  return ok(res, { status }, `User ${action.replace('user_', '')}`);
}

// POST /users/:id/roles
export async function assignRole(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { role_id, scope = 'global', scope_id = null } = req.body;

  const { data: user } = await supabase.from('users').select('email').eq('id', id).single();
  if (!user) return err(res, 'User not found', 404);
  const { data: role } = await supabase.from('roles').select('name, display_name').eq('id', role_id).single();
  if (!role) return err(res, 'Role not found', 404);

  const { error: e } = await supabase.from('user_roles').insert({ user_id: id, role_id, scope, scope_id, is_active: true, granted_by: req.user!.id });
  if (e) { if (e.code === '23505') return err(res, 'Role already assigned', 409); return err(res, e.message, 500); }

  await clearPermissionCache(id);
  logAdmin({ actorId: req.user!.id, action: 'role_assigned', targetType: 'user', targetId: id, targetName: user.email, changes: { role: { old: null, new: role.name } }, ip: getClientIp(req) });
  return ok(res, null, `Role '${role.display_name}' assigned`, 201);
}

// DELETE /users/:id/roles/:roleId
export async function revokeRole(req: Request, res: Response) {
  const userId = parseInt(req.params.id);
  const roleId = parseInt(req.params.roleId);

  const { data: ur } = await supabase.from('user_roles').select('id').eq('user_id', userId).eq('role_id', roleId).eq('is_active', true).single();
  if (!ur) return err(res, 'Active role not found', 404);

  await supabase.from('user_roles').update({ is_active: false }).eq('id', ur.id);
  await clearPermissionCache(userId);

  const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single();
  const { data: user } = await supabase.from('users').select('email').eq('id', userId).single();
  logAdmin({ actorId: req.user!.id, action: 'role_revoked', targetType: 'user', targetId: userId, targetName: user?.email, changes: { role: { old: role?.name, new: null } }, ip: getClientIp(req) });
  return ok(res, null, 'Role revoked');
}

// GET /users/:id/sessions
export async function getSessions(req: Request, res: Response) {
  const { data } = await supabase.from('v_user_sessions').select('*').eq('user_id', req.params.id);
  return ok(res, data || []);
}

// POST /users/:id/revoke-sessions
export async function revokeAllSessions(req: Request, res: Response) {
  const { data: count } = await supabase.rpc('revoke_all_sessions', { p_user_id: parseInt(req.params.id), p_reason: 'admin' });
  logAdmin({ actorId: req.user!.id, action: 'all_sessions_revoked', targetType: 'user', targetId: parseInt(req.params.id), ip: getClientIp(req), metadata: { count } });
  return ok(res, { revoked: count }, `${count} sessions revoked`);
}
