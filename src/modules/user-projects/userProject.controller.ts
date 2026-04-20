import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { createUserProjectSchema, updateUserProjectSchema } from './userProject.schema';

const SELECT_WITH_JOINS = `
  *,
  user:users!user_projects_user_id_fkey(id, full_name, email)
`;

// ══════════════ Admin Endpoints ══════════════

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });
  let q = supabase.from('user_projects').select(SELECT_WITH_JOINS, { count: 'exact' });
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);
  if (req.query.user_id) q = q.eq('user_id', Number(req.query.user_id));
  if (req.query.project_type) q = q.eq('project_type', req.query.project_type);
  if (req.query.project_status) q = q.eq('project_status', req.query.project_status);
  if (search) q = q.or(`project_title.ilike.%${search}%,project_code.ilike.%${search}%,organization_name.ilike.%${search}%,technologies_used.ilike.%${search}%,role_in_project.ilike.%${search}%`);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('user_projects').select(SELECT_WITH_JOINS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Record not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const parsed = createUserProjectSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const payload: any = { ...parsed.data, created_by: req.user!.id };
  const { data, error: e } = await supabase.from('user_projects').insert(payload).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_project_created', targetType: 'user_project', targetId: data.id, targetName: data.project_title, ip: getClientIp(req) });
  return ok(res, data, 'Project created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_projects').select('*').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  const parsed = updateUserProjectSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const updates: any = { ...parsed.data, updated_by: req.user!.id };
  const { data, error: e } = await supabase.from('user_projects').update(updates).eq('id', id).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_project_updated', targetType: 'user_project', targetId: id, targetName: data.project_title, ip: getClientIp(req) });
  return ok(res, data, 'Project updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_projects').select('id, project_title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);
  const { error: e } = await supabase.from('user_projects').update({ deleted_at: new Date().toISOString(), deleted_by: req.user!.id }).eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_project_soft_deleted', targetType: 'user_project', targetId: id, targetName: old.project_title, ip: getClientIp(req) });
  return ok(res, null, 'Moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_projects').select('id, project_title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);
  const { error: e } = await supabase.from('user_projects').update({ deleted_at: null, deleted_by: null }).eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_project_restored', targetType: 'user_project', targetId: id, targetName: old.project_title, ip: getClientIp(req) });
  return ok(res, null, 'Restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_projects').select('id, project_title, thumbnail_url').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  const { error: e } = await supabase.from('user_projects').delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_project_deleted', targetType: 'user_project', targetId: id, targetName: old.project_title, ip: getClientIp(req) });
  return ok(res, null, 'Permanently deleted');
}

// ══════════════ Self-service "My" Endpoints ══════════════

export async function listMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });
  let q = supabase.from('user_projects').select(SELECT_WITH_JOINS, { count: 'exact' }).eq('user_id', userId);
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);
  if (req.query.project_type) q = q.eq('project_type', req.query.project_type);
  if (req.query.project_status) q = q.eq('project_status', req.query.project_status);
  if (search) q = q.or(`project_title.ilike.%${search}%,project_code.ilike.%${search}%,organization_name.ilike.%${search}%,technologies_used.ilike.%${search}%`);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getMyById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('user_projects').select(SELECT_WITH_JOINS).eq('id', req.params.id).eq('user_id', req.user!.id).single();
  if (e || !data) return err(res, 'Record not found', 404);
  return ok(res, data);
}

export async function createMy(req: Request, res: Response) {
  const userId = req.user!.id;
  req.body.user_id = userId;
  const parsed = createUserProjectSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const payload: any = { ...parsed.data, user_id: userId, created_by: userId };
  const { data, error: e } = await supabase.from('user_projects').insert(payload).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_project_created', targetType: 'user_project', targetId: data.id, targetName: data.project_title, ip: getClientIp(req) });
  return ok(res, data, 'Project created', 201);
}

export async function updateMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_projects').select('*').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  const parsed = updateUserProjectSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const updates: any = { ...parsed.data, updated_by: userId };
  const { data, error: e } = await supabase.from('user_projects').update(updates).eq('id', id).eq('user_id', userId).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_project_updated', targetType: 'user_project', targetId: id, targetName: data.project_title, ip: getClientIp(req) });
  return ok(res, data, 'Project updated');
}

export async function softDeleteMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_projects').select('id, project_title, deleted_at').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);
  const { error: e } = await supabase.from('user_projects').update({ deleted_at: new Date().toISOString(), deleted_by: userId }).eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_project_soft_deleted', targetType: 'user_project', targetId: id, targetName: old.project_title, ip: getClientIp(req) });
  return ok(res, null, 'Moved to trash');
}

export async function restoreMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_projects').select('id, project_title, deleted_at').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);
  const { error: e } = await supabase.from('user_projects').update({ deleted_at: null, deleted_by: null }).eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_project_restored', targetType: 'user_project', targetId: id, targetName: old.project_title, ip: getClientIp(req) });
  return ok(res, null, 'Restored');
}

export async function removeMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_projects').select('id, project_title').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  const { error: e } = await supabase.from('user_projects').delete().eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_project_deleted', targetType: 'user_project', targetId: id, targetName: old.project_title, ip: getClientIp(req) });
  return ok(res, null, 'Permanently deleted');
}
