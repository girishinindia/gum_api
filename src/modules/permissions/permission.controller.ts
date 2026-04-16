import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { hasPermission } from '../../middleware/rbac';
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

// PATCH /permissions/:id — only is_active can be updated (requires :activate)
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

  const action = updates.is_active ? 'permission_granted' : 'permission_revoked';
  logAdmin({ actorId: req.user!.id, action, targetType: 'permission', targetId: id, targetName: `${old.resource}:${old.action}`, changes: { is_active: { old: old.is_active, new: updates.is_active } }, ip: getClientIp(req) });
  return ok(res, data, `Permission ${updates.is_active ? 'activated' : 'deactivated'}`);
}
