import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, uploadRawFile, deleteImage } from '../../services/storage.service';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const SITE_URL = 'https://growupmore.com';
const SITE_NAME = 'GrowUpMore';

const CACHE_KEY = 'sub_topic_translations:all';
const clearCache = async (subTopicId?: number) => {
  await redis.del(CACHE_KEY);
  if (subTopicId) await redis.del(`sub_topic_translations:sub_topic:${subTopicId}`);
};

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sub_topic_id === 'string') body.sub_topic_id = parseInt(body.sub_topic_id) || 0;
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id) || 0;
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.video_duration_minutes === 'string') body.video_duration_minutes = parseInt(body.video_duration_minutes) || null;
  if (typeof body.tags === 'string') { try { body.tags = JSON.parse(body.tags); } catch { body.tags = []; } }
  if (typeof body.structured_data === 'string') { try { body.structured_data = JSON.parse(body.structured_data); } catch { body.structured_data = []; } }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

/**
 * Auto-generates JSON-LD structured data for a sub-topic translation.
 * Produces: Article, BreadcrumbList (5-level: Home > Subjects > Subject > Topic > Sub-Topic), ItemList.
 */
function generateStructuredData(opts: {
  name: string;
  shortIntro?: string | null;
  subTopicSlug: string;
  topicSlug: string;
  isoCode?: string;
  image?: string | null;
  canonicalUrl?: string | null;
}): any[] {
  const lang = opts.isoCode || 'en';
  const pageUrl = opts.canonicalUrl || `${SITE_URL}/${lang}/subjects/${opts.topicSlug}/${opts.subTopicSlug}`;

  const sd: any[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      name: opts.name,
      ...(opts.shortIntro && { description: opts.shortIntro }),
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
        { '@type': 'ListItem', position: 2, name: 'Subjects', item: `${SITE_URL}/${lang}/subjects` },
        { '@type': 'ListItem', position: 3, name: 'Subject', item: `${SITE_URL}/${lang}/subjects` },
        { '@type': 'ListItem', position: 4, name: 'Topic', item: `${SITE_URL}/${lang}/subjects/${opts.topicSlug}` },
        { '@type': 'ListItem', position: 5, name: opts.name },
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

const FK_SELECT = '*, sub_topics(slug, topic_id, topics(slug, chapter_id, chapters(slug, subject_id))), languages(name, native_name, iso_code)';

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'sort_order' });

  let q = supabase.from('sub_topic_translations').select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,short_intro.ilike.%${search}%,meta_title.ilike.%${search}%,focus_keyword.ilike.%${search}%`);
  if (req.query.sub_topic_id) q = q.eq('sub_topic_id', parseInt(req.query.sub_topic_id as string));
  if (req.query.language_id) q = q.eq('language_id', parseInt(req.query.language_id as string));
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
  const { data, error: e } = await supabase.from('sub_topic_translations').select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Sub-topic translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'sub_topic_translation', 'activate')) {
    return err(res, 'Permission denied: sub_topic_translation:activate required to create inactive', 403);
  }

  // Verify sub-topic exists (include parent hierarchy for structured data)
  const { data: subTopic } = await supabase.from('sub_topics').select('id, slug, topic_id, topics(slug, chapter_id, chapters(slug, subject_id))').eq('id', body.sub_topic_id).single();
  if (!subTopic) return err(res, 'Sub-topic not found', 404);

  // Verify language exists and for_material = true
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  // Set audit field
  body.created_by = req.user!.id;

  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const uploadedUrls: string[] = [];

  // Process main image (800x800)
  if (files?.image_file?.[0]) {
    const slug = (body.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/image/${slug}-${Date.now()}.webp`;
    body.image = await processAndUploadImage(files.image_file[0].buffer, path, { width: 800, height: 800, quality: 85 });
    uploadedUrls.push(body.image);
  }

  // Process OG image (1200x630 for Open Graph standard)
  if (files?.og_image_file?.[0]) {
    const slug = (body.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/og/${slug}-${Date.now()}.webp`;
    body.og_image = await processAndUploadImage(files.og_image_file[0].buffer, path, { width: 1200, height: 630, quality: 85 });
    uploadedUrls.push(body.og_image);
  }

  // Process Twitter image (1200x600 for Twitter card)
  if (files?.twitter_image_file?.[0]) {
    const slug = (body.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/twitter/${slug}-${Date.now()}.webp`;
    body.twitter_image = await processAndUploadImage(files.twitter_image_file[0].buffer, path, { width: 1200, height: 600, quality: 85 });
    uploadedUrls.push(body.twitter_image);
  }

  // Process video thumbnail (800x450)
  if (files?.video_thumbnail_file?.[0]) {
    const slug = (body.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/video-thumb/${slug}-${Date.now()}.webp`;
    body.video_thumbnail = await processAndUploadImage(files.video_thumbnail_file[0].buffer, path, { width: 800, height: 450, quality: 85 });
    uploadedUrls.push(body.video_thumbnail);
  }

  // Process page file (HTML upload)
  if (files?.page_file?.[0]) {
    const slug = (body.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/pages/${slug}-${Date.now()}.html`;
    body.page = await uploadRawFile(files.page_file[0].buffer, path);
    uploadedUrls.push(body.page);
  }

  // Auto-generate structured_data if empty/null
  if (!body.structured_data || (Array.isArray(body.structured_data) && body.structured_data.length === 0)) {
    const parentTopic = (subTopic as any).topics;
    body.structured_data = generateStructuredData({
      name: body.name,
      shortIntro: body.short_intro,
      subTopicSlug: subTopic.slug,
      topicSlug: parentTopic?.slug || 'topic',
      isoCode: lang.iso_code,
      image: body.image || null,
      canonicalUrl: body.canonical_url,
    });
  }

  const { data, error: e } = await supabase.from('sub_topic_translations').insert(body).select(FK_SELECT).single();
  if (e) {
    for (const url of uploadedUrls) { try { await deleteImage(extractBunnyPath(url), url); } catch {} }
    if (e.code === '23505') return err(res, 'Translation for this sub-topic and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.sub_topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_translation_created', targetType: 'sub_topic_translation', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (uploadedUrls.length) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'sub_topic_translation', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'sub_topic_translation_images', count: uploadedUrls.length } });
  return ok(res, data, 'Sub-topic translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_topic_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Sub-topic translation not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'sub_topic_translation', 'activate')) {
      return err(res, 'Permission denied: sub_topic_translation:activate required to change active status', 403);
    }
  }

  // Set audit field
  updates.updated_by = req.user!.id;

  // Track resolved FK data for structured data regeneration
  let resolvedSubTopicSlug: string | undefined;
  let resolvedTopicSlug: string | undefined;
  let resolvedLangIso: string | undefined;

  if (updates.sub_topic_id && updates.sub_topic_id !== old.sub_topic_id) {
    const { data: subTopic } = await supabase.from('sub_topics').select('id, slug, topics(slug, chapter_id, chapters(slug, subject_id))').eq('id', updates.sub_topic_id).single();
    if (!subTopic) return err(res, 'Sub-topic not found', 404);
    resolvedSubTopicSlug = subTopic.slug;
    const parentTopic = (subTopic as any).topics;
    resolvedTopicSlug = parentTopic?.slug;
  }

  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id, iso_code').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
    resolvedLangIso = lang.iso_code;
  }

  // Regenerate structured data if requested via query param
  if (req.query.regenerate_sd === 'true') {
    const subTopicId = updates.sub_topic_id || old.sub_topic_id;
    const langId = updates.language_id || old.language_id;
    if (!resolvedSubTopicSlug) {
      const { data: subTopic } = await supabase.from('sub_topics').select('slug, topics(slug, chapter_id, chapters(slug, subject_id))').eq('id', subTopicId).single();
      resolvedSubTopicSlug = subTopic?.slug;
      const parentTopic = (subTopic as any)?.topics;
      resolvedTopicSlug = parentTopic?.slug;
    }
    if (!resolvedLangIso) {
      const { data: lang } = await supabase.from('languages').select('iso_code').eq('id', langId).single();
      resolvedLangIso = lang?.iso_code;
    }
    updates.structured_data = generateStructuredData({
      name: updates.name || old.name,
      shortIntro: updates.short_intro !== undefined ? updates.short_intro : old.short_intro,
      subTopicSlug: resolvedSubTopicSlug || 'sub-topic',
      topicSlug: resolvedTopicSlug || 'topic',
      isoCode: resolvedLangIso || 'en',
      image: old.image || null,
      canonicalUrl: updates.canonical_url !== undefined ? updates.canonical_url : old.canonical_url,
    });
  }

  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  let mediaUploaded = false;

  // Process main image (800x800)
  if (files?.image_file?.[0]) {
    const slug = (updates.name || old.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/image/${slug}-${Date.now()}.webp`;
    updates.image = await processAndUploadImage(files.image_file[0].buffer, path, { width: 800, height: 800, quality: 85 });
    if (old.image) { try { await deleteImage(extractBunnyPath(old.image), old.image); } catch {} }
    mediaUploaded = true;
  }

  // Process OG image (1200x630)
  if (files?.og_image_file?.[0]) {
    const slug = (updates.name || old.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/og/${slug}-${Date.now()}.webp`;
    updates.og_image = await processAndUploadImage(files.og_image_file[0].buffer, path, { width: 1200, height: 630, quality: 85 });
    if (old.og_image) { try { await deleteImage(extractBunnyPath(old.og_image), old.og_image); } catch {} }
    mediaUploaded = true;
  }

  // Process Twitter image (1200x600)
  if (files?.twitter_image_file?.[0]) {
    const slug = (updates.name || old.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/twitter/${slug}-${Date.now()}.webp`;
    updates.twitter_image = await processAndUploadImage(files.twitter_image_file[0].buffer, path, { width: 1200, height: 600, quality: 85 });
    if (old.twitter_image) { try { await deleteImage(extractBunnyPath(old.twitter_image), old.twitter_image); } catch {} }
    mediaUploaded = true;
  }

  // Process video thumbnail (800x450)
  if (files?.video_thumbnail_file?.[0]) {
    const slug = (updates.name || old.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/video-thumb/${slug}-${Date.now()}.webp`;
    updates.video_thumbnail = await processAndUploadImage(files.video_thumbnail_file[0].buffer, path, { width: 800, height: 450, quality: 85 });
    if (old.video_thumbnail) { try { await deleteImage(extractBunnyPath(old.video_thumbnail), old.video_thumbnail); } catch {} }
    mediaUploaded = true;
  }

  // Process page file (HTML upload)
  if (files?.page_file?.[0]) {
    const slug = (updates.name || old.name || 'subtopic-trans').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `sub-topic-translations/pages/${slug}-${Date.now()}.html`;
    updates.page = await uploadRawFile(files.page_file[0].buffer, path);
    if (old.page) { try { await deleteImage(extractBunnyPath(old.page), old.page); } catch {} }
    mediaUploaded = true;
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('sub_topic_translations').update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this sub-topic and language already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  const imageFields = ['image', 'og_image', 'twitter_image', 'video_thumbnail', 'page'];
  for (const k of Object.keys(updates)) {
    if (imageFields.includes(k)) {
      changes[k] = { old: (old as any)[k] || null, new: updates[k] };
    } else if (k === 'updated_by') {
      // skip audit field
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.sub_topic_id);
  if (updates.sub_topic_id && updates.sub_topic_id !== old.sub_topic_id) await clearCache(updates.sub_topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_translation_updated', targetType: 'sub_topic_translation', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (mediaUploaded) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'sub_topic_translation', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'sub_topic_translation_images' } });

  return ok(res, data, 'Sub-topic translation updated');
}

// DELETE /sub-topic-translations/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_topic_translations').select('name, deleted_at, sub_topic_id').eq('id', id).single();
  if (!old) return err(res, 'Sub-topic translation not found', 404);
  if (old.deleted_at) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('sub_topic_translations')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.sub_topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_translation_soft_deleted', targetType: 'sub_topic_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Sub-topic translation moved to trash');
}

// PATCH /sub-topic-translations/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_topic_translations').select('name, deleted_at, sub_topic_id').eq('id', id).single();
  if (!old) return err(res, 'Sub-topic translation not found', 404);
  if (!old.deleted_at) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('sub_topic_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.sub_topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_translation_restored', targetType: 'sub_topic_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Sub-topic translation restored');
}

// GET /sub-topic-translations/coverage -- per-sub-topic language coverage stats
export async function coverage(req: Request, res: Response) {
  const { data: activeLangs, error: langErr } = await supabase
    .from('languages')
    .select('id, name, iso_code, native_name')
    .eq('is_active', true)
    .eq('for_material', true)
    .order('id');
  if (langErr) return err(res, langErr.message, 500);
  const totalLangs = activeLangs?.length || 0;

  const { data: subTopics, error: stErr } = await supabase
    .from('sub_topics')
    .select('id, slug, topic_id')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('slug');
  if (stErr) return err(res, stErr.message, 500);

  const { data: translations, error: transErr } = await supabase
    .from('sub_topic_translations')
    .select('sub_topic_id, language_id')
    .is('deleted_at', null);
  if (transErr) return err(res, transErr.message, 500);

  const transMap = new Map<number, Set<number>>();
  for (const t of (translations || [])) {
    if (!transMap.has(t.sub_topic_id)) transMap.set(t.sub_topic_id, new Set());
    transMap.get(t.sub_topic_id)!.add(t.language_id);
  }

  const result = (subTopics || []).map((st: any) => {
    const translatedLangIds = transMap.get(st.id) || new Set();
    const missingLangs = (activeLangs || []).filter(l => !translatedLangIds.has(l.id));
    const translatedLangs = (activeLangs || []).filter(l => translatedLangIds.has(l.id));
    return {
      sub_topic_id: st.id,
      sub_topic_slug: st.slug,
      topic_id: st.topic_id,
      total_languages: totalLangs,
      translated_count: translatedLangs.length,
      missing_count: missingLangs.length,
      is_complete: missingLangs.length === 0,
      translated_languages: translatedLangs.map(l => ({ id: l.id, name: l.name, iso_code: l.iso_code })),
      missing_languages: missingLangs.map(l => ({ id: l.id, name: l.name, iso_code: l.iso_code, native_name: l.native_name })),
    };
  });

  return ok(res, result, 'Coverage retrieved');
}

// DELETE /sub-topic-translations/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('sub_topic_translations').select('name, image, og_image, twitter_image, video_thumbnail, page, sub_topic_id').eq('id', id).single();
  if (!old) return err(res, 'Sub-topic translation not found', 404);

  // Clean up ALL CDN files (images + page HTML)
  for (const url of [old.image, old.og_image, old.twitter_image, old.video_thumbnail, old.page]) {
    if (url) { try { await deleteImage(extractBunnyPath(url), url); } catch {} }
  }

  const { error: e } = await supabase.from('sub_topic_translations').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.sub_topic_id);
  logAdmin({ actorId: req.user!.id, action: 'sub_topic_translation_deleted', targetType: 'sub_topic_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.image || old.og_image || old.twitter_image || old.video_thumbnail || old.page) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'sub_topic_translation', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Sub-topic translation permanently deleted');
}
