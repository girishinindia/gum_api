import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { uploadToBunny, deleteFromBunny } from '../../config/bunny';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { config } from '../../config';

const TABLE = 'assesment_mini_projects_translations';
const PARENT_TABLE = 'assesment_mini_projects';
const CACHE_KEY = 'assesment_mini_projects_translations:all';

const clearCache = async (miniProjectId?: number) => {
  await redis.del(CACHE_KEY);
  if (miniProjectId) await redis.del(`assesment_mini_projects_translations:project:${miniProjectId}`);
};

function cdnPathFromUrl(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.mini_project_id === 'string') body.mini_project_id = parseInt(body.mini_project_id) || 0;
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, ${PARENT_TABLE}!assesment_mini_projects_translations_mini_project_id_fkey(slug, chapter_id), languages(name, native_name, iso_code)`;

/**
 * Build CDN path for mini project translation HTML.
 * Format: materials/<subject-slug>/<chapter-slug>/chapter_mini_project/<lang-iso>/<chapter-slug>.html
 */
async function buildTranslationCdnPath(miniProjectId: number, langIsoCode: string): Promise<string | null> {
  const { data: project } = await supabase
    .from(PARENT_TABLE)
    .select('id, slug, chapter_id, chapters(slug, subject_id, subjects(slug))')
    .eq('id', miniProjectId)
    .single();
  if (!project || !(project as any).chapters) return null;

  const chapter = (project as any).chapters as any;
  const subject = chapter?.subjects;
  if (!subject?.slug || !chapter?.slug) return null;

  return `materials/${subject.slug}/${chapter.slug}/chapter_mini_project/${langIsoCode}/${chapter.slug}.html`;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  if (req.query.mini_project_id) q = q.eq('mini_project_id', parseInt(req.query.mini_project_id as string));
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
  if (e || !data) return err(res, 'Mini project translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // Verify parent exists
  const { data: project } = await supabase.from(PARENT_TABLE).select('id, slug, chapter_id').eq('id', body.mini_project_id).single();
  if (!project) return err(res, 'Mini project not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).single();
  if (!lang) return err(res, 'Language not found', 404);

  // Handle file upload
  if (files?.file?.[0]) {
    const cdnPath = await buildTranslationCdnPath(body.mini_project_id, lang.iso_code);
    if (!cdnPath) return err(res, 'Could not resolve CDN path (check chapter hierarchy)', 400);
    const cdnUrl = await uploadToBunny(cdnPath, files.file[0].buffer);
    body.file_url = cdnUrl;
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this mini project + language', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_translation_created', targetType: 'mini_project_translation', targetId: data.id, targetName: `${project.slug}/${lang.iso_code}`, ip: getClientIp(req) });
  return ok(res, data, 'Mini project translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Mini project translation not found', 404);

  const updates = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // Resolve language iso_code for CDN path
  const { data: lang } = await supabase.from('languages').select('id, iso_code').eq('id', old.language_id).single();
  const isoCode = lang?.iso_code || 'en';

  const miniProjectId = updates.mini_project_id || old.mini_project_id;

  // Handle file upload — delete old first
  if (files?.file?.[0]) {
    if (old.file_url) {
      try { await deleteFromBunny(cdnPathFromUrl(old.file_url)); } catch (_) {}
    }
    const cdnPath = await buildTranslationCdnPath(miniProjectId, isoCode);
    if (!cdnPath) return err(res, 'Could not resolve CDN path (check chapter hierarchy)', 400);
    const cdnUrl = await uploadToBunny(cdnPath, files.file[0].buffer);
    updates.file_url = cdnUrl;
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).filter(k => k !== 'updated_by').length === 0 && !files?.file?.[0]) {
    return err(res, 'Nothing to update', 400);
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this mini project + language', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_translation_updated', targetType: 'mini_project_translation', targetId: id, targetName: `project:${old.mini_project_id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Mini project translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('mini_project_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Mini project translation not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_translation_soft_deleted', targetType: 'mini_project_translation', targetId: id, targetName: `project:${old.mini_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Mini project translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('mini_project_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Mini project translation not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_translation_restored', targetType: 'mini_project_translation', targetId: id, targetName: `project:${old.mini_project_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Mini project translation restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('mini_project_id, file_url').eq('id', id).single();
  if (!old) return err(res, 'Mini project translation not found', 404);

  // Delete CDN file on permanent delete
  if (old.file_url) {
    try { await deleteFromBunny(cdnPathFromUrl(old.file_url)); } catch (_) {}
  }

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.mini_project_id);
  logAdmin({ actorId: req.user!.id, action: 'mini_project_translation_deleted', targetType: 'mini_project_translation', targetId: id, targetName: `project:${old.mini_project_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Mini project translation permanently deleted');
}

// Coverage endpoint
export async function coverage(req: Request, res: Response) {
  const miniProjectId = parseInt(req.query.mini_project_id as string);
  if (!miniProjectId) return err(res, 'mini_project_id is required', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .select('id, language_id, name, languages(name, iso_code)')
    .eq('mini_project_id', miniProjectId)
    .is('deleted_at', null);
  if (e) return err(res, e.message, 500);

  return ok(res, data || []);
}
