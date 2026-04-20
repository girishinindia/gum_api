import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'social_medias:all';
const clearCache = async (type?: string) => {
  await redis.del(CACHE_KEY);
  if (type) await redis.del(`social_medias:type:${type}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'name' });

  let q = supabase.from('social_medias').select('*', { count: 'exact' });

  // Search
  if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.platform_type) q = q.eq('platform_type', req.query.platform_type);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('social_medias').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Social media not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'social_media', 'activate')) {
    return err(res, 'Permission denied: social_media:activate required to create inactive', 403);
  }

  let iconUrl: string | null = null;
  if (req.file) {
    const slug = (body.code || body.name || 'icon').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `social-medias/${slug}-${Date.now()}.webp`;
    iconUrl = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 200, quality: 85 });
    body.icon = iconUrl;
  }

  const { data, error: e } = await supabase.from('social_medias').insert(body).select().single();
  if (e) {
    if (iconUrl) { try { await deleteImage(extractBunnyPath(iconUrl), iconUrl); } catch {} }
    if (e.code === '23505') return err(res, 'Social media name or code already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(data.platform_type);
  logAdmin({ actorId: req.user!.id, action: 'social_media_created', targetType: 'social_media', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (iconUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'social_media', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'icon' } });
  return ok(res, data, 'Social media created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('social_medias').select('*').eq('id', id).single();
  if (!old) return err(res, 'Social media not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'social_media', 'activate')) {
      return err(res, 'Permission denied: social_media:activate required to change active status', 403);
    }
  }

  if (req.file) {
    const slug = (updates.code || old.code || updates.name || old.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `social-medias/${slug}-${Date.now()}.webp`;
    updates.icon = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 200, quality: 85 });
    if (old.icon) { try { await deleteImage(extractBunnyPath(old.icon), old.icon); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('social_medias').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Social media name or code already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'icon') {
      changes.icon = { old: old.icon || null, new: updates.icon };
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.platform_type);
  if (updates.platform_type && updates.platform_type !== old.platform_type) await clearCache(updates.platform_type);

  logAdmin({ actorId: req.user!.id, action: 'social_media_updated', targetType: 'social_media', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'social_media', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'icon', old_url: old.icon } });

  return ok(res, data, 'Social media updated');
}

// DELETE /social-medias/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('social_medias').select('name, platform_type, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Social media not found', 404);
  if (old.deleted_at) return err(res, 'Social media is already in trash', 400);

  const { data, error: e } = await supabase
    .from('social_medias')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.platform_type);
  logAdmin({ actorId: req.user!.id, action: 'social_media_soft_deleted', targetType: 'social_media', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Social media moved to trash');
}

// PATCH /social-medias/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('social_medias').select('name, platform_type, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Social media not found', 404);
  if (!old.deleted_at) return err(res, 'Social media is not in trash', 400);

  const { data, error: e } = await supabase
    .from('social_medias')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.platform_type);
  logAdmin({ actorId: req.user!.id, action: 'social_media_restored', targetType: 'social_media', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Social media restored');
}

// DELETE /social-medias/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('social_medias').select('name, icon, platform_type').eq('id', id).single();
  if (!old) return err(res, 'Social media not found', 404);

  if (old.icon) { try { await deleteImage(extractBunnyPath(old.icon), old.icon); } catch {} }

  const { error: e } = await supabase.from('social_medias').delete().eq('id', id);
  if (e) {
    if (e.message?.includes('violates foreign key constraint')) return err(res, 'Cannot delete — this record is in use. Remove referencing records first.', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.platform_type);
  logAdmin({ actorId: req.user!.id, action: 'social_media_deleted', targetType: 'social_media', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.icon) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'social_media', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Social media deleted');
}
