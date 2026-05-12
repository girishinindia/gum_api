import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';

const CACHE_KEY = 'badges:all';
const clearCache = () => redis.del(CACHE_KEY);

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.xp_reward === 'string') body.xp_reward = body.xp_reward === '' ? null : parseInt(body.xp_reward);
  if (typeof body.sort_order === 'string') body.sort_order = body.sort_order === '' ? 0 : parseInt(body.sort_order);
  // Parse trigger_config from JSON string (FormData sends JSON fields as strings)
  if (typeof body.trigger_config === 'string') {
    try { body.trigger_config = JSON.parse(body.trigger_config); } catch { body.trigger_config = {}; }
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'sort_order' });

  let q = supabase.from('badges').select('*', { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,slug.ilike.%${search}%,description.ilike.%${search}%`);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  if (req.query.category) q = q.eq('category', req.query.category as string);
  if (req.query.trigger_type) q = q.eq('trigger_type', req.query.trigger_type as string);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Enrich with award count
  const badgeIds = (data || []).map((b: any) => b.id);
  let awardCountMap: Record<number, number> = {};
  if (badgeIds.length > 0) {
    for (const bid of badgeIds) {
      const { count: c } = await supabase.from('user_badges').select('id', { count: 'exact', head: true }).eq('badge_id', bid);
      awardCountMap[bid] = c || 0;
    }
  }

  const enriched = (data || []).map((b: any) => ({
    ...b,
    awarded_count: awardCountMap[b.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

// ── GET BY ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('badges').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Badge not found', 404);

  // Get award count
  const { count } = await supabase.from('user_badges').select('id', { count: 'exact', head: true }).eq('badge_id', data.id);
  (data as any).awarded_count = count || 0;

  return ok(res, data);
}

// ── CREATE ──
export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'badge', 'activate')) {
    return err(res, 'Permission denied: badge:activate required to create inactive', 403);
  }

  if (body.name && !body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'badges', body.name);
  }

  body.created_by = req.user!.id;

  let imageUrl: string | null = null;
  if (req.file) {
    const slug = (body.slug || 'badge').slice(0, 40);
    const path = `badges/${slug}-${Date.now()}.webp`;
    imageUrl = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 200, quality: 85 });
    body.icon_url = imageUrl;
  }

  const { data, error: e } = await supabase.from('badges').insert(body).select().single();
  if (e) {
    if (imageUrl) { try { await deleteImage(extractBunnyPath(imageUrl), imageUrl); } catch {} }
    if (e.code === '23505') return err(res, 'Badge slug already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'badge_created', targetType: 'badge', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (imageUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'badge', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'badge_icon' } });
  return ok(res, data, 'Badge created', 201);
}

// ── UPDATE ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('badges').select('*').eq('id', id).single();
  if (!old) return err(res, 'Badge not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'badge', 'activate')) {
      return err(res, 'Permission denied: badge:activate required to change active status', 403);
    }
  }

  updates.updated_by = req.user!.id;

  if (req.file) {
    const slug = (updates.slug || old.slug || 'badge').slice(0, 40);
    const path = `badges/${slug}-${Date.now()}.webp`;
    updates.icon_url = await processAndUploadImage(req.file.buffer, path, { width: 200, height: 200, quality: 85 });
    if (old.icon_url) { try { await deleteImage(extractBunnyPath(old.icon_url), old.icon_url); } catch {} }
  }

  if (Object.keys(updates).filter(k => k !== 'updated_by').length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('badges').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Badge slug already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'badge_updated', targetType: 'badge', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'badge', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'badge_icon', old_url: old.icon_url } });
  return ok(res, data, 'Badge updated');
}

// ── SOFT DELETE ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('badges').select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Badge not found', 404);
  if (old.deleted_at) return err(res, 'Badge is already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from('badges')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'badge_soft_deleted', targetType: 'badge', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Badge moved to trash');
}

// ── RESTORE ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('badges').select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Badge not found', 404);
  if (!old.deleted_at) return err(res, 'Badge is not in trash', 400);

  const { data, error: e } = await supabase
    .from('badges')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'badge_restored', targetType: 'badge', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Badge restored');
}

// ── PERMANENT DELETE ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('badges').select('*').eq('id', id).single();
  if (!old) return err(res, 'Badge not found', 404);

  // Check if badge has been awarded
  const { count } = await supabase.from('user_badges').select('id', { count: 'exact', head: true }).eq('badge_id', id);
  if (count && count > 0) {
    return err(res, `Cannot delete: badge has been awarded to ${count} user(s). Remove awards first or use soft delete.`, 400);
  }

  if (old.icon_url) { try { await deleteImage(extractBunnyPath(old.icon_url), old.icon_url); } catch {} }

  const { error: e } = await supabase.from('badges').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'badge_deleted', targetType: 'badge', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Badge permanently deleted');
}
