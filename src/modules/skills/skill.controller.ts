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

const CACHE_KEY = 'skills:all';
const clearCache = () => redis.del(CACHE_KEY);

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /skills?category=technical
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'name' });

  let q = supabase.from('skills').select('*', { count: 'exact' });

  // Search
  if (search) q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%`);

  // Filters
  if (req.query.category) q = q.eq('category', req.query.category);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /skills/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('skills').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Skill not found', 404);
  return ok(res, data);
}

// POST /skills
export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'skill', 'activate')) {
    return err(res, 'Permission denied: skill:activate required to create inactive skill', 403);
  }

  // Icon upload
  let iconUrl: string | null = null;
  if (req.file) {
    const slug = (body.name || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `skills/${slug}-${Date.now()}.webp`;
    iconUrl = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 200, quality: 85 });
    body.icon = iconUrl;
  }

  const { data, error: e } = await supabase.from('skills').insert(body).select().single();
  if (e) {
    if (iconUrl) { try { await deleteImage(extractBunnyPath(iconUrl), iconUrl); } catch {} }
    if (e.code === '23505') return err(res, 'Skill name already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'skill_created', targetType: 'skill', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (iconUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'skill', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'icon' } });
  return ok(res, data, 'Skill created', 201);
}

// PATCH /skills/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('skills').select('*').eq('id', id).single();
  if (!old) return err(res, 'Skill not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'skill', 'activate')) {
      return err(res, 'Permission denied: skill:activate required to change active status', 403);
    }
  }

  // Icon upload — unique path so CDN cache never serves stale images
  if (req.file) {
    const slug = (updates.name || old.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `skills/${slug}-${Date.now()}.webp`;
    updates.icon = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 200, quality: 85 });
    // Delete old AFTER new is uploaded
    if (old.icon) { try { await deleteImage(extractBunnyPath(old.icon), old.icon); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('skills').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Skill name already exists', 409);
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

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'skill_updated', targetType: 'skill', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'skill', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'icon', old_url: old.icon } });

  return ok(res, data, 'Skill updated');
}

// DELETE /skills/:id
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('skills').select('name, icon').eq('id', id).single();
  if (!old) return err(res, 'Skill not found', 404);

  if (old.icon) { try { await deleteImage(extractBunnyPath(old.icon), old.icon); } catch {} }

  const { error: e } = await supabase.from('skills').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'skill_deleted', targetType: 'skill', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.icon) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'skill', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Skill deleted');
}
