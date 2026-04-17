import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission, clearAllPermissionCache } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

export async function list(_req: Request, res: Response) {
  const { data, error: e } = await supabase.from('permissions').select('*').order('resource').order('action');
  if (e) return err(res, e.message, 500);
  return ok(res, data);
}

export async function listGrouped(_req: Request, res: Response) {
  const { data, error: e } = await supabase.from('permissions').select('*').eq('is_active', true).order('resource').order('action');
  if (e) return err(res, e.message, 500);
  const grouped = (data || []).reduce((acc: any, p: any) => { (acc[p.resource] = acc[p.resource] || []).push(p); return acc; }, {});
  return ok(res, grouped);
}

// PATCH /permissions/:id — only is_active can be updated
// When toggled: clears permission cache for ALL users + force-revokes sessions for users
// who had this permission via any role (they need fresh JWTs that reflect the change)
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('permissions').select('*').eq('id', id).single();
  if (!old) return err(res, 'Permission not found', 404);

  const updates: any = {};

  if (req.body.is_active !== undefined && req.body.is_active !== old.is_active) {
    if (!hasPermission(req, 'permission', 'activate')) {
      return err(res, 'Permission denied: permission:activate required', 403);
    }
    updates.is_active = req.body.is_active;
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('permissions').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Find all users who have this permission via any active role (so we can log them out)
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('role_id')
    .eq('permission_id', id);
  const affectedRoleIds = (rolePerms || []).map((rp: any) => rp.role_id);

  // Exclude the acting super admin from logout so they can toggle multiple permissions without disruption
  const actorId = req.user!.id;
  let sessionsRevoked = 0;
  if (affectedRoleIds.length > 0) {
    const { data: affectedUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role_id', affectedRoleIds)
      .eq('is_active', true);

    // Filter out the acting super admin
    const userIds = [...new Set((affectedUsers || []).map((u: any) => u.user_id))]
      .filter((uid: number) => uid !== actorId);

    if (userIds.length > 0) {
      const { count } = await supabase
        .from('login_sessions')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_reason: 'permission_status_changed',
        })
        .in('user_id', userIds)
        .eq('is_active', true);
      sessionsRevoked = count || 0;

      // Invalidate session-check + perm cache so revocation is detected instantly
      await Promise.all(userIds.flatMap((uid: number) => [
        redis.del(`has_session:${uid}`),
        redis.del(`perms:${uid}`),
      ]));
    }
  }

  // Clear ALL permission caches (safe since permission is global — super admin is unaffected via bypass)
  const cleared = await clearAllPermissionCache();

  const action = updates.is_active ? 'permission_granted' : 'permission_revoked';
  logAdmin({
    actorId: req.user!.id,
    action,
    targetType: 'permission',
    targetId: id,
    targetName: `${old.resource}:${old.action}`,
    changes: { is_active: { old: old.is_active, new: updates.is_active } },
    ip: getClientIp(req),
    metadata: { affected_roles: affectedRoleIds.length, sessions_revoked: sessionsRevoked, cache_cleared: cleared },
  });
  return ok(res, { ...data, sessions_revoked: sessionsRevoked }, `Permission ${updates.is_active ? 'activated' : 'deactivated'}`);
}
