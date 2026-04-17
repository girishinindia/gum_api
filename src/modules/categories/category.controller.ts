import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
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
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') delete body[k]; }
  return body;
}

export async function list(req: Request, res: Response) {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return ok(res, JSON.parse(cached));

  const { data, error: e } = await supabase.from('categories').select('*').order('display_order').order('sort_order').order('name');
  if (e) return err(res, e.message, 500);

  await redis.set(CACHE_KEY, JSON.stringify(data), 'EX', config.redis.cacheTtl);
  return ok(res, data);
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
    if (e.code === '23505') return err(res, 'Category name, code, or slug already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'category_created', targetType: 'category', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (imageUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'category', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'category_image' } });
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

  if (req.file) {
    const slug = (updates.slug || old.slug || 'cat').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `categories/${slug}-${Date.now()}.webp`;
    updates.image = await processAndUploadImage(req.file.buffer, path, { width: 400, height: 400, quality: 85 });
    if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('categories').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Category name, code, or slug already exists', 409);
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

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'category_updated', targetType: 'category', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'category', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'category_image', old_url: old.image } });

  return ok(res, data, 'Category updated');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('categories').select('name, image').eq('id', id).single();
  if (!old) return err(res, 'Category not found', 404);

  if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }

  const { error: e } = await supabase.from('categories').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: sub-categories still reference this category', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'category_deleted', targetType: 'category', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.image) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'category', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Category deleted');
}
