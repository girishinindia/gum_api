import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { processAndUploadImage } from '../../services/storage.service';

const TABLE = 'webinar_translations';
const PARENT_TABLE = 'webinars';
const CACHE_KEY = 'webinar_translations:all';

const clearCache = async (webinarId?: number) => {
  await redis.del(CACHE_KEY);
  if (webinarId) await redis.del(`webinar_translations:webinar:${webinarId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.webinar_id === 'string') body.webinar_id = parseInt(body.webinar_id) || 0;
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id) || 0;
  // Parse JSONB fields
  for (const jf of ['tags', 'structured_data']) {
    if (typeof body[jf] === 'string') {
      try { body[jf] = JSON.parse(body[jf]); } catch { /* leave as-is */ }
    }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, languages!webinar_translations_language_id_fkey(id, name, iso_code)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.textSearch('search_vector', search, { type: 'plain', config: 'simple' });
  if (req.query.webinar_id) q = q.eq('webinar_id', parseInt(req.query.webinar_id as string));
  if (req.query.language_id) q = q.eq('language_id', parseInt(req.query.language_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

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
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Webinar translation not found', 404);
  return ok(res, data);
}

/**
 * GET /webinar-translations/coverage
 * Returns X/Y translation coverage for ALL active webinars (or a specific one via ?webinar_id=X).
 */
export async function coverage(req: Request, res: Response) {
  // Get all active languages that are for_material
  const { data: activeLangs, error: langErr } = await supabase
    .from('languages')
    .select('id, name, iso_code, native_name')
    .eq('is_active', true)
    .eq('for_material', true)
    .order('id');
  if (langErr) return err(res, langErr.message, 500);
  const totalLangs = activeLangs?.length || 0;

  // Get all non-deleted webinars (or a specific one)
  let webinarQ = supabase
    .from(PARENT_TABLE)
    .select('id, title, code')
    .is('deleted_at', null)
    .order('id');
  const webinarId = req.query.webinar_id ? parseInt(req.query.webinar_id as string) : undefined;
  if (webinarId) webinarQ = webinarQ.eq('id', webinarId);

  const { data: webinars, error: webinarErr } = await webinarQ;
  if (webinarErr) return err(res, webinarErr.message, 500);

  // Get all non-deleted translations
  let transQ = supabase
    .from(TABLE)
    .select('webinar_id, language_id')
    .is('deleted_at', null);
  if (webinarId) transQ = transQ.eq('webinar_id', webinarId);

  const { data: translations, error: transErr } = await transQ;
  if (transErr) return err(res, transErr.message, 500);

  // Build translation map: webinar_id → Set of language_ids
  const transMap = new Map<number, Set<number>>();
  for (const t of (translations || [])) {
    if (!transMap.has(t.webinar_id)) transMap.set(t.webinar_id, new Set());
    transMap.get(t.webinar_id)!.add(t.language_id);
  }

  const result = (webinars || []).map(webinar => {
    const translatedLangIds = transMap.get(webinar.id) || new Set();
    const missingLangs = (activeLangs || []).filter(l => !translatedLangIds.has(l.id));
    const translatedLangs = (activeLangs || []).filter(l => translatedLangIds.has(l.id));
    return {
      webinar_id: webinar.id,
      webinar_title: webinar.title,
      webinar_code: webinar.code,
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

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  const files = (req as any).files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // Verify parent exists
  const { data: webinar } = await supabase.from(PARENT_TABLE).select('id, title, slug').eq('id', body.webinar_id).single();
  if (!webinar) return err(res, 'Webinar not found', 404);

  // Verify language is for_material
  const { data: lang } = await supabase
    .from('languages')
    .select('id, name, iso_code')
    .eq('id', body.language_id)
    .eq('for_material', true)
    .single();
  if (!lang) return err(res, 'Language not found or not enabled for material', 404);

  // Check uniqueness
  const { data: dup } = await supabase
    .from(TABLE)
    .select('id')
    .eq('webinar_id', body.webinar_id)
    .eq('language_id', body.language_id)
    .is('deleted_at', null)
    .single();
  if (dup) return err(res, 'Translation already exists for this language', 409);

  const slug = webinar.slug || webinar.title?.toLowerCase().replace(/\s+/g, '-') || 'webinar';

  // Handle thumbnail upload
  if (files?.thumbnail?.[0]) {
    const thumbPath = `thumbnails/webinars/${slug}-${lang.iso_code}-${Date.now()}.webp`;
    body.thumbnail = await processAndUploadImage(files.thumbnail[0].buffer, thumbPath, { width: 640, height: 360, quality: 85 });
  }

  // Handle OG image upload
  if (files?.og_image?.[0]) {
    const ogPath = `og/webinars/${slug}-${lang.iso_code}-${Date.now()}.webp`;
    body.og_image = await processAndUploadImage(files.og_image[0].buffer, ogPath, { width: 1200, height: 630, quality: 85 });
  }

  // Handle Twitter image upload
  if (files?.twitter_image?.[0]) {
    const twPath = `twitter/webinars/${slug}-${lang.iso_code}-${Date.now()}.webp`;
    body.twitter_image = await processAndUploadImage(files.twitter_image[0].buffer, twPath, { width: 1200, height: 628, quality: 85 });
  }

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Sync title to parent if English (language_id=7)
  if (body.language_id === 7 && body.title) {
    await supabase.from(PARENT_TABLE).update({ title: body.title }).eq('id', body.webinar_id);
  }

  await clearCache(body.webinar_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_translation_created', targetType: 'webinar_translation', targetId: data.id, targetName: `${webinar.title} [${lang.iso_code}]`, ip: getClientIp(req) });
  return ok(res, data, 'Webinar translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Webinar translation not found', 404);

  const updates = parseBody(req);
  const files = (req as any).files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  const { data: webinar } = await supabase.from(PARENT_TABLE).select('slug, title').eq('id', old.webinar_id).single();
  const { data: lang } = await supabase.from('languages').select('iso_code').eq('id', old.language_id).single();
  const slug = webinar?.slug || webinar?.title?.toLowerCase().replace(/\s+/g, '-') || 'webinar';

  // Handle thumbnail upload
  if (files?.thumbnail?.[0]) {
    const thumbPath = `thumbnails/webinars/${slug}-${lang?.iso_code || 'xx'}-${Date.now()}.webp`;
    updates.thumbnail = await processAndUploadImage(files.thumbnail[0].buffer, thumbPath, { width: 640, height: 360, quality: 85 });
  }

  // Handle OG image upload
  if (files?.og_image?.[0]) {
    const ogPath = `og/webinars/${slug}-${lang?.iso_code || 'xx'}-${Date.now()}.webp`;
    updates.og_image = await processAndUploadImage(files.og_image[0].buffer, ogPath, { width: 1200, height: 630, quality: 85 });
  }

  // Handle Twitter image upload
  if (files?.twitter_image?.[0]) {
    const twPath = `twitter/webinars/${slug}-${lang?.iso_code || 'xx'}-${Date.now()}.webp`;
    updates.twitter_image = await processAndUploadImage(files.twitter_image[0].buffer, twPath, { width: 1200, height: 628, quality: 85 });
  }

  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Sync title to parent if English
  if (old.language_id === 7 && updates.title) {
    await supabase.from(PARENT_TABLE).update({ title: updates.title }).eq('id', old.webinar_id);
  }

  await clearCache(old.webinar_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_translation_updated', targetType: 'webinar_translation', targetId: id, targetName: `translation:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Webinar translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('webinar_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Webinar translation not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.webinar_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_translation_soft_deleted', targetType: 'webinar_translation', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('webinar_id, title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Webinar translation not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  // Block restore if parent webinar is still deleted
  const { data: parentWebinar } = await supabase.from(PARENT_TABLE).select('deleted_at').eq('id', old.webinar_id).single();
  if (parentWebinar?.deleted_at) return err(res, 'Cannot restore translation — parent webinar is still in trash. Restore it first.', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.webinar_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_translation_restored', targetType: 'webinar_translation', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Webinar translation restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('webinar_id, title').eq('id', id).single();
  if (!old) return err(res, 'Webinar translation not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.webinar_id);
  logAdmin({ actorId: req.user!.id, action: 'webinar_translation_deleted', targetType: 'webinar_translation', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, null, 'Webinar translation permanently deleted');
}
