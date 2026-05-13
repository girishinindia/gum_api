import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { config } from '../../config';

const TABLE = 'sticker_categories';
const CACHE_KEY = 'sticker_categories:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = body.display_order ? parseInt(body.display_order) || 0 : 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ── GET /sticker-categories ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });
  let q = supabase.from(TABLE).select('*', { count: 'exact' });

  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);

  if (search) q = applySearch(q, search, { ilike: ['name', 'slug'] });
  if (req.query.is_active !== undefined) q = q.eq('is_active', req.query.is_active === 'true');

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /sticker-categories/:id ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Sticker category not found', 404);
  return ok(res, data);
}

// ── POST /sticker-categories ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.name?.trim()) return err(res, 'Name is required', 400);
  if (!body.slug?.trim()) return err(res, 'Slug is required', 400);

  // Phase 15.1 — handle thumbnail upload.
  if (req.file) {
    const cdnUrl = await processAndUploadImage(req.file.buffer, `chat/sticker-categories/${Date.now()}.webp`, { width: 512, height: 512, quality: 85 });
    if (cdnUrl) body.thumbnail_url = cdnUrl;
  }

  const { data, error: e } = await supabase.from(TABLE).insert(body).select('*').single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'sticker_category_created', targetType: 'sticker_category', targetId: data.id, targetName: body.name, ip: getClientIp(req) });
  return ok(res, data, 'Sticker category created', 201);
}

// ── PATCH /sticker-categories/:id ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, thumbnail_url').eq('id', id).single();
  if (!old) return err(res, 'Sticker category not found', 404);

  const body = parseBody(req);

  if (req.file) {
    // Phase 15.1 — delete old thumbnail first, then upload new.
    if (old.thumbnail_url) {
      try { await deleteImage(extractBunnyPath(old.thumbnail_url), old.thumbnail_url); } catch {}
    }
    const cdnUrl = await processAndUploadImage(req.file.buffer, `chat/sticker-categories/${Date.now()}.webp`, { width: 512, height: 512, quality: 85 });
    if (cdnUrl) body.thumbnail_url = cdnUrl;
  }

  const { data, error: e } = await supabase.from(TABLE).update(body).eq('id', id).select('*').single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'sticker_category_updated', targetType: 'sticker_category', targetId: id, targetName: body.name || old.name, ip: getClientIp(req) });
  return ok(res, data, 'Sticker category updated');
}

// ── DELETE /sticker-categories/:id (soft) ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Sticker category not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).select('*').single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'sticker_category_soft_deleted', targetType: 'sticker_category', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Sticker category moved to trash');
}

// ── PATCH /sticker-categories/:id/restore ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Sticker category not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select('*').single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'sticker_category_restored', targetType: 'sticker_category', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Sticker category restored');
}

// ── DELETE /sticker-categories/:id/permanent ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, thumbnail_url').eq('id', id).single();
  if (!old) return err(res, 'Sticker category not found', 404);

  // Phase 15.1 — clean up CDN file too.
  if (old.thumbnail_url) {
    try { await deleteImage(extractBunnyPath(old.thumbnail_url), old.thumbnail_url); } catch {}
  }

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'sticker_category_deleted', targetType: 'sticker_category', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Sticker category permanently deleted');
}
