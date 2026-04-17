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

const CACHE_KEY = 'sub_categories:all';
const clearCache = async (categoryId?: number) => {
  await redis.del(CACHE_KEY);
  if (categoryId) await redis.del(`sub_categories:category:${categoryId}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_new === 'string') body.is_new = body.is_new === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.category_id === 'string') body.category_id = parseInt(body.category_id) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'name' });

  let q = supabase.from('sub_categories').select('*, categories(name, code)', { count: 'exact' });

  // Search
  if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%,slug.ilike.%${search}%`);

  // Filters
  if (req.query.category_id) q = q.eq('category_id', parseInt(req.query.category_id as string));

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('sub_categories').select('*, categories(name, code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Sub-category not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'sub_category', 'activate')) {
    return err(res, 'Permission denied: sub_category:activate required to create inactive', 403);
  }

  // Verify category exists
  const { data: cat } = await supabase.from('categories').select('id').eq('id', body.category_id).single();
  if (!cat) return err(res, 'Category not found', 404);

  let imageUrl: string | null = null;
  if (req.file) {
    const slug = (body.slug || body.code || 'subcat').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-categories/${slug}-${Date.now()}.webp`;
    imageUrl = await processAndUploadImage(req.file.buffer, path, { width: 400, height: 400, quality: 85 });
    body.image = imageUrl;
  }

  const { data, error: e } = await supabase.from('sub_categories').insert(body).select('*, categories(name, code)').single();
  if (e) {
    if (imageUrl) { try { await deleteImage(extractBunnyPath(imageUrl), imageUrl); } catch {} }
    if (e.code === '23505') return err(res, 'Sub-category name, code, or slug already exists in this category', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_created', targetType: 'sub_category', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (imageUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'sub_category', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'sub_category_image' } });
  return ok(res, data, 'Sub-category created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_categories').select('*').eq('id', id).single();
  if (!old) return err(res, 'Sub-category not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'sub_category', 'activate')) {
      return err(res, 'Permission denied: sub_category:activate required to change active status', 403);
    }
  }

  // If changing category, verify it exists
  if (updates.category_id && updates.category_id !== old.category_id) {
    const { data: cat } = await supabase.from('categories').select('id').eq('id', updates.category_id).single();
    if (!cat) return err(res, 'Category not found', 404);
  }

  if (req.file) {
    const slug = (updates.slug || old.slug || 'subcat').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-categories/${slug}-${Date.now()}.webp`;
    updates.image = await processAndUploadImage(req.file.buffer, path, { width: 400, height: 400, quality: 85 });
    if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('sub_categories').update(updates).eq('id', id).select('*, categories(name, code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Sub-category name, code, or slug already exists in this category', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'image') {
      changes.image = { old: old.image || null, new: updates.image };
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.category_id);
  if (updates.category_id && updates.category_id !== old.category_id) await clearCache(updates.category_id);

  logAdmin({ actorId: req.user!.id, action: 'sub_category_updated', targetType: 'sub_category', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'sub_category', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'sub_category_image', old_url: old.image } });

  return ok(res, data, 'Sub-category updated');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_categories').select('name, image, category_id').eq('id', id).single();
  if (!old) return err(res, 'Sub-category not found', 404);

  if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }

  const { error: e } = await supabase.from('sub_categories').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_deleted', targetType: 'sub_category', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.image) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'sub_category', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Sub-category deleted');
}
