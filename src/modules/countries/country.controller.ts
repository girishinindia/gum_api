import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'countries:all';
const clearCache = () => redis.del(CACHE_KEY);

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.languages === 'string') { try { body.languages = JSON.parse(body.languages); } catch {} }
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') delete body[k]; }
  return body;
}

export async function list(req: Request, res: Response) {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return ok(res, JSON.parse(cached));
  const { data, error: e } = await supabase.from('countries').select('*').order('sort_order').order('name');
  if (e) return err(res, e.message, 500);
  await redis.set(CACHE_KEY, JSON.stringify(data), 'EX', config.redis.cacheTtl);
  return ok(res, data);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('countries').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Country not found', 404);
  return ok(res, data);
}

// POST /countries — create with optional flag image
export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  // is_active on create also needs :activate (only if explicitly set to false)
  if (body.is_active === false && !hasPermission(req, 'country', 'activate')) {
    return err(res, 'Permission denied: country:activate required to create inactive country', 403);
  }

  let flagUrl: string | null = null;
  if (req.file) {
    const path = `flags/${(body.iso2 || 'xx').toLowerCase()}.webp`;
    flagUrl = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 150, quality: 85 });
    body.flag_image = flagUrl;
  }

  const { data, error: e } = await supabase.from('countries').insert(body).select().single();
  if (e) {
    if (flagUrl) { try { await deleteImage(extractBunnyPath(flagUrl)); } catch {} }
    if (e.code === '23505') return err(res, 'Country ISO code already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'country_created', targetType: 'country', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (flagUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'country', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'flag' } });
  return ok(res, data, 'Country created', 201);
}

// PATCH /countries/:id — update with optional flag + optional is_active
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('countries').select('*').eq('id', id).single();
  if (!old) return err(res, 'Country not found', 404);

  const updates = parseMultipartBody(req);

  // If is_active is being changed → need :activate permission
  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'country', 'activate')) {
      return err(res, 'Permission denied: country:activate required to change active status', 403);
    }
  }

  // Flag image upload
  if (req.file) {
    if (old.flag_image) { try { await deleteImage(extractBunnyPath(old.flag_image)); } catch {} }
    const iso = updates.iso2 || old.iso2;
    const path = `flags/${iso.toLowerCase()}.webp`;
    updates.flag_image = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 150, quality: 85 });
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('countries').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'flag_image') {
      changes.flag_image = { old: old.flag_image || null, new: updates.flag_image };
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'country_updated', targetType: 'country', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'country', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'flag', old_url: old.flag_image } });

  return ok(res, data, 'Country updated');
}

// DELETE /countries/:id
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('countries').select('name, flag_image').eq('id', id).single();
  if (!old) return err(res, 'Country not found', 404);

  if (old.flag_image) { try { await deleteImage(extractBunnyPath(old.flag_image)); } catch {} }

  const { error: e } = await supabase.from('countries').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'country_deleted', targetType: 'country', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.flag_image) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'country', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Country deleted');
}
