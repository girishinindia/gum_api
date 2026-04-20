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

const CACHE_KEY = 'categories:all';
const clearCache = () => redis.del(CACHE_KEY);

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_new === 'string') body.is_new = body.is_new === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('categories').select('*', { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%,slug.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filter by active status
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('categories').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Category not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'category', 'activate')) {
    return err(res, 'Permission denied: category:activate required to create inactive', 403);
  }

  // Set audit field
  body.created_by = req.user!.id;

  let imageUrl: string | null = null;
  if (req.file) {
    const slug = (body.slug || body.code || 'cat').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `categories/${slug}-${Date.now()}.webp`;
    imageUrl = await processAndUploadImage(req.file.buffer, path, { width: 400, height: 400, quality: 85 });
    body.image = imageUrl;
  }

  const { data, error: e } = await supabase.from('categories').insert(body).select().single();
  if (e) {
    if (imageUrl) { try { await deleteImage(extractBunnyPath(imageUrl), imageUrl); } catch {} }
    if (e.code === '23505') return err(res, 'Category code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'category_created', targetType: 'category', targetId: data.id, targetName: data.code, ip: getClientIp(req) });
  if (imageUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'category', resourceId: data.id, resourceName: data.code, ip: getClientIp(req), metadata: { type: 'category_image' } });
  return ok(res, data, 'Category created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('categories').select('*').eq('id', id).single();
  if (!old) return err(res, 'Category not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'category', 'activate')) {
      return err(res, 'Permission denied: category:activate required to change active status', 403);
    }
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  if (req.file) {
    const slug = (updates.slug || old.slug || 'cat').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `categories/${slug}-${Date.now()}.webp`;
    updates.image = await processAndUploadImage(req.file.buffer, path, { width: 400, height: 400, quality: 85 });
    if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('categories').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Category code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'image') {
      changes.image = { old: old.image || null, new: updates.image };
    } else if (k === 'updated_by') {
      // skip audit field from changes
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'category_updated', targetType: 'category', targetId: id, targetName: data.code, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'category', resourceId: id, resourceName: data.code, ip: getClientIp(req), metadata: { type: 'category_image', old_url: old.image } });

  return ok(res, data, 'Category updated');
}

// DELETE /categories/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('categories').select('code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Category not found', 404);
  if (old.deleted_at) return err(res, 'Category is already in trash', 400);

  const { data, error: e } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'category_soft_deleted', targetType: 'category', targetId: id, targetName: old.code, ip: getClientIp(req) });
  return ok(res, data, 'Category moved to trash');
}

// PATCH /categories/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('categories').select('code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Category not found', 404);
  if (!old.deleted_at) return err(res, 'Category is not in trash', 400);

  const { data, error: e } = await supabase
    .from('categories')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'category_restored', targetType: 'category', targetId: id, targetName: old.code, ip: getClientIp(req) });
  return ok(res, data, 'Category restored');
}

// DELETE /categories/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('categories').select('code, image').eq('id', id).single();
  if (!old) return err(res, 'Category not found', 404);

  if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }

  const { error: e } = await supabase.from('categories').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: sub-categories or translations still reference this category', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'category_deleted', targetType: 'category', targetId: id, targetName: old.code, ip: getClientIp(req) });
  if (old.image) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'category', resourceId: id, resourceName: old.code, ip: getClientIp(req) });

  return ok(res, null, 'Category deleted');
}
