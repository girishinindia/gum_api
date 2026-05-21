import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { applySearch, SEARCH_CONFIGS } from '../../utils/search';
import { config } from '../../config';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'blog_posts';
const CACHE_KEY = 'blog_posts:all';

const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

const FK_SELECT = '*, blog_categories!blog_posts_category_id_fkey(id, name), users!blog_posts_author_id_fkey(id, first_name, last_name, email)';

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_featured === 'string') body.is_featured = body.is_featured === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['category_id', 'author_id', 'view_count']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Parse JSONB tags
  if (typeof body.tags === 'string') {
    try { body.tags = JSON.parse(body.tags); } catch { /* leave as-is */ }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, SEARCH_CONFIGS.blog_posts);
  if (req.query.category_id) q = q.eq('category_id', parseInt(req.query.category_id as string));
  if (req.query.author_id) q = q.eq('author_id', parseInt(req.query.author_id as string));
  if (req.query.author_type) q = q.eq('author_type', req.query.author_type as string);
  if (req.query.status) q = q.eq('status', req.query.status as string);
  if (req.query.is_featured === 'true') q = q.eq('is_featured', true);
  else if (req.query.is_featured === 'false') q = q.eq('is_featured', false);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET BY ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Blog post not found', 404);
  return ok(res, data);
}

// ── CREATE ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  const files = (req as any).files as { [field: string]: Express.Multer.File[] } | undefined;

  if (!body.title || !body.content) {
    return err(res, 'title and content are required', 400);
  }

  // Phase 46 — auto-generate a unique slug from title when not provided
  // (previously the computed slug was only used for image paths and never
  // written to the row, leaving blog_posts.slug null).
  body.slug = await generateUniqueSlug(supabase, TABLE, body.slug || body.title);
  const slug = body.slug;

  // Phase 15.1 — featured image (1200×630)
  if (files?.featured_image?.[0]) {
    const imgPath = `blog/featured/${slug}-${Date.now()}.webp`;
    body.featured_image_url = await processAndUploadImage(files.featured_image[0].buffer, imgPath, { width: 1200, height: 630, quality: 85 });
  }
  // Phase 15.1 — Open Graph image (1200×630)
  if (files?.og_image?.[0]) {
    const ogPath = `blog/og/${slug}-${Date.now()}.webp`;
    body.og_image_url = await processAndUploadImage(files.og_image[0].buffer, ogPath, { width: 1200, height: 630, quality: 85 });
  }

  // Phase 45 — blog_posts has no created_by/updated_by columns (writing them
  // caused "Could not find the 'created_by' column"). The author lives in
  // author_id; default it to the creating user when not explicitly set.
  if (body.author_id == null) body.author_id = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_post_created', targetType: 'blog_post', targetId: data.id, targetName: body.title, ip: getClientIp(req) });
  return ok(res, data, 'Blog post created', 201);
}

// ── UPDATE ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Blog post not found', 404);

  const updates = parseBody(req);
  const files = (req as any).files as { [field: string]: Express.Multer.File[] } | undefined;

  // Phase 46 — keep slug populated & unique. Regenerate when the slug is being
  // changed, or when the existing row has no slug yet.
  if (updates.slug || !old.slug) {
    updates.slug = await generateUniqueSlug(supabase, TABLE, updates.slug || updates.title || old.title, id);
  }
  const slug = updates.slug || old.slug;

  // Phase 15.1 — featured image: delete old first, then upload new.
  if (files?.featured_image?.[0]) {
    if (old.featured_image_url) {
      try { await deleteImage(extractBunnyPath(old.featured_image_url), old.featured_image_url); } catch {}
    }
    const imgPath = `blog/featured/${slug}-${Date.now()}.webp`;
    updates.featured_image_url = await processAndUploadImage(files.featured_image[0].buffer, imgPath, { width: 1200, height: 630, quality: 85 });
  }
  // Phase 15.1 — Open Graph image: delete old first, then upload new.
  if (files?.og_image?.[0]) {
    if (old.og_image_url) {
      try { await deleteImage(extractBunnyPath(old.og_image_url), old.og_image_url); } catch {}
    }
    const ogPath = `blog/og/${slug}-${Date.now()}.webp`;
    updates.og_image_url = await processAndUploadImage(files.og_image[0].buffer, ogPath, { width: 1200, height: 630, quality: 85 });
  }

  // No updated_by column on blog_posts.

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_post_updated', targetType: 'blog_post', targetId: id, targetName: updates.title || old.title, ip: getClientIp(req) });
  return ok(res, data, 'Blog post updated');
}

// ── PUBLISH ──
export async function publish(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, status').eq('id', id).single();
  if (!old) return err(res, 'Blog post not found', 404);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ status: 'published', published_at: now })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_post_published', targetType: 'blog_post', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Blog post published');
}

// ── ARCHIVE ──
export async function archive(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, status').eq('id', id).single();
  if (!old) return err(res, 'Blog post not found', 404);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ status: 'archived' })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_post_archived', targetType: 'blog_post', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Blog post archived');
}

// ── SOFT DELETE ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Blog post not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_post_soft_deleted', targetType: 'blog_post', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Blog post moved to trash');
}

// ── RESTORE ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Blog post not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_post_restored', targetType: 'blog_post', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Blog post restored');
}

// ── PERMANENT DELETE ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, featured_image_url, og_image_url').eq('id', id).single();
  if (!old) return err(res, 'Blog post not found', 404);

  // Phase 15.1 — clean up both CDN images.
  if (old.featured_image_url) {
    try { await deleteImage(extractBunnyPath(old.featured_image_url), old.featured_image_url); } catch {}
  }
  if (old.og_image_url) {
    try { await deleteImage(extractBunnyPath(old.og_image_url), old.og_image_url); } catch {}
  }

  // blog_reviews CASCADE delete automatically
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'blog_post_deleted', targetType: 'blog_post', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, null, 'Blog post permanently deleted');
}
