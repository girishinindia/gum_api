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
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.category_id === 'string') body.category_id = parseInt(body.category_id) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('sub_categories').select('*, categories(code, slug)', { count: 'exact' });

  if (search) q = q.or(`code.ilike.%${search}%,slug.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.category_id) q = q.eq('category_id', parseInt(req.query.category_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation names
  const scIds = (data || []).map((sc: any) => sc.id);
  let englishNameMap: Record<number, string> = {};
  if (scIds.length > 0) {
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (enLang) {
      const { data: enTranslations } = await supabase
        .from('sub_category_translations')
        .select('sub_category_id, name')
        .in('sub_category_id', scIds)
        .eq('language_id', enLang.id)
        .is('deleted_at', null);
      if (enTranslations) {
        for (const t of enTranslations) {
          englishNameMap[t.sub_category_id] = t.name;
        }
      }
    }
  }

  const enriched = (data || []).map((sc: any) => ({
    ...sc,
    english_name: englishNameMap[sc.id] || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('sub_categories').select('*, categories(code, slug)').eq('id', req.params.id).single();
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

  // Set audit field
  body.created_by = req.user!.id;

  let imageUrl: string | null = null;
  if (req.file) {
    const slug = (body.slug || body.code || 'subcat').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-categories/${slug}-${Date.now()}.webp`;
    imageUrl = await processAndUploadImage(req.file.buffer, path, { width: 400, height: 400, quality: 85 });
    body.image = imageUrl;
  }

  const { data, error: e } = await supabase.from('sub_categories').insert(body).select('*, categories(code, slug)').single();
  if (e) {
    if (imageUrl) { try { await deleteImage(extractBunnyPath(imageUrl), imageUrl); } catch {} }
    if (e.code === '23505') return err(res, 'Sub-category code or slug already exists in this category', 409);
    return err(res, e.message, 500);
  }

  // Sync English translation
  if (body.name) {
    await supabase.from('sub_category_translations').upsert({
      sub_category_id: data.id,
      language_id: 7,
      name: body.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'sub_category_id,language_id' });
  }

  await clearCache(body.category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_created', targetType: 'sub_category', targetId: data.id, targetName: data.code, ip: getClientIp(req) });
  if (imageUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'sub_category', resourceId: data.id, resourceName: data.code, ip: getClientIp(req), metadata: { type: 'sub_category_image' } });
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

  // Set audit field
  updates.updated_by = req.user!.id;

  if (req.file) {
    const slug = (updates.slug || old.slug || 'subcat').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-categories/${slug}-${Date.now()}.webp`;
    updates.image = await processAndUploadImage(req.file.buffer, path, { width: 400, height: 400, quality: 85 });
    if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('sub_categories').update(updates).eq('id', id).select('*, categories(code, slug)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Sub-category code or slug already exists in this category', 409);
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

  // Sync English translation
  if (updates.name) {
    await supabase.from('sub_category_translations').upsert({
      sub_category_id: id,
      language_id: 7,
      name: updates.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'sub_category_id,language_id' });
  }

  await clearCache(old.category_id);
  if (updates.category_id && updates.category_id !== old.category_id) await clearCache(updates.category_id);

  logAdmin({ actorId: req.user!.id, action: 'sub_category_updated', targetType: 'sub_category', targetId: id, targetName: data.code, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'sub_category', resourceId: id, resourceName: data.code, ip: getClientIp(req), metadata: { type: 'sub_category_image', old_url: old.image } });

  return ok(res, data, 'Sub-category updated');
}

// DELETE /sub-categories/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_categories').select('code, category_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Sub-category not found', 404);
  if (old.deleted_at) return err(res, 'Sub-category is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('sub_categories')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to sub-category translations
  await supabase.from('sub_category_translations').update({ deleted_at: now, is_active: false }).eq('sub_category_id', id).is('deleted_at', null);

  await clearCache(old.category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_soft_deleted', targetType: 'sub_category', targetId: id, targetName: old.code, ip: getClientIp(req) });
  return ok(res, data, 'Sub-category moved to trash');
}

// PATCH /sub-categories/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_categories').select('code, category_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Sub-category not found', 404);
  if (!old.deleted_at) return err(res, 'Sub-category is not in trash', 400);

  const { data, error: e } = await supabase
    .from('sub_categories')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore to sub-category translations
  await supabase.from('sub_category_translations').update({ deleted_at: null, is_active: true }).eq('sub_category_id', id).not('deleted_at', 'is', null);

  await clearCache(old.category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_restored', targetType: 'sub_category', targetId: id, targetName: old.code, ip: getClientIp(req) });
  return ok(res, data, 'Sub-category restored');
}

// DELETE /sub-categories/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_categories').select('code, image, category_id').eq('id', id).single();
  if (!old) return err(res, 'Sub-category not found', 404);

  if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }

  // Cascade: delete translations first to avoid FK constraint
  await supabase.from('sub_category_translations').delete().eq('sub_category_id', id);

  const { error: e } = await supabase.from('sub_categories').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_deleted', targetType: 'sub_category', targetId: id, targetName: old.code, ip: getClientIp(req) });
  if (old.image) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'sub_category', resourceId: id, resourceName: old.code, ip: getClientIp(req) });

  return ok(res, null, 'Sub-category deleted');
}
