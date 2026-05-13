import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { applySearch } from '../../utils/search';
import { config } from '../../config';

const TABLE = 'custom_emojis';
const CACHE_KEY = 'custom_emojis:all';
const FK_SELECT = '*, emoji_categories(id, name, slug), users!custom_emojis_created_by_fkey(id, first_name, last_name, email)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_animated === 'string') body.is_animated = body.is_animated === 'true';
  for (const k of ['category_id', 'display_order']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ── GET /custom-emojis ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });
  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);

  if (search) q = applySearch(q, search, { ilike: ['name', 'shortcode'] });
  if (req.query.category_id) q = q.eq('category_id', parseInt(req.query.category_id as string));
  if (req.query.is_animated !== undefined) q = q.eq('is_animated', req.query.is_animated === 'true');

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /custom-emojis/:id ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Custom emoji not found', 404);
  return ok(res, data);
}

// ── POST /custom-emojis ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.name?.trim()) return err(res, 'Name is required', 400);
  if (!body.shortcode?.trim()) return err(res, 'Shortcode is required', 400);
  if (!body.category_id) return err(res, 'Category is required', 400);

  body.created_by = req.user!.id;

  if (req.file) {
    const cdnUrl = await processAndUploadImage(req.file.buffer, `chat/emojis/${Date.now()}.webp`);
    if (cdnUrl) body.image_url = cdnUrl;
  }

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'custom_emoji_created', targetType: 'custom_emoji', targetId: data.id, targetName: body.name, ip: getClientIp(req) });
  return ok(res, data, 'Custom emoji created', 201);
}

// ── PATCH /custom-emojis/:id ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, image_url').eq('id', id).single();
  if (!old) return err(res, 'Custom emoji not found', 404);

  const body = parseBody(req);

  if (req.file) {
    // Phase 15.1 — delete old image first, then upload new one.
    if (old.image_url) {
      try { await deleteImage(extractBunnyPath(old.image_url), old.image_url); } catch {}
    }
    const cdnUrl = await processAndUploadImage(req.file.buffer, `chat/emojis/${Date.now()}.webp`);
    if (cdnUrl) body.image_url = cdnUrl;
  }

  const { data, error: e } = await supabase.from(TABLE).update(body).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'custom_emoji_updated', targetType: 'custom_emoji', targetId: id, targetName: body.name || old.name, ip: getClientIp(req) });
  return ok(res, data, 'Custom emoji updated');
}

// ── DELETE /custom-emojis/:id (soft) ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Custom emoji not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'custom_emoji_soft_deleted', targetType: 'custom_emoji', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Custom emoji moved to trash');
}

// ── PATCH /custom-emojis/:id/restore ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Custom emoji not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null }).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'custom_emoji_restored', targetType: 'custom_emoji', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Custom emoji restored');
}

// ── DELETE /custom-emojis/:id/permanent ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, image_url').eq('id', id).single();
  if (!old) return err(res, 'Custom emoji not found', 404);

  // Phase 15.1 — clean up the CDN file too.
  if (old.image_url) {
    try { await deleteImage(extractBunnyPath(old.image_url), old.image_url); } catch {}
  }

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'custom_emoji_deleted', targetType: 'custom_emoji', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Custom emoji permanently deleted');
}
