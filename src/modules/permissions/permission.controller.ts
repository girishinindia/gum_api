import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
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

export async function toggleActive(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('permissions').select('*').eq('id', id).single();
  if (!old) return err(res, 'Permission not found', 404);

  const newVal = !old.is_active;
  await supabase.from('permissions').update({ is_active: newVal }).eq('id', id);

  logAdmin({ actorId: req.user!.id, action: newVal ? 'permission_granted' : 'permission_revoked', targetType: 'permission', targetId: id, targetName: `${old.resource}:${old.action}`, changes: { is_active: { old: old.is_active, new: newVal } }, ip: getClientIp(req) });
  return ok(res, { is_active: newVal }, `Permission ${newVal ? 'activated' : 'deactivated'}`);
}
