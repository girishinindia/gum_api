import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { deleteFromBunny, uploadToBunny } from '../../config/bunny';
import { config } from '../../config';

const TABLE = 'assesment_exercise';
const TRANS_TABLE = 'assesment_exercise_translations';
const CACHE_KEY = 'assesment_exercise:all';
const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

const FK_SELECT = `*, topics!assessment_exercises_sub_topic_id_fkey(name, slug, chapter_id, chapters(name, slug, subject_id, subjects(name, slug))), ${TRANS_TABLE}(id, language_id, name)`;

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.topic_id === 'string') {
    body.topic_id = body.topic_id === '' || body.topic_id === 'null' ? null : parseInt(body.topic_id) || null;
  }
  if (typeof body.points === 'string') body.points = parseFloat(body.points) || 0;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  // difficulty_level stays as string
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  // Search by translation name
  if (search) q = q.ilike('slug', `%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true' || req.query.status === 'deleted') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.topic_id) q = q.eq('topic_id', parseInt(req.query.topic_id as string));
  if (req.query.difficulty_level) q = q.eq('difficulty_level', req.query.difficulty_level as string);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Enrich with total_languages and English name as title
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
  if (e || !data) return err(res, 'Assessment exercise not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  // Auto-generate slug from a name (use body.name if provided, else 'exercise')
  const slugSource = body.name || body.slug_source || 'exercise';
  body.slug = await generateUniqueSlug(supabase, TABLE, slugSource, undefined, { column: 'topic_id', value: body.topic_id });
  delete body.name;
  delete body.slug_source;

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Assessment exercise slug already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_created', targetType: 'assessment_exercise', targetId: data.id, targetName: data.slug, ip: getClientIp(req) });
  return ok(res, data, 'Assessment exercise created', 201);
}

export async function update(req: Request, res: Response) {
  const id = req.params.id as string;
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Assessment exercise not found', 404);

  const updates = parseMultipartBody(req);

  // Re-generate slug if name provided
  if (updates.name) {
    updates.slug = await generateUniqueSlug(supabase, TABLE, updates.name, id, { column: 'topic_id', value: updates.topic_id || old.topic_id });
    delete updates.name;
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Assessment exercise slug already exists', 409);
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
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_updated', targetType: 'assessment_exercise', targetId: Number(id) || null, targetName: data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'Assessment exercise updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = req.params.id as string;
  const { data: old } = await supabase.from(TABLE).select('slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment exercise not found', 404);
  if (old.deleted_at) return err(res, 'Assessment exercise is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to translations
  await supabase.from(TRANS_TABLE).update({ deleted_at: now, is_active: false }).eq('assesment_exercise_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_soft_deleted', targetType: 'assessment_exercise', targetId: Number(id) || null, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Assessment exercise moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = req.params.id as string;
  const { data: old } = await supabase.from(TABLE).select('slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment exercise not found', 404);
  if (!old.deleted_at) return err(res, 'Assessment exercise is not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade restore translations
  await supabase.from(TRANS_TABLE).update({ deleted_at: null, is_active: true }).eq('assesment_exercise_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_restored', targetType: 'assessment_exercise', targetId: Number(id) || null, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Assessment exercise restored');
}

export async function remove(req: Request, res: Response) {
  const id = req.params.id as string;
  const { data: old } = await supabase.from(TABLE).select('slug').eq('id', id).single();
  if (!old) return err(res, 'Assessment exercise not found', 404);

  // Get translations to delete CDN files
  const { data: translations } = await supabase
    .from(TRANS_TABLE)
    .select('id, file_url, file_solution_url')
    .eq('assesment_exercise_id', id);

  if (translations && translations.length > 0) {
    for (const t of translations) {
      if (t.file_url) {
        try {
          const oldPath = new URL(t.file_url).pathname.replace(/^\//, '');
          await deleteFromBunny(oldPath);
        } catch { /* best effort */ }
      }
      if (t.file_solution_url) {
        try {
          const oldPath = new URL(t.file_solution_url).pathname.replace(/^\//, '');
          await deleteFromBunny(oldPath);
        } catch { /* best effort */ }
      }
    }
  }

  // Delete translations first, then the exercise
  await supabase.from(TRANS_TABLE).delete().eq('assesment_exercise_id', id);
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_deleted', targetType: 'assessment_exercise', targetId: Number(id) || null, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, null, 'Assessment exercise permanently deleted');
}

/* ─── CDN helpers ─── */

/**
 * Build CDN path for exercise files.
 * NEW format: materials/<subject-slug>/<chapter-slug>/<topic-slug>/topic_exercise/<lang-iso>/<topic-name>.html
 * Solution:  materials/<subject-slug>/<chapter-slug>/<topic-slug>/topic_exercise/<lang-iso>/<topic-name>_solution.html
 */
async function buildExerciseCdnPath(exerciseId: number | string, langIsoCode: string, suffix: string): Promise<string | null> {
  const { data: exercise } = await supabase
    .from(TABLE)
    .select('id, slug, topic_id, topics!assessment_exercises_sub_topic_id_fkey(slug, name, chapter_id, chapters(slug, subject_id, subjects(slug)))')
    .eq('id', exerciseId)
    .single();
  if (!exercise || !(exercise as any).topics) return null;
  const topic = (exercise as any).topics as any;
  const chapter = topic?.chapters;
  const subject = chapter?.subjects;
  if (!subject?.slug || !chapter?.slug || !topic?.slug) return null;

  // Use the topic name (sanitized) as filename base
  const topicName = topic.slug || topic.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') || exercise.slug;
  const filename = suffix === 'solution'
    ? `${topicName}_solution.html`
    : `${topicName}.html`;

  return `materials/${subject.slug}/${chapter.slug}/${topic.slug}/topic_exercise/${langIsoCode}/${filename}`;
}

function cdnPathFromUrl(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

/* ─── Full endpoints (exercise + English translation) ─── */

const FULL_FK_SELECT = `*, topics!assessment_exercises_sub_topic_id_fkey(name, slug, chapter_id, chapters(name, slug, subject_id, subjects(name, slug))), ${TRANS_TABLE}(*, languages(id, name, iso_code, native_name))`;

export async function getFullById(req: Request, res: Response) {
  const id = req.params.id as string;

  const { data: exercise, error: e } = await supabase
    .from(TABLE)
    .select(FULL_FK_SELECT)
    .eq('id', id)
    .single();
  if (e || !exercise) return err(res, 'Assessment exercise not found', 404);

  // Build translation coverage
  const { data: allLanguages } = await supabase
    .from('languages')
    .select('id, name, iso_code')
    .eq('is_active', true)
    .eq('for_material', true)
    .order('name');

  const existingLangIds = new Set(
    ((exercise as any)[TRANS_TABLE] || []).map((t: any) => t.language_id)
  );

  const translation_coverage = (allLanguages || []).map((lang: any) => ({
    language_id: lang.id,
    language_name: lang.name,
    language_code: lang.iso_code,
    has_translation: existingLangIds.has(lang.id),
  }));

  return ok(res, { ...exercise, translation_coverage });
}

export async function createFull(req: Request, res: Response) {
  const body = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // Extract exercise fields (no title on parent)
  const exerciseData: any = {
    topic_id: body.topic_id,
    points: body.points,
    difficulty_level: body.difficulty_level,
    display_order: body.display_order,
    is_active: body.is_active,
  };

  // Auto-generate slug from the English name
  const slugSource = body.name || body.title || 'exercise';
  exerciseData.slug = await generateUniqueSlug(supabase, TABLE, slugSource, undefined, { column: 'topic_id', value: body.topic_id });

  // Insert exercise
  const { data: exercise, error: exErr } = await supabase
    .from(TABLE)
    .insert(exerciseData)
    .select(FK_SELECT)
    .single();
  if (exErr) {
    if (exErr.code === '23505') return err(res, 'Assessment exercise slug already exists', 409);
    return err(res, exErr.message, 500);
  }

  // Build English translation
  const translationData: any = {
    assesment_exercise_id: exercise.id,
    language_id: 7, // English
    name: body.name || body.title || exercise.slug,
    description: body.description || null,
    is_active: true,
  };

  // Handle file uploads
  if (files?.file?.[0]) {
    const cdnPath = await buildExerciseCdnPath(exercise.id, 'en', 'main');
    if (!cdnPath) return err(res, 'Could not resolve exercise CDN path (check topic hierarchy)', 400);
    const cdnUrl = await uploadToBunny(cdnPath, files.file[0].buffer);
    translationData.file_url = cdnUrl;
  }

  if (files?.file_solution?.[0]) {
    const cdnPath = await buildExerciseCdnPath(exercise.id, 'en', 'solution');
    if (!cdnPath) return err(res, 'Could not resolve exercise CDN path (check topic hierarchy)', 400);
    const cdnUrl = await uploadToBunny(cdnPath, files.file_solution[0].buffer);
    translationData.file_solution_url = cdnUrl;
  }

  // Insert English translation
  const { data: translation, error: trErr } = await supabase
    .from(TRANS_TABLE)
    .insert(translationData)
    .select('*, languages(id, name, iso_code, native_name)')
    .single();
  if (trErr) return err(res, trErr.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_created_full', targetType: 'assessment_exercise', targetId: exercise.id, targetName: exercise.slug, ip: getClientIp(req) });
  return ok(res, { ...exercise, [TRANS_TABLE]: [translation] }, 'Assessment exercise created with English translation', 201);
}

export async function updateFull(req: Request, res: Response) {
  const id = req.params.id as string;
  const body = parseMultipartBody(req);
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  // Get existing exercise
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Assessment exercise not found', 404);

  // Build exercise updates (no title on parent)
  const exerciseUpdates: any = {};
  if (body.points !== undefined) exerciseUpdates.points = body.points;
  if (body.difficulty_level !== undefined) exerciseUpdates.difficulty_level = body.difficulty_level;
  if (body.display_order !== undefined) exerciseUpdates.display_order = body.display_order;
  if (body.is_active !== undefined) exerciseUpdates.is_active = body.is_active;

  // Re-generate slug if name changed
  if (body.name) {
    exerciseUpdates.slug = await generateUniqueSlug(supabase, TABLE, body.name, id, { column: 'topic_id', value: body.topic_id || old.topic_id });
  }

  exerciseUpdates.updated_by = req.user!.id;

  // Update exercise
  const { data: exercise, error: exErr } = await supabase
    .from(TABLE)
    .update(exerciseUpdates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (exErr) {
    if (exErr.code === '23505') return err(res, 'Assessment exercise slug already exists', 409);
    return err(res, exErr.message, 500);
  }

  // Find or create English translation
  const { data: existingTrans } = await supabase
    .from(TRANS_TABLE)
    .select('*')
    .eq('assesment_exercise_id', id)
    .eq('language_id', 7)
    .single();

  const translationUpdates: any = {
    updated_by: req.user!.id,
  };
  if (body.name) translationUpdates.name = body.name;
  if (body.description !== undefined) translationUpdates.description = body.description;

  // Handle file uploads
  if (files?.file?.[0]) {
    if (existingTrans?.file_url) {
      try { await deleteFromBunny(cdnPathFromUrl(existingTrans.file_url)); } catch (_) {}
    }
    const cdnPath = await buildExerciseCdnPath(id, 'en', 'main');
    if (!cdnPath) return err(res, 'Could not resolve exercise CDN path (check topic hierarchy)', 400);
    const cdnUrl = await uploadToBunny(cdnPath, files.file[0].buffer);
    translationUpdates.file_url = cdnUrl;
  }

  if (files?.file_solution?.[0]) {
    if (existingTrans?.file_solution_url) {
      try { await deleteFromBunny(cdnPathFromUrl(existingTrans.file_solution_url)); } catch (_) {}
    }
    const cdnPath = await buildExerciseCdnPath(id, 'en', 'solution');
    if (!cdnPath) return err(res, 'Could not resolve exercise CDN path (check topic hierarchy)', 400);
    const cdnUrl = await uploadToBunny(cdnPath, files.file_solution[0].buffer);
    translationUpdates.file_solution_url = cdnUrl;
  }

  let translation;
  if (existingTrans) {
    // Update existing translation
    const { data, error: trErr } = await supabase
      .from(TRANS_TABLE)
      .update(translationUpdates)
      .eq('id', existingTrans.id)
      .select('*, languages(id, name, iso_code, native_name)')
      .single();
    if (trErr) return err(res, trErr.message, 500);
    translation = data;
  } else {
    // Create new English translation
    const { data, error: trErr } = await supabase
      .from(TRANS_TABLE)
      .insert({
        assesment_exercise_id: id,
        language_id: 7,
        name: body.name || old.slug,
        description: body.description || null,
        file_url: translationUpdates.file_url || null,
        file_solution_url: translationUpdates.file_solution_url || null,
        is_active: true,
      })
      .select('*, languages(id, name, iso_code, native_name)')
      .single();
    if (trErr) return err(res, trErr.message, 500);
    translation = data;
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'assessment_exercise_updated_full', targetType: 'assessment_exercise', targetId: Number(id) || null, targetName: exercise.slug, ip: getClientIp(req) });
  return ok(res, { ...exercise, [TRANS_TABLE]: [translation] }, 'Assessment exercise updated with English translation');
}
