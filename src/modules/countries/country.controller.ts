import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'countries:all';
const clearCache = () => redis.del(CACHE_KEY);

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '');
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

  // Handle flag image if uploaded
  let flagUrl: string | null = null;
  if (req.file) {
    const path = `flags/${(body.iso2 || 'xx').toLowerCase()}.webp`;
    flagUrl = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 150, quality: 85 });
    body.flag_image = flagUrl;
  }

  const { data, error: e } = await supabase.from('countries').insert(body).select().single();
  if (e) {
    // Cleanup uploaded file if DB insert failed
    if (flagUrl) try { await deleteImage(extractBunnyPath(flagUrl)); } catch {}
    if (e.code === '23505') return err(res, 'Country ISO code already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'country_created', targetType: 'country', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (flagUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'country', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'flag' } });

  return ok(res, data, 'Country created', 201);
}

// PATCH /countries/:id — update with optional flag image (old flag auto-deleted)
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('countries').select('*').eq('id', id).single();
  if (!old) return err(res, 'Country not found', 404);

  const updates = parseMultipartBody(req);

  // Handle flag image if uploaded
  if (req.file) {
    // Delete old flag from Bunny CDN
    if (old.flag_image) {
      try { await deleteImage(extractBunnyPath(old.flag_image)); } catch {}
    }
    const iso = updates.iso2 || old.iso2;
    const path = `flags/${iso.toLowerCase()}.webp`;
    updates.flag_image = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 150, quality: 85 });
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('countries').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Build changes log
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

// DELETE /countries/:id — also deletes flag from CDN
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('countries').select('name, flag_image').eq('id', id).single();
  if (!old) return err(res, 'Country not found', 404);

  if (old.flag_image) {
    try { await deleteImage(extractBunnyPath(old.flag_image)); } catch {}
  }

  const { error: e } = await supabase.from('countries').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'country_deleted', targetType: 'country', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.flag_image) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'country', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Country deleted');
}

// PATCH /countries/:id/toggle-active
export async function toggleActive(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('countries').select('name, is_active').eq('id', id).single();
  if (!old) return err(res, 'Country not found', 404);

  const newVal = !old.is_active;
  await supabase.from('countries').update({ is_active: newVal }).eq('id', id);
  await clearCache();

  logAdmin({ actorId: req.user!.id, action: 'country_updated', targetType: 'country', targetId: id, targetName: old.name, changes: { is_active: { old: old.is_active, new: newVal } }, ip: getClientIp(req) });
  return ok(res, { is_active: newVal }, `Country ${newVal ? 'activated' : 'deactivated'}`);
}

// Parse JSON fields from multipart form-data body
function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  // Parse JSON array/boolean strings from form-data
  if (typeof body.languages === 'string') {
    try { body.languages = JSON.parse(body.languages); } catch {}
  }
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  // Remove empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') delete body[k]; }
  return body;
}
