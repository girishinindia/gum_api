import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { config } from '../../config';
import { clearPermissionCache, hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin, logAuth, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '');
}

const ALLOWED_FIELDS = ['first_name', 'last_name', 'display_name', 'locale', 'preferences'];
const VALID_STATUSES = ['active', 'inactive', 'suspended'];

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

// PATCH /users/me — self-update (no status changes allowed via self)
export async function updateMe(req: Request, res: Response) {
  req.params.id = String(req.user!.id);
  // Strip status field from self-update
  delete req.body.status;
  return update(req, res);
}

// PATCH /users/:id — update profile + optional avatar + optional status
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('users').select('*').eq('id', id).single();
  if (!old) return err(res, 'User not found', 404);

  const updates: any = {};

  // Regular fields (requires user:update)
  for (const k of ALLOWED_FIELDS) {
    const val = req.body[k];
    if (val !== undefined && val !== '') {
      updates[k] = k === 'preferences' && typeof val === 'string' ? JSON.parse(val) : val;
    }
  }

  // Status change (requires user:activate)
  if (req.body.status !== undefined) {
    if (!VALID_STATUSES.includes(req.body.status)) return err(res, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    if (!hasPermission(req, 'user', 'activate')) return err(res, 'Permission denied: user:activate required to change status', 403);
    updates.status = req.body.status;
  }

  // Avatar upload (requires user:update which route already enforced)
  if (req.file) {
    if (old.avatar_url) {
      try { await deleteImage(extractBunnyPath(old.avatar_url)); } catch {}
    }
    const path = `avatars/user-${id}.webp`;
    updates.avatar_url = await processAndUploadImage(req.file.buffer, path, { width: 300, height: 300, quality: 80 });
  }

  // Explicit avatar removal via avatar_url=null
  if (!req.file && (req.body.avatar_url === 'null' || req.body.avatar_url === null)) {
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

  // Determine primary action for admin log
  let action = 'user_updated';
  if (updates.status === 'suspended' && old.status !== 'suspended') action = 'user_suspended';
  else if (updates.status === 'active' && old.status === 'suspended') action = 'user_reactivated';

  logAdmin({ actorId: req.user!.id, action, targetType: 'user', targetId: id, targetName: data.email, changes, ip: getClientIp(req) });

  // Auth log for status changes
  if (updates.status === 'suspended' && old.status !== 'suspended') {
    logAuth({ userId: id, action: 'account_suspended', ip: getClientIp(req) });
  } else if (updates.status === 'active' && old.status === 'suspended') {
    logAuth({ userId: id, action: 'account_reactivated', ip: getClientIp(req) });
  }

  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'user', resourceId: id, resourceName: data.email, ip: getClientIp(req), metadata: { type: 'avatar', old_url: old.avatar_url } });
  if (updates.avatar_url === null && old.avatar_url) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'user', resourceId: id, resourceName: data.email, ip: getClientIp(req), metadata: { type: 'avatar' } });

  return ok(res, data, 'User updated');
}

// Role Management
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

export async function getSessions(req: Request, res: Response) {
  const { data } = await supabase.from('v_user_sessions').select('*').eq('user_id', req.params.id);
  return ok(res, data || []);
}

export async function revokeAllSessions(req: Request, res: Response) {
  const { data: count } = await supabase.rpc('revoke_all_sessions', { p_user_id: parseInt(req.params.id), p_reason: 'admin' });
  logAdmin({ actorId: req.user!.id, action: 'all_sessions_revoked', targetType: 'user', targetId: parseInt(req.params.id), ip: getClientIp(req), metadata: { count } });
  return ok(res, { revoked: count }, `${count} sessions revoked`);
}


// POST /users — admin creates a user directly (no OTP). Requires user:create.
// Accepts multipart/form-data with optional avatar file.
export async function create(req: Request, res: Response) {
  const bcrypt = require('bcrypt');
  const { first_name, last_name, email, mobile, password, locale, role_id, status } = req.body;

  if (!first_name || !last_name || !email || !mobile || !password) {
    return err(res, 'Missing required fields: first_name, last_name, email, mobile, password', 400);
  }
  if (password.length < 8) return err(res, 'Password must be at least 8 characters', 400);

  const cleanEmail = email.trim().toLowerCase();
  let cleanMobile = mobile.trim().replace(/\s+/g, '');
  if (/^\d{10}$/.test(cleanMobile)) cleanMobile = '+91' + cleanMobile;

  // Check duplicates
  const { data: existing } = await supabase.from('users').select('id, email, mobile').or(`email.eq.${cleanEmail},mobile.eq.${cleanMobile}`).limit(1);
  if (existing && existing.length > 0) {
    if (existing[0].email === cleanEmail) return err(res, 'Email already registered', 409);
    if (existing[0].mobile === cleanMobile) return err(res, 'Mobile already registered', 409);
  }

  const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);

  // Step 1: Create user (avatar gets added in step 2 since we need the user ID)
  const { data: user, error: e } = await supabase.from('users').insert({
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: cleanEmail,
    mobile: cleanMobile,
    password_hash: passwordHash,
    locale: locale || 'en',
    status: status || 'active',
  }).select().single();

  if (e) return err(res, e.message, 500);

  // Step 2: Process avatar if provided (non-blocking — user is already created)
  let finalUser = user;
  if (req.file) {
    try {
      const path = `avatars/user-${user.id}.webp`;
      const avatarUrl = await processAndUploadImage(req.file.buffer, path, {
        width: 300, height: 300, quality: 80,
      });
      const { data: withAvatar } = await supabase
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)
        .select()
        .single();
      if (withAvatar) finalUser = withAvatar;

      logData({
        actorId: req.user!.id,
        action: 'media_uploaded',
        resourceType: 'user',
        resourceId: user.id,
        resourceName: user.email,
        ip: getClientIp(req),
        metadata: { type: 'avatar', on_create: true },
      });
    } catch (uploadErr) {
      // User created successfully, but avatar upload failed — log warning, don't fail request
      console.error('Avatar upload failed for user', user.id, uploadErr);
    }
  }

  // Step 3: Assign role
  const assignedRoleId = role_id ? parseInt(role_id) : null;
  if (assignedRoleId) {
    await supabase.from('user_roles').insert({
      user_id: user.id, role_id: assignedRoleId, scope: 'global', is_active: true, granted_by: req.user!.id,
    });
    await clearPermissionCache(user.id);
  } else {
    // Default: assign student role
    const { data: studentRole } = await supabase.from('roles').select('id').eq('name', 'student').single();
    if (studentRole) {
      await supabase.from('user_roles').insert({
        user_id: user.id, role_id: studentRole.id, scope: 'global', is_active: true, granted_by: req.user!.id,
      });
    }
  }

  logAdmin({
    actorId: req.user!.id,
    action: 'user_created',
    targetType: 'user',
    targetId: user.id,
    targetName: user.email,
    ip: getClientIp(req),
    metadata: { role_id: assignedRoleId, has_avatar: !!req.file, by_admin: true },
  });
  logAuth({
    userId: user.id,
    action: 'register_completed',
    identifier: cleanEmail,
    ip: getClientIp(req),
    metadata: { created_by_admin: req.user!.id },
  });

  return ok(res, finalUser, 'User created', 201);
}
