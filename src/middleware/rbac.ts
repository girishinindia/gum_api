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

  const { data: level } = await supabase.rpc('get_user_role_level', { p_user_id: userId });
  const roleLevel = level || 0;
  const isSuperAdmin = roleLevel >= SUPER_ADMIN_LEVEL;

  let permissions: any[] = [];
  if (!isSuperAdmin) {
    // Normal users: load assigned permissions only
    const { data: perms } = await supabase.rpc('get_user_permissions', { p_user_id: userId });
    permissions = perms || [];
  }
  // Super admin: permissions array stays empty — isSuperAdmin flag bypasses all checks

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

  // Super admin bypasses ALL permission checks
  if (req.userPerms.isSuperAdmin) {
    req.permConditions = null;
    return next();
  }

  const p = req.userPerms.permissions.find((p: any) => p.resource === resource && p.action === action);
  if (!p) return err(res, `Permission denied: ${resource}:${action}`, 403);
  req.permConditions = p.conditions || null;
  next();
};

export const requireRole = (minLevel: number) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.userPerms) return err(res, 'Permissions not loaded', 500);
  if (req.userPerms.roleLevel < minLevel) return err(res, 'Insufficient role level', 403);
  next();
};

export const clearPermissionCache = async (userId: number) => { await redis.del(`perms:${userId}`); };
