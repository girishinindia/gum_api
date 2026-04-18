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

const SITE_URL = 'https://growupmore.com';
const SITE_NAME = 'GrowUpMore';

const CACHE_KEY = 'sub_category_translations:all';
const clearCache = async (subCategoryId?: number) => {
  await redis.del(CACHE_KEY);
  if (subCategoryId) await redis.del(`sub_category_translations:sub_category:${subCategoryId}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sub_category_id === 'string') body.sub_category_id = parseInt(body.sub_category_id);
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id);
  if (typeof body.tags === 'string') { try { body.tags = JSON.parse(body.tags); } catch { body.tags = []; } }
  if (typeof body.structured_data === 'string') { try { body.structured_data = JSON.parse(body.structured_data); } catch { body.structured_data = []; } }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

/**
 * Auto-generates JSON-LD structured data for a sub-category translation.
 * Produces: CollectionPage, BreadcrumbList (4-level), ItemList.
 */
function generateStructuredData(opts: {
  name: string;
  description?: string | null;
  subCategorySlug: string;
  categorySlug: string;
  categoryCode: string;
  isoCode?: string;
  image?: string | null;
  canonicalUrl?: string | null;
}): any[] {
  const lang = opts.isoCode || 'en';
  const pageUrl = opts.canonicalUrl || `${SITE_URL}/${lang}/categories/${opts.categorySlug}/${opts.subCategorySlug}`;

  const sd: any[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: opts.name,
      ...(opts.description && { description: opts.description }),
      url: pageUrl,
      inLanguage: lang,
      ...(opts.image && { image: opts.image }),
      isPartOf: {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: SITE_URL,
      },
      provider: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: SITE_URL,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/${lang}` },
        { '@type': 'ListItem', position: 2, name: 'Categories', item: `${SITE_URL}/${lang}/categories` },
        { '@type': 'ListItem', position: 3, name: opts.categoryCode, item: `${SITE_URL}/${lang}/categories/${opts.categorySlug}` },
        { '@type': 'ListItem', position: 4, name: opts.name },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: opts.name,
      numberOfItems: 0,
      itemListElement: [],
    },
  ];

  return sd;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'name' });

  let q = supabase.from('sub_category_translations').select('*, sub_categories(code, slug, image, category_id, categories(code, slug)), languages(name, native_name, iso_code)', { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,meta_title.ilike.%${search}%,focus_keyword.ilike.%${search}%`);
  if (req.query.sub_category_id) q = q.eq('sub_category_id', req.query.sub_category_id);
  if (req.query.language_id) q = q.eq('language_id', req.query.language_id);
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

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('sub_category_translations').select('*, sub_categories(code, slug, image, category_id, categories(code, slug)), languages(name, native_name, iso_code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Sub-category translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'sub_category_translation', 'activate')) {
    return err(res, 'Permission denied: sub_category_translation:activate required to create inactive', 403);
  }

  // Verify sub-category exists (include parent category for structured data)
  const { data: subCat } = await supabase.from('sub_categories').select('id, slug, image, category_id, categories(code, slug)').eq('id', body.sub_category_id).single();
  if (!subCat) return err(res, 'Sub-category not found', 404);

  // Verify language exists and for_material = true
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  // Set audit field
  body.created_by = req.user!.id;

  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const uploadedUrls: string[] = [];

  // Process OG image (1200x630 for Open Graph standard)
  if (files?.og_image_file?.[0]) {
    const slug = (body.name || 'sub-cat-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-category-translations/og/${slug}-${Date.now()}.webp`;
    body.og_image = await processAndUploadImage(files.og_image_file[0].buffer, path, { width: 1200, height: 630, quality: 85 });
    uploadedUrls.push(body.og_image);
  }

  // Process Twitter image (1200x600 for Twitter card)
  if (files?.twitter_image_file?.[0]) {
    const slug = (body.name || 'sub-cat-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-category-translations/twitter/${slug}-${Date.now()}.webp`;
    body.twitter_image = await processAndUploadImage(files.twitter_image_file[0].buffer, path, { width: 1200, height: 600, quality: 85 });
    uploadedUrls.push(body.twitter_image);
  }

  // Auto-generate structured_data if empty/null (use sub-category image as fallback)
  if (!body.structured_data || (Array.isArray(body.structured_data) && body.structured_data.length === 0)) {
    const parentCat = (subCat as any).categories;
    body.structured_data = generateStructuredData({
      name: body.name,
      description: body.description,
      subCategorySlug: subCat.slug,
      categorySlug: parentCat?.slug || 'category',
      categoryCode: parentCat?.code || 'Category',
      isoCode: lang.iso_code,
      image: subCat.image || null,
      canonicalUrl: body.canonical_url,
    });
  }

  const { data, error: e } = await supabase.from('sub_category_translations').insert(body).select('*, sub_categories(code, slug, image, category_id, categories(code, slug)), languages(name, native_name, iso_code)').single();
  if (e) {
    for (const url of uploadedUrls) { try { await deleteImage(extractBunnyPath(url), url); } catch {} }
    if (e.code === '23505') return err(res, 'Translation for this sub-category and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.sub_category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_translation_created', targetType: 'sub_category_translation', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (uploadedUrls.length) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'sub_category_translation', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'sub_category_translation_images', count: uploadedUrls.length } });
  return ok(res, data, 'Sub-category translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_category_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Sub-category translation not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'sub_category_translation', 'activate')) {
      return err(res, 'Permission denied: sub_category_translation:activate required to change active status', 403);
    }
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  // Track resolved FK data for structured data regeneration
  let resolvedSubCatSlug: string | undefined;
  let resolvedSubCatImage: string | undefined;
  let resolvedCatSlug: string | undefined;
  let resolvedCatCode: string | undefined;
  let resolvedLangIso: string | undefined;

  if (updates.sub_category_id && updates.sub_category_id !== old.sub_category_id) {
    const { data: subCat } = await supabase.from('sub_categories').select('id, slug, image, categories(code, slug)').eq('id', updates.sub_category_id).single();
    if (!subCat) return err(res, 'Sub-category not found', 404);
    resolvedSubCatSlug = subCat.slug;
    resolvedSubCatImage = subCat.image;
    const parentCat = (subCat as any).categories;
    resolvedCatSlug = parentCat?.slug;
    resolvedCatCode = parentCat?.code;
  }

  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id, iso_code').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
    resolvedLangIso = lang.iso_code;
  }

  // Regenerate structured data if requested via query param
  if (req.query.regenerate_sd === 'true') {
    const subCatId = updates.sub_category_id || old.sub_category_id;
    const langId = updates.language_id || old.language_id;
    if (!resolvedSubCatSlug) {
      const { data: subCat } = await supabase.from('sub_categories').select('slug, image, categories(code, slug)').eq('id', subCatId).single();
      resolvedSubCatSlug = subCat?.slug;
      resolvedSubCatImage = subCat?.image;
      const parentCat = (subCat as any)?.categories;
      resolvedCatSlug = parentCat?.slug;
      resolvedCatCode = parentCat?.code;
    }
    if (!resolvedLangIso) {
      const { data: lang } = await supabase.from('languages').select('iso_code').eq('id', langId).single();
      resolvedLangIso = lang?.iso_code;
    }
    updates.structured_data = generateStructuredData({
      name: updates.name || old.name,
      description: updates.description !== undefined ? updates.description : old.description,
      subCategorySlug: resolvedSubCatSlug || 'sub-category',
      categorySlug: resolvedCatSlug || 'category',
      categoryCode: resolvedCatCode || 'Category',
      isoCode: resolvedLangIso || 'en',
      image: resolvedSubCatImage || null,
      canonicalUrl: updates.canonical_url !== undefined ? updates.canonical_url : old.canonical_url,
    });
  }

  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  let mediaUploaded = false;

  // Process OG image (1200x630)
  if (files?.og_image_file?.[0]) {
    const slug = (updates.name || old.name || 'sub-cat-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-category-translations/og/${slug}-${Date.now()}.webp`;
    updates.og_image = await processAndUploadImage(files.og_image_file[0].buffer, path, { width: 1200, height: 630, quality: 85 });
    if (old.og_image) { try { await deleteImage(extractBunnyPath(old.og_image), old.og_image); } catch {} }
    mediaUploaded = true;
  }

  // Process Twitter image (1200x600)
  if (files?.twitter_image_file?.[0]) {
    const slug = (updates.name || old.name || 'sub-cat-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-category-translations/twitter/${slug}-${Date.now()}.webp`;
    updates.twitter_image = await processAndUploadImage(files.twitter_image_file[0].buffer, path, { width: 1200, height: 600, quality: 85 });
    if (old.twitter_image) { try { await deleteImage(extractBunnyPath(old.twitter_image), old.twitter_image); } catch {} }
    mediaUploaded = true;
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('sub_category_translations').update(updates).eq('id', id).select('*, sub_categories(code, slug, image, category_id, categories(code, slug)), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this sub-category and language already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  const imageFields = ['og_image', 'twitter_image'];
  for (const k of Object.keys(updates)) {
    if (imageFields.includes(k)) {
      changes[k] = { old: (old as any)[k] || null, new: updates[k] };
    } else if (k === 'updated_by') {
      // skip audit field
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.sub_category_id);
  if (updates.sub_category_id && updates.sub_category_id !== old.sub_category_id) await clearCache(updates.sub_category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_translation_updated', targetType: 'sub_category_translation', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (mediaUploaded) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'sub_category_translation', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'sub_category_translation_images' } });

  return ok(res, data, 'Sub-category translation updated');
}

// DELETE /sub-category-translations/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_category_translations').select('name, deleted_at, sub_category_id').eq('id', id).single();
  if (!old) return err(res, 'Sub-category translation not found', 404);
  if (old.deleted_at) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('sub_category_translations')
    .update({ deleted_at: new Date().toISOString(), is_active: false, is_deleted: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.sub_category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_translation_soft_deleted', targetType: 'sub_category_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Sub-category translation moved to trash');
}

// PATCH /sub-category-translations/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_category_translations').select('name, deleted_at, sub_category_id').eq('id', id).single();
  if (!old) return err(res, 'Sub-category translation not found', 404);
  if (!old.deleted_at) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('sub_category_translations')
    .update({ deleted_at: null, is_active: true, is_deleted: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.sub_category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_translation_restored', targetType: 'sub_category_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Sub-category translation restored');
}

// DELETE /sub-category-translations/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_category_translations').select('name, og_image, twitter_image, sub_category_id').eq('id', id).single();
  if (!old) return err(res, 'Sub-category translation not found', 404);

  // Clean up CDN images
  for (const url of [old.og_image, old.twitter_image]) {
    if (url) { try { await deleteImage(extractBunnyPath(url), url); } catch {} }
  }

  const { error: e } = await supabase.from('sub_category_translations').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.sub_category_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_category_translation_deleted', targetType: 'sub_category_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.og_image || old.twitter_image) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'sub_category_translation', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Sub-category translation permanently deleted');
}
