import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { redis } from '../config/redis';
import { config } from '../config';
import { err } from '../utils/response';

declare global { namespace Express { interface Request { userPerms?: { permissions: any[]; roleLevel: number; isSuperAdmin: boolean }; permConditions?: any; } } }

const SUPER_ADMIN_LEVEL = 100;

async function loadPermissions(userId: number) {
  const ck = `perms:${userId}`;
  const cached = await redis.get(ck);
  if (cached) return JSON.parse(cached);

  // Step 1: Get user's active roles with levels
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('role_id, roles!inner(level, is_active)')
    .eq('user_id', userId)
    .eq('is_active', true);

  const activeRoles = (userRoles || []).filter((ur: any) => ur.roles?.is_active);
  const roleIds = activeRoles.map((ur: any) => ur.role_id);
  const roleLevel = activeRoles.length > 0
    ? Math.max(...activeRoles.map((ur: any) => ur.roles?.level || 0))
    : 0;
  const isSuperAdmin = roleLevel >= SUPER_ADMIN_LEVEL;

  // Step 2: Get permissions via roles only (no user_permissions — roles are the single source of truth)
  let permissions: any[] = [];
  if (!isSuperAdmin && roleIds.length > 0) {
    const { data: rolePerms } = await supabase
      .from('role_permissions')
      .select('conditions, permissions!inner(id, resource, action, display_name, is_active)')
      .in('role_id', roleIds)
      .eq('permissions.is_active', true);

    // Dedupe (same permission may come from multiple roles)
    const seen = new Set<number>();
    for (const rp of (rolePerms || [])) {
      const p: any = rp.permissions;
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      permissions.push({
        id: p.id,
        resource: p.resource,
        action: p.action,
        display_name: p.display_name,
        conditions: rp.conditions || null,
      });
    }
  }

  const result = { permissions, roleLevel, isSuperAdmin };
  await redis.set(ck, JSON.stringify(result), 'EX', config.redis.cacheTtl);
  return result;
}

export const attachPermissions = () => async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.id) return err(res, 'Auth required', 401);
  try {
    // Step 1: Verify user still exists AND is active (handles suspend/deactivate without waiting for token expiry)
    const { data: user } = await supabase
      .from('users')
      .select('id, status, locked_until')
      .eq('id', req.user.id)
      .single();

    if (!user) {
      return res.status(401).json({ success: false, error: 'Account no longer exists', code: 'ACCOUNT_NOT_FOUND' });
    }
    if (user.status === 'suspended') {
      await supabase
        .from('login_sessions')
        .update({ is_active: false, revoked_at: new Date().toISOString(), revoked_reason: 'account_suspended' })
        .eq('user_id', user.id)
        .eq('is_active', true);
      return res.status(403).json({ success: false, error: 'Account suspended. Contact support.', code: 'ACCOUNT_SUSPENDED' });
    }
    if (user.status === 'inactive') {
      await supabase
        .from('login_sessions')
        .update({ is_active: false, revoked_at: new Date().toISOString(), revoked_reason: 'account_inactive' })
        .eq('user_id', user.id)
        .eq('is_active', true);
      return res.status(403).json({ success: false, error: 'Account deactivated. Contact support.', code: 'ACCOUNT_INACTIVE' });
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(429).json({ success: false, error: 'Account temporarily locked', code: 'ACCOUNT_LOCKED' });
    }

    // Step 2: Check user has at least one active session. If admin force-revoked all sessions
    // (role/permission change, suspension), this detects stale access tokens INSTANTLY
    // instead of waiting for 15-min JWT expiry. Uses a Redis cache hint (5s TTL) to avoid DB hit on every request.
    const sessionCheckKey = `has_session:${user.id}`;
    const cachedFlag = await redis.get(sessionCheckKey);

    if (cachedFlag === '0') {
      // Fast path: we already know all sessions are revoked
      return res.status(401).json({ success: false, error: 'Session no longer valid. Please sign in again.', code: 'SESSION_REVOKED' });
    }

    if (cachedFlag === null) {
      // Need to check DB
      const { count } = await supabase
        .from('login_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true);

      if ((count || 0) === 0) {
        // No active sessions — cache the "0" for 30s so we don't keep re-hitting DB
        await redis.set(sessionCheckKey, '0', 'EX', 30);
        return res.status(401).json({ success: false, error: 'Session no longer valid. Please sign in again.', code: 'SESSION_REVOKED' });
      }
      // Has active sessions — cache "1" for 5s (short TTL so revocations propagate quickly)
      await redis.set(sessionCheckKey, '1', 'EX', 5);
    }

    // Step 3: Load permissions (cached)
    req.userPerms = await loadPermissions(req.user.id);
    next();
  } catch (e) {
    return err(res, 'Permission load failed', 500);
  }
};

export const requirePermission = (resource: string, action: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.userPerms) return err(res, 'Permissions not loaded', 500);
  if (req.userPerms.isSuperAdmin) { req.permConditions = null; return next(); }
  const p = req.userPerms.permissions.find((p: any) => p.resource === resource && p.action === action);
  if (!p) return err(res, `Permission denied: ${resource}:${action}`, 403);
  req.permConditions = p.conditions || null;
  next();
};

// Controller-level permission check (for conditional checks inside PATCH handlers)
export function hasPermission(req: Request, resource: string, action: string): boolean {
  if (!req.userPerms) return false;
  if (req.userPerms.isSuperAdmin) return true;
  return req.userPerms.permissions.some((p: any) => p.resource === resource && p.action === action);
}

export const requireRole = (minLevel: number) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.userPerms) return err(res, 'Permissions not loaded', 500);
  if (req.userPerms.roleLevel < minLevel) return err(res, 'Insufficient role level', 403);
  next();
};

export const requireSuperAdmin = () => (req: Request, res: Response, next: NextFunction) => {
  if (!req.userPerms) return err(res, 'Permissions not loaded', 500);
  if (!req.userPerms.isSuperAdmin) return err(res, 'Super admin access required', 403);
  next();
};

export const clearPermissionCache = async (userId: number) => { await redis.del(`perms:${userId}`); };

// Clear cache for every user currently holding this role — critical when role's permissions change
export const clearPermissionCacheForRole = async (roleId: number) => {
  const { data: users } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role_id', roleId)
    .eq('is_active', true);
  if (users && users.length > 0) {
    await Promise.all(users.map((u: any) => redis.del(`perms:${u.user_id}`)));
  }
};

// Force logout: revoke all active sessions for every user holding this role.
// excludeUserId: the acting admin — they should NOT be logged out by their own action.
export const revokeSessionsForRole = async (roleId: number, reason: string, excludeUserId?: number) => {
  const { data: users } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role_id', roleId)
    .eq('is_active', true);

  if (!users || users.length === 0) return 0;

  // Exclude the acting super admin so they don't get logged out by their own changes
  const userIds = users
    .map((u: any) => u.user_id)
    .filter((uid: number) => uid !== excludeUserId);

  if (userIds.length === 0) return 0;

  // Revoke all active sessions for these users
  const { count } = await supabase
    .from('login_sessions')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .in('user_id', userIds)
    .eq('is_active', true);

  // Invalidate session-check cache so next request detects revocation immediately
  // Also clear permission cache so they get fresh perms on re-login
  await Promise.all(userIds.flatMap((uid: number) => [
    redis.del(`has_session:${uid}`),
    redis.del(`perms:${uid}`),
  ]));

  return count || 0;
};

// Clear permission cache globally — when a permission is activated/deactivated,
// every user in the system could be affected (since the permission registry changed).
export const clearAllPermissionCache = async () => {
  // Find all cached permission keys and delete them in one go
  const keys = await redis.keys('perms:*');
  if (keys.length > 0) await redis.del(...keys);
  return keys.length;
};
