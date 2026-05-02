import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { deleteImage } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

const CACHE_KEY = 'bundles:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  for (const k of ['is_active', 'is_featured']) {
    if (typeof body[k] === 'string') body[k] = body[k] === 'true';
  }
  // Integer fields
  for (const k of ['instructor_id', 'max_courses', 'validity_days', 'enrollment_count', 'rating_count', 'view_count']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Numeric fields
  for (const k of ['price', 'original_price', 'discount_percentage', 'rating_average']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseFloat(body[k]) || null : null;
  }
  // Nullify empty strings
  for (const k of ['code', 'name', 'instructor_id', 'original_price', 'discount_percentage', 'validity_days', 'starts_at', 'expires_at', 'max_courses']) {
    if (body[k] === '') body[k] = null;
  }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('bundles').select('*', { count: 'exact' });

  if (search) q = q.or(`code.ilike.%${search}%,slug.ilike.%${search}%,name.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  if (req.query.bundle_owner) q = q.eq('bundle_owner', req.query.bundle_owner as string);
  if (req.query.is_featured === 'true') q = q.eq('is_featured', true);
  if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch instructor names
  const instructorIds = [...new Set((data || []).filter((b: any) => b.instructor_id).map((b: any) => b.instructor_id))];
  let instructorMap: Record<number, string> = {};
  if (instructorIds.length > 0) {
    const { data: instructors } = await supabase.from('users').select('id, full_name').in('id', instructorIds);
    if (instructors) {
      for (const i of instructors) instructorMap[i.id] = i.full_name;
    }
  }

  // Fetch translation count
  const bundleIds = (data || []).map((b: any) => b.id);
  const isTrash = req.query.show_deleted === 'true';
  let translationCountMap: Record<number, number> = {};
  if (bundleIds.length > 0) {
    let tQ = supabase.from('bundle_translations').select('bundle_id').in('bundle_id', bundleIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) {
        translationCountMap[t.bundle_id] = (translationCountMap[t.bundle_id] || 0) + 1;
      }
    }
  }

  const enriched = (data || []).map((b: any) => ({
    ...b,
    instructor_name: b.instructor_id ? instructorMap[b.instructor_id] || null : null,
    translation_count: translationCountMap[b.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('bundles').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Bundle not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'bundle', 'activate')) {
    return err(res, 'Permission denied: bundle:activate required to create inactive', 403);
  }

  body.created_by = req.user!.id;

  // Auto-generate slug
  if (!body.slug && (body.code || body.name)) {
    body.slug = await generateUniqueSlug(supabase, 'bundles', body.code || body.name);
  } else if (body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'bundles', body.slug);
  }

  const { data, error: e } = await supabase.from('bundles').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Bundle code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'bundle_created', targetType: 'bundle', targetId: data.id, targetName: data.code || data.slug, ip: getClientIp(req) });
  return ok(res, data, 'Bundle created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('bundles').select('*').eq('id', id).single();
  if (!old) return err(res, 'Bundle not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'bundle', 'activate')) {
      return err(res, 'Permission denied: bundle:activate required to change active status', 403);
    }
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('bundles').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Bundle code or slug already exists', 409);
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
  logAdmin({ actorId: req.user!.id, action: 'bundle_updated', targetType: 'bundle', targetId: id, targetName: data.code || data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'Bundle updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('bundles').select('code, slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Bundle not found', 404);
  if (old.deleted_at) return err(res, 'Bundle is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('bundles')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete
  // 1. bundle_courses
  await supabase.from('bundle_courses').update({ deleted_at: now, is_active: false }).eq('bundle_id', id).is('deleted_at', null);
  // 2. bundle_translations
  await supabase.from('bundle_translations').update({ deleted_at: now, is_active: false }).eq('bundle_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'bundle_soft_deleted', targetType: 'bundle', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Bundle moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('bundles').select('code, slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Bundle not found', 404);
  if (!old.deleted_at) return err(res, 'Bundle is not in trash', 400);

  const { data, error: e } = await supabase
    .from('bundles')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore
  // 1. bundle_translations
  await supabase.from('bundle_translations').update({ deleted_at: null, is_active: true }).eq('bundle_id', id).not('deleted_at', 'is', null);
  // 2. bundle_courses
  await supabase.from('bundle_courses').update({ deleted_at: null, is_active: true }).eq('bundle_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'bundle_restored', targetType: 'bundle', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Bundle restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('bundles').select('code, slug').eq('id', id).single();
    if (!old) return err(res, 'Bundle not found', 404);

    // Cascade permanent delete: bottom-up to satisfy FK constraints
    // 1. Delete bundle_courses (leaf)
    await supabase.from('bundle_courses').delete().eq('bundle_id', id);

    // 2. Delete bundle_translations with CDN cleanup
    const { data: translations } = await supabase.from('bundle_translations').select('id, thumbnail_url, banner_url').eq('bundle_id', id);
    if (translations) {
      const imageFields = ['thumbnail_url', 'banner_url'] as const;
      for (const t of translations) {
        for (const field of imageFields) {
          const url = (t as any)[field];
          if (url) { try { await deleteImage(extractBunnyPath(url), url); } catch {} }
        }
      }
    }
    await supabase.from('bundle_translations').delete().eq('bundle_id', id);

    // 3. Delete the bundle itself
    const { error: e } = await supabase.from('bundles').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'bundle_deleted', targetType: 'bundle', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
    return ok(res, null, 'Bundle permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete bundle', 500);
  }
}
