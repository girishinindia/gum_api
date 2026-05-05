import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { uploadToBunny, deleteFromBunny, purgeBunnyCdn } from '../../config/bunny';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { config } from '../../config';

const TABLE = 'assesment_exercise_translations';
const PARENT_TABLE = 'assesment_exercise';
const CACHE_KEY = 'assesment_exercise_translations:all';
const clearCache = async (exerciseId?: number) => {
  await redis.del(CACHE_KEY);
  if (exerciseId) await redis.del(`assesment_exercise_translations:exercise:${exerciseId}`);
};

function cdnPathFromUrl(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.assesment_exercise_id === 'string') body.assesment_exercise_id = parseInt(body.assesment_exercise_id) || 0;
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, ${PARENT_TABLE}!assessment_exercise_translations_assessment_exercise_id_fkey(slug, topic_id), languages(name, native_name, iso_code)`;

/**
 * Build the CDN path for an exercise translation file.
 * Format: materials/<subject-slug>/<chapter-slug>/<topic-slug>/topic_exercise/<lang-iso-code>/<topic-name>.html
 */
async function buildExerciseCdnPath(exerciseId: number, langIsoCode: string, suffix: string): Promise<string | null> {
  const { data: exercise, error: fkErr } = await supabase
    .from(PARENT_TABLE)
    .select('id, slug, topic_id, topics!assessment_exercises_sub_topic_id_fkey(slug, name, chapter_id, chapters(slug, subject_id, subjects(slug)))')
    .eq('id', exerciseId)
    .single();

  if (fkErr) {
    console.error('[buildExerciseCdnPath:trans] FK query error:', fkErr.message, fkErr.code);
    return null;
  }
  if (!exercise || !(exercise as any).topics) {
    console.error('[buildExerciseCdnPath:trans] No exercise or no topics join. exercise:', JSON.stringify(exercise));
    return null;
  }

  const topic = (exercise as any).topics as any;
  const chapter = topic?.chapters;
  const subject = chapter?.subjects;

  if (!subject?.slug || !chapter?.slug || !topic?.slug) {
    console.error('[buildExerciseCdnPath:trans] Missing slugs. topic:', topic?.slug, 'chapter:', chapter?.slug, 'subject:', subject?.slug);
    return null;
  }

  // Use the exercise slug as filename base (unique per exercise, prevents CDN path collisions)
  const exerciseName = exercise.slug;
  const filename = suffix === 'solution'
    ? `${exerciseName}_solution.html`
    : `${exerciseName}.html`;

  return `materials/${subject.slug}/${chapter.slug}/${topic.slug}/topic_exercise/${langIsoCode}/${filename}`;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  if (req.query.assesment_exercise_id) q = q.eq('assesment_exercise_id', parseInt(req.query.assesment_exercise_id as string));
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
  if (e || !data) return err(res, 'Assessment exercise translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // Verify exercise exists
  const { data: exercise } = await supabase.from(PARENT_TABLE).select('id, slug, topic_id').eq('id', body.assesment_exercise_id).single();
  if (!exercise) return err(res, 'Assessment exercise not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).single();
  if (!lang) return err(res, 'Language not found', 404);

  // Handle file upload
  if (files?.file?.[0]) {
    const cdnPath = await buildExerciseCdnPath(body.assesment_exercise_id, lang.iso_code, 'main');
    if (!cdnPath) return err(res, 'Could not resolve exercise CDN path (check topic hierarchy)', 400);
    try {
      const cdnUrl = await uploadToBunny(cdnPath, files.file[0].buffer);
      body.file_url = `${cdnUrl}?v=${Date.now()}`;
      purgeBunnyCdn(cdnUrl);
    } catch (uploadErr: any) {
      console.error('[createTranslation] Bunny upload failed for file:', cdnPath, uploadErr?.message);
      return err(res, `File upload failed: ${uploadErr?.message || 'Unknown error'}`, 500);
    }
  }

  // Handle file_solution upload
  if (files?.file_solution?.[0]) {
    const cdnPath = await buildExerciseCdnPath(body.assesment_exercise_id, lang.iso_code, 'solution');
    if (!cdnPath) return err(res, 'Could not resolve exercise CDN path (check topic hierarchy)', 400);
    try {
      const cdnUrl = await uploadToBunny(cdnPath, files.file_solution[0].buffer);
      body.file_solution_url = `${cdnUrl}?v=${Date.now()}`;
      purgeBunnyCdn(cdnUrl);
    } catch (uploadErr: any) {
      console.error('[createTranslation] Bunny upload failed for file_solution:', cdnPath, uploadErr?.message);
      return err(res, `Solution file upload failed: ${uploadErr?.message || 'Unknown error'}`, 500);
    }
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this exercise + language', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.assesment_exercise_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_translation_created', targetType: 'assessment_exercise_translation', targetId: data.id, targetName: `${exercise.slug}/${lang.iso_code}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment exercise translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Assessment exercise translation not found', 404);

  const updates = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // Resolve language iso_code for CDN path
  const { data: lang } = await supabase.from('languages').select('id, iso_code').eq('id', old.language_id).single();
  const isoCode = lang?.iso_code || 'en';

  const exerciseId = updates.assesment_exercise_id || old.assesment_exercise_id;

  // Handle file upload — delete old first
  if (files?.file?.[0]) {
    if (old.file_url) {
      try { await deleteFromBunny(cdnPathFromUrl(old.file_url)); } catch (_) {}
    }
    const cdnPath = await buildExerciseCdnPath(exerciseId, isoCode, 'main');
    if (!cdnPath) return err(res, 'Could not resolve exercise CDN path (check topic hierarchy)', 400);
    try {
      const cdnUrl = await uploadToBunny(cdnPath, files.file[0].buffer);
      updates.file_url = `${cdnUrl}?v=${Date.now()}`;
      purgeBunnyCdn(cdnUrl);
    } catch (uploadErr: any) {
      console.error('[updateTranslation] Bunny upload failed for file:', cdnPath, uploadErr?.message);
      return err(res, `File upload failed: ${uploadErr?.message || 'Unknown error'}`, 500);
    }
  }

  // Handle file_solution upload — delete old first
  if (files?.file_solution?.[0]) {
    if (old.file_solution_url) {
      try { await deleteFromBunny(cdnPathFromUrl(old.file_solution_url)); } catch (_) {}
    }
    const cdnPath = await buildExerciseCdnPath(exerciseId, isoCode, 'solution');
    if (!cdnPath) return err(res, 'Could not resolve exercise CDN path (check topic hierarchy)', 400);
    try {
      const cdnUrl = await uploadToBunny(cdnPath, files.file_solution[0].buffer);
      updates.file_solution_url = `${cdnUrl}?v=${Date.now()}`;
      purgeBunnyCdn(cdnUrl);
    } catch (uploadErr: any) {
      console.error('[updateTranslation] Bunny upload failed for file_solution:', cdnPath, uploadErr?.message);
      return err(res, `Solution file upload failed: ${uploadErr?.message || 'Unknown error'}`, 500);
    }
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).filter(k => k !== 'updated_by').length === 0 && !files?.file?.[0] && !files?.file_solution?.[0]) {
    return err(res, 'Nothing to update', 400);
  }

  const { data, error: e } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this exercise + language', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.assesment_exercise_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_translation_updated', targetType: 'assessment_exercise_translation', targetId: id, targetName: `exercise:${old.assesment_exercise_id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Assessment exercise translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('assesment_exercise_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment exercise translation not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.assesment_exercise_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_translation_soft_deleted', targetType: 'assessment_exercise_translation', targetId: id, targetName: `exercise:${old.assesment_exercise_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment exercise translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('assesment_exercise_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment exercise translation not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.assesment_exercise_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_translation_restored', targetType: 'assessment_exercise_translation', targetId: id, targetName: `exercise:${old.assesment_exercise_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment exercise translation restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('assesment_exercise_id, file_url, file_solution_url').eq('id', id).single();
  if (!old) return err(res, 'Assessment exercise translation not found', 404);

  // Delete CDN files on permanent delete
  if (old.file_url) {
    try { await deleteFromBunny(cdnPathFromUrl(old.file_url)); } catch (_) {}
  }
  if (old.file_solution_url) {
    try { await deleteFromBunny(cdnPathFromUrl(old.file_solution_url)); } catch (_) {}
  }

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.assesment_exercise_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_translation_deleted', targetType: 'assessment_exercise_translation', targetId: id, targetName: `exercise:${old.assesment_exercise_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Assessment exercise translation permanently deleted');
}

// Coverage endpoint: how many languages translated per exercise
export async function coverage(req: Request, res: Response) {
  const exerciseId = parseInt(req.query.assesment_exercise_id as string);
  if (!exerciseId) return err(res, 'assesment_exercise_id is required', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .select('id, language_id, name, languages(name, iso_code)')
    .eq('assesment_exercise_id', exerciseId)
    .is('deleted_at', null);
  if (e) return err(res, e.message, 500);

  return ok(res, data || []);
}
