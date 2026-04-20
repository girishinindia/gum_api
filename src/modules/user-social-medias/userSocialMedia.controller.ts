import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { createUserSocialMediaSchema, updateUserSocialMediaSchema } from './userSocialMedia.schema';

const SELECT_WITH_JOINS = `
  *,
  social_media:social_medias(id, name, icon, base_url),
  user:users!user_social_medias_user_id_fkey(id, full_name, email)
`;

// ══════════════ Admin Endpoints ══════════════

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });
  let q = supabase.from('user_social_medias').select(SELECT_WITH_JOINS, { count: 'exact' });
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);
  if (req.query.user_id) q = q.eq('user_id', Number(req.query.user_id));
  if (req.query.social_media_id) q = q.eq('social_media_id', Number(req.query.social_media_id));
  if (search) q = q.or(`profile_url.ilike.%${search}%,username.ilike.%${search}%`);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('user_social_medias').select(SELECT_WITH_JOINS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Record not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const parsed = createUserSocialMediaSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const payload: any = { ...parsed.data, created_by: req.user!.id };
  const { data, error: e } = await supabase.from('user_social_medias').insert(payload).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_social_media_created', targetType: 'user_social_media', targetId: data.id, targetName: data.username || data.profile_url, ip: getClientIp(req) });
  return ok(res, data, 'Social media link added', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_social_medias').select('*').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  const parsed = updateUserSocialMediaSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const updates: any = { ...parsed.data, updated_by: req.user!.id };
  const { data, error: e } = await supabase.from('user_social_medias').update(updates).eq('id', id).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_social_media_updated', targetType: 'user_social_media', targetId: id, targetName: data.username || data.profile_url, ip: getClientIp(req) });
  return ok(res, data, 'Social media link updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_social_medias').select('id, username, profile_url, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);
  const { error: e } = await supabase.from('user_social_medias').update({ deleted_at: new Date().toISOString(), deleted_by: req.user!.id }).eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_social_media_soft_deleted', targetType: 'user_social_media', targetId: id, targetName: old.username || old.profile_url, ip: getClientIp(req) });
  return ok(res, null, 'Moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_social_medias').select('id, username, profile_url, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);
  const { error: e } = await supabase.from('user_social_medias').update({ deleted_at: null, deleted_by: null }).eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_social_media_restored', targetType: 'user_social_media', targetId: id, targetName: old.username || old.profile_url, ip: getClientIp(req) });
  return ok(res, null, 'Restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_social_medias').select('id, username, profile_url').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  const { error: e } = await supabase.from('user_social_medias').delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_social_media_deleted', targetType: 'user_social_media', targetId: id, targetName: old.username || old.profile_url, ip: getClientIp(req) });
  return ok(res, null, 'Permanently deleted');
}

// ══════════════ Self-service "My" Endpoints ══════════════

export async function listMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });
  let q = supabase.from('user_social_medias').select(SELECT_WITH_JOINS, { count: 'exact' }).eq('user_id', userId);
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);
  if (search) q = q.or(`profile_url.ilike.%${search}%,username.ilike.%${search}%`);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getMyById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('user_social_medias').select(SELECT_WITH_JOINS).eq('id', req.params.id).eq('user_id', req.user!.id).single();
  if (e || !data) return err(res, 'Record not found', 404);
  return ok(res, data);
}

export async function createMy(req: Request, res: Response) {
  const userId = req.user!.id;
  req.body.user_id = userId;
  const parsed = createUserSocialMediaSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const payload: any = { ...parsed.data, user_id: userId, created_by: userId };
  const { data, error: e } = await supabase.from('user_social_medias').insert(payload).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_social_media_created', targetType: 'user_social_media', targetId: data.id, targetName: data.username || data.profile_url, ip: getClientIp(req) });
  return ok(res, data, 'Social media link added', 201);
}

export async function updateMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_social_medias').select('*').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  const parsed = updateUserSocialMediaSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const updates: any = { ...parsed.data, updated_by: userId };
  const { data, error: e } = await supabase.from('user_social_medias').update(updates).eq('id', id).eq('user_id', userId).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_social_media_updated', targetType: 'user_social_media', targetId: id, targetName: data.username || data.profile_url, ip: getClientIp(req) });
  return ok(res, data, 'Social media link updated');
}

export async function softDeleteMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_social_medias').select('id, username, profile_url, deleted_at').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);
  const { error: e } = await supabase.from('user_social_medias').update({ deleted_at: new Date().toISOString(), deleted_by: userId }).eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_social_media_soft_deleted', targetType: 'user_social_media', targetId: id, targetName: old.username || old.profile_url, ip: getClientIp(req) });
  return ok(res, null, 'Moved to trash');
}

export async function restoreMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_social_medias').select('id, username, profile_url, deleted_at').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);
  const { error: e } = await supabase.from('user_social_medias').update({ deleted_at: null, deleted_by: null }).eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_social_media_restored', targetType: 'user_social_media', targetId: id, targetName: old.username || old.profile_url, ip: getClientIp(req) });
  return ok(res, null, 'Restored');
}

export async function removeMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_social_medias').select('id, username, profile_url').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  const { error: e } = await supabase.from('user_social_medias').delete().eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_social_media_deleted', targetType: 'user_social_media', targetId: id, targetName: old.username || old.profile_url, ip: getClientIp(req) });
  return ok(res, null, 'Permanently deleted');
}
