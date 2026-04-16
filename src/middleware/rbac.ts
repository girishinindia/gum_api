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
  try { req.userPerms = await loadPermissions(req.user.id); next(); }
  catch (e) { return err(res, 'Permission load failed', 500); }
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
