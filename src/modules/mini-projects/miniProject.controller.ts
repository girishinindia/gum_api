import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { uploadToBunny, deleteFromBunny } from '../../config/bunny';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { config } from '../../config';

const TABLE = 'assesment_mini_projects';
const TRANS_TABLE = 'assesment_mini_projects_translations';
const SOLUTION_TABLE = 'assesment_mini_projects_solution';
const CACHE_KEY = 'assesment_mini_projects:all';

const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

const FK_SELECT = `*, chapters!assesment_mini_projects_chapter_id_fkey(name, slug, subject_id, subjects(name, slug)), ${TRANS_TABLE}(id, language_id, name)`;

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.chapter_id === 'string') {
    body.chapter_id = body.chapter_id === '' || body.chapter_id === 'null' ? null : parseInt(body.chapter_id) || null;
  }
  if (typeof body.points === 'string') body.points = parseInt(body.points) || 0;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

function cdnPathFromUrl(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

/**
 * Build CDN path for mini project solution ZIP.
 * Format: materials/<subject-slug>/<chapter-slug>/chapter_mini_project/solutions/<chapter-slug>_solution.zip
 */
async function buildSolutionCdnPath(chapterId: number): Promise<string | null> {
  const { data: chapter } = await supabase
    .from('chapters')
    .select('slug, subject_id, subjects(slug)')
    .eq('id', chapterId)
    .single();
  if (!chapter || !(chapter as any).subjects) return null;
  const subject = (chapter as any).subjects as any;
  if (!subject?.slug || !chapter?.slug) return null;
  return `materials/${subject.slug}/${chapter.slug}/chapter_mini_project/solutions/${chapter.slug}_solution.zip`;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.ilike('slug', `%${search}%`);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  if (req.query.chapter_id) q = q.eq('chapter_id', parseInt(req.query.chapter_id as string));
  if (req.query.difficulty_level) q = q.eq('difficulty_level', req.query.difficulty_level as string);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  const enriched = (data || []).map((row: any) => {
    const translations = row[TRANS_TABLE] || [];
    const enTrans = translations.find((t: any) => t.language_id === 7);
    return {
      ...row,
      title: enTrans?.name || row.slug || '(untitled)',
      total_languages: translations.length,
    };
  });

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase
    .from(TABLE)
    .select(FK_SELECT)
    .eq('id', req.params.id)
    .single();
  if (e || !data) return err(res, 'Mini project not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  const slugSource = body.name || body.slug_source || 'mini-project';
  body.slug = await generateUniqueSlug(supabase, TABLE, slugSource, undefined, { column: 'chapter_id', value: body.chapter_id });
  delete body.name;
  delete body.slug_source;

  // Handle solution ZIP upload
  if (files?.file_solution?.[0] && body.chapter_id) {
    const cdnPath = await buildSolutionCdnPath(body.chapter_id);
    if (cdnPath) {
      const cdnUrl = await uploadToBunny(cdnPath, files.file_solution[0].buffer);
      body.file_solution_url = cdnUrl;
    }
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Mini project slug already exists for this chapter', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'mini_project_created', targetType: 'mini_project', targetId: data.id, targetName: data.slug, ip: getClientIp(req) });
  return ok(res, data, 'Mini project created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Mini project not found', 404);

  const updates = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  if (updates.name) {
    updates.slug = await generateUniqueSlug(supabase, TABLE, updates.name, id, { column: 'chapter_id', value: updates.chapter_id || old.chapter_id });
    delete updates.name;
  }

  // Handle solution ZIP upload
  if (files?.file_solution?.[0]) {
    if (old.file_solution_url) {
      try { await deleteFromBunny(cdnPathFromUrl(old.file_solution_url)); } catch (_) {}
    }
    const chapterId = updates.chapter_id || old.chapter_id;
    const cdnPath = await buildSolutionCdnPath(chapterId);
    if (cdnPath) {
      const cdnUrl = await uploadToBunny(cdnPath, files.file_solution[0].buffer);
      updates.file_solution_url = cdnUrl;
    }
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).filter(k => k !== 'updated_by').length === 0 && !files?.file_solution?.[0]) {
    return err(res, 'Nothing to update', 400);
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Mini project slug already exists for this chapter', 409);
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
  logAdmin({ actorId: req.user!.id, action: 'mini_project_updated', targetType: 'mini_project', targetId: id, targetName: data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'Mini project updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Mini project not found', 404);
  if (old.deleted_at) return err(res, 'Mini project is already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete translations and solutions
  await supabase.from(TRANS_TABLE).update({ deleted_at: now, is_active: false }).eq('mini_project_id', id).is('deleted_at', null);
  await supabase.from(SOLUTION_TABLE).update({ deleted_at: now, is_active: false }).eq('mini_project_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'mini_project_soft_deleted', targetType: 'mini_project', targetId: id, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Mini project moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Mini project not found', 404);
  if (!old.deleted_at) return err(res, 'Mini project is not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade restore
  await supabase.from(TRANS_TABLE).update({ deleted_at: null, is_active: true }).eq('mini_project_id', id).not('deleted_at', 'is', null);
  await supabase.from(SOLUTION_TABLE).update({ deleted_at: null, is_active: true }).eq('mini_project_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'mini_project_restored', targetType: 'mini_project', targetId: id, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Mini project restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('slug, file_solution_url').eq('id', id).single();
  if (!old) return err(res, 'Mini project not found', 404);

  // Delete CDN files from translations
  const { data: translations } = await supabase.from(TRANS_TABLE).select('id, file_url').eq('mini_project_id', id);
  if (translations) {
    for (const t of translations) {
      if (t.file_url) {
        try { await deleteFromBunny(cdnPathFromUrl(t.file_url)); } catch (_) {}
      }
    }
  }

  // Delete solution ZIP from CDN
  if (old.file_solution_url) {
    try { await deleteFromBunny(cdnPathFromUrl(old.file_solution_url)); } catch (_) {}
  }

  // Delete children then parent
  await supabase.from(SOLUTION_TABLE).delete().eq('mini_project_id', id);
  await supabase.from(TRANS_TABLE).delete().eq('mini_project_id', id);
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'mini_project_deleted', targetType: 'mini_project', targetId: id, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, null, 'Mini project permanently deleted');
}

/* ─── Full endpoints (mini project + English translation) ─── */

const FULL_FK_SELECT = `*, chapters!assesment_mini_projects_chapter_id_fkey(name, slug, subject_id, subjects(name, slug)), ${TRANS_TABLE}(*, languages(id, name, iso_code, native_name)), ${SOLUTION_TABLE}(*)`;

export async function getFullById(req: Request, res: Response) {
  const id = parseInt(req.params.id);

  const { data: project, error: e } = await supabase
    .from(TABLE)
    .select(FULL_FK_SELECT)
    .eq('id', id)
    .single();
  if (e || !project) return err(res, 'Mini project not found', 404);

  const { data: allLanguages } = await supabase
    .from('languages')
    .select('id, name, iso_code')
    .eq('is_active', true)
    .eq('for_material', true)
    .order('name');

  const existingLangIds = new Set(
    ((project as any)[TRANS_TABLE] || []).map((t: any) => t.language_id)
  );

  const translation_coverage = (allLanguages || []).map((lang: any) => ({
    language_id: lang.id,
    language_name: lang.name,
    language_code: lang.iso_code,
    has_translation: existingLangIds.has(lang.id),
  }));

  return ok(res, { ...project, translation_coverage });
}

export async function createFull(req: Request, res: Response) {
  const body = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  const projectData: any = {
    chapter_id: body.chapter_id,
    points: body.points,
    difficulty_level: body.difficulty_level,
    display_order: body.display_order,
    is_active: body.is_active,
  };

  const slugSource = body.name || body.title || 'mini-project';
  projectData.slug = await generateUniqueSlug(supabase, TABLE, slugSource, undefined, { column: 'chapter_id', value: body.chapter_id });

  // Handle solution ZIP upload
  if (files?.file_solution?.[0] && body.chapter_id) {
    const cdnPath = await buildSolutionCdnPath(body.chapter_id);
    if (cdnPath) {
      const cdnUrl = await uploadToBunny(cdnPath, files.file_solution[0].buffer);
      projectData.file_solution_url = cdnUrl;
    }
  }

  const { data: project, error: exErr } = await supabase
    .from(TABLE)
    .insert(projectData)
    .select(FK_SELECT)
    .single();
  if (exErr) {
    if (exErr.code === '23505') return err(res, 'Mini project slug already exists for this chapter', 409);
    return err(res, exErr.message, 500);
  }

  // Build English translation
  const translationData: any = {
    mini_project_id: project.id,
    language_id: 7,
    name: body.name || body.title || project.slug,
    description: body.description || null,
    is_active: true,
  };

  // Handle HTML file upload for English translation
  if (files?.file?.[0] && body.chapter_id) {
    const cdnPath = await buildTranslationCdnPath(body.chapter_id, 'en');
    if (cdnPath) {
      const cdnUrl = await uploadToBunny(cdnPath, files.file[0].buffer);
      translationData.file_url = cdnUrl;
    }
  }

  const { data: translation, error: trErr } = await supabase
    .from(TRANS_TABLE)
    .insert(translationData)
    .select('*, languages(id, name, iso_code, native_name)')
    .single();
  if (trErr) return err(res, trErr.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'mini_project_created_full', targetType: 'mini_project', targetId: project.id, targetName: project.slug, ip: getClientIp(req) });
  return ok(res, { ...project, [TRANS_TABLE]: [translation] }, 'Mini project created with English translation', 201);
}

export async function updateFull(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const body = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Mini project not found', 404);

  const projectUpdates: any = {};
  if (body.points !== undefined) projectUpdates.points = body.points;
  if (body.difficulty_level !== undefined) projectUpdates.difficulty_level = body.difficulty_level;
  if (body.display_order !== undefined) projectUpdates.display_order = body.display_order;
  if (body.is_active !== undefined) projectUpdates.is_active = body.is_active;

  if (body.name) {
    projectUpdates.slug = await generateUniqueSlug(supabase, TABLE, body.name, id, { column: 'chapter_id', value: body.chapter_id || old.chapter_id });
  }

  // Handle solution ZIP upload
  if (files?.file_solution?.[0]) {
    if (old.file_solution_url) {
      try { await deleteFromBunny(cdnPathFromUrl(old.file_solution_url)); } catch (_) {}
    }
    const chapterId = body.chapter_id || old.chapter_id;
    const cdnPath = await buildSolutionCdnPath(chapterId);
    if (cdnPath) {
      const cdnUrl = await uploadToBunny(cdnPath, files.file_solution[0].buffer);
      projectUpdates.file_solution_url = cdnUrl;
    }
  }

  projectUpdates.updated_by = req.user!.id;

  const { data: project, error: exErr } = await supabase
    .from(TABLE)
    .update(projectUpdates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (exErr) {
    if (exErr.code === '23505') return err(res, 'Mini project slug already exists for this chapter', 409);
    return err(res, exErr.message, 500);
  }

  // Find or create English translation
  const { data: existingTrans } = await supabase
    .from(TRANS_TABLE)
    .select('*')
    .eq('mini_project_id', id)
    .eq('language_id', 7)
    .single();

  const translationUpdates: any = { updated_by: req.user!.id };
  if (body.name) translationUpdates.name = body.name;
  if (body.description !== undefined) translationUpdates.description = body.description;

  // Handle HTML file upload
  if (files?.file?.[0]) {
    if (existingTrans?.file_url) {
      try { await deleteFromBunny(cdnPathFromUrl(existingTrans.file_url)); } catch (_) {}
    }
    const chapterId = body.chapter_id || old.chapter_id;
    const cdnPath = await buildTranslationCdnPath(chapterId, 'en');
    if (cdnPath) {
      const cdnUrl = await uploadToBunny(cdnPath, files.file[0].buffer);
      translationUpdates.file_url = cdnUrl;
    }
  }

  let translation;
  if (existingTrans) {
    const { data: t } = await supabase
      .from(TRANS_TABLE)
      .update(translationUpdates)
      .eq('id', existingTrans.id)
      .select('*, languages(id, name, iso_code, native_name)')
      .single();
    translation = t;
  } else {
    const { data: t } = await supabase
      .from(TRANS_TABLE)
      .insert({ mini_project_id: id, language_id: 7, name: body.name || old.slug, ...translationUpdates })
      .select('*, languages(id, name, iso_code, native_name)')
      .single();
    translation = t;
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'mini_project_updated_full', targetType: 'mini_project', targetId: id, targetName: project.slug, ip: getClientIp(req) });
  return ok(res, { ...project, [TRANS_TABLE]: translation ? [translation] : [] }, 'Mini project updated');
}

/* ─── Helper: CDN path for translation HTML ─── */

/**
 * Build CDN path for mini project translation HTML.
 * Format: materials/<subject-slug>/<chapter-slug>/chapter_mini_project/<lang-iso>/<chapter-slug>.html
 */
async function buildTranslationCdnPath(chapterId: number, langIsoCode: string): Promise<string | null> {
  const { data: chapter } = await supabase
    .from('chapters')
    .select('slug, subject_id, subjects(slug)')
    .eq('id', chapterId)
    .single();
  if (!chapter || !(chapter as any).subjects) return null;
  const subject = (chapter as any).subjects as any;
  if (!subject?.slug || !chapter?.slug) return null;
  return `materials/${subject.slug}/${chapter.slug}/chapter_mini_project/${langIsoCode}/${chapter.slug}.html`;
}
