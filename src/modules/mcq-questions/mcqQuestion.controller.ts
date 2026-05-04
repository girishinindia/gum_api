import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { config } from '../../config';
import { deleteImage } from '../../services/storage.service';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

const CACHE_KEY = 'mcq_questions:all';
const clearCache = async (topicId?: number) => {
  await redis.del(CACHE_KEY);
  if (topicId) await redis.del(`mcq_questions:topic:${topicId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_mandatory === 'string') body.is_mandatory = body.is_mandatory === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.points === 'string') body.points = parseInt(body.points) || 1;
  if (typeof body.topic_id === 'string') {
    body.topic_id = body.topic_id === '' || body.topic_id === 'null' ? null : parseInt(body.topic_id) || null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('mcq_questions').select('*', { count: 'exact' });

  if (search) q = q.or(`code.ilike.%${search}%,slug.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.topic_id) q = q.eq('topic_id', parseInt(req.query.topic_id as string));
  if (req.query.mcq_type) q = q.eq('mcq_type', req.query.mcq_type as string);
  if (req.query.difficulty_level) q = q.eq('difficulty_level', req.query.difficulty_level as string);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation (question_text) for display
  const questionIds = (data || []).map((q: any) => q.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishMap: Record<number, string> = {};
  if (questionIds.length > 0) {
    let tQ = supabase.from('mcq_question_translations').select('mcq_question_id, question_text').eq('language_id', 7).in('mcq_question_id', questionIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) englishMap[t.mcq_question_id] = t.question_text;
    }
  }

  // Fetch translation count
  let translationCountMap: Record<number, number> = {};
  if (questionIds.length > 0) {
    let tQ = supabase.from('mcq_question_translations').select('mcq_question_id').in('mcq_question_id', questionIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) {
        translationCountMap[t.mcq_question_id] = (translationCountMap[t.mcq_question_id] || 0) + 1;
      }
    }
  }

  // Fetch option count
  let optionCountMap: Record<number, number> = {};
  if (questionIds.length > 0) {
    let oQ = supabase.from('mcq_options').select('mcq_question_id').in('mcq_question_id', questionIds);
    if (!isTrash) oQ = oQ.is('deleted_at', null);
    const { data: options } = await oQ;
    if (options) {
      for (const o of options) {
        optionCountMap[o.mcq_question_id] = (optionCountMap[o.mcq_question_id] || 0) + 1;
      }
    }
  }

  // Get total material languages count
  const { count: totalLanguages } = await supabase.from('languages')
    .select('id', { count: 'exact', head: true })
    .eq('for_material', true).eq('is_active', true);

  const enriched = (data || []).map((q: any) => ({
    ...q,
    question_text: englishMap[q.id] || null,
    translation_count: translationCountMap[q.id] || 0,
    total_languages: totalLanguages || 0,
    option_count: optionCountMap[q.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('mcq_questions').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'MCQ question not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'mcq_question', 'activate')) {
    return err(res, 'Permission denied: mcq_question:activate required to create inactive', 403);
  }

  body.created_by = req.user!.id;

  // Auto-generate slug from code
  if (!body.slug && body.code) {
    body.slug = await generateUniqueSlug(supabase, 'mcq_questions', body.code, undefined, { column: 'topic_id', value: body.topic_id });
  } else if (body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'mcq_questions', body.slug, undefined, { column: 'topic_id', value: body.topic_id });
  }

  const { data, error: e } = await supabase.from('mcq_questions').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'MCQ question code or slug already exists for this topic', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_question_created', targetType: 'mcq_question', targetId: data.id, targetName: data.code || data.slug, ip: getClientIp(req) });
  return ok(res, data, 'MCQ question created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_questions').select('*').eq('id', id).single();
  if (!old) return err(res, 'MCQ question not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'mcq_question', 'activate')) {
      return err(res, 'Permission denied: mcq_question:activate required to change active status', 403);
    }
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('mcq_questions').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'MCQ question code or slug already exists for this topic', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.topic_id);
  if (updates.topic_id && updates.topic_id !== old.topic_id) await clearCache(updates.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_question_updated', targetType: 'mcq_question', targetId: id, targetName: data.code || data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'MCQ question updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_questions').select('code, slug, topic_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'MCQ question not found', 404);
  if (old.deleted_at) return err(res, 'MCQ question is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('mcq_questions')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to translations
  await supabase.from('mcq_question_translations').update({ deleted_at: now, is_active: false }).eq('mcq_question_id', id).is('deleted_at', null);

  // Cascade soft-delete to options
  const { data: options } = await supabase.from('mcq_options').select('id').eq('mcq_question_id', id).is('deleted_at', null);
  if (options && options.length > 0) {
    const optionIds = options.map((o: any) => o.id);
    await supabase.from('mcq_options').update({ deleted_at: now, is_active: false }).in('id', optionIds);
    // Cascade to option translations
    await supabase.from('mcq_option_translations').update({ deleted_at: now, is_active: false }).in('mcq_option_id', optionIds).is('deleted_at', null);
  }

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_question_soft_deleted', targetType: 'mcq_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'MCQ question moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_questions').select('code, slug, topic_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'MCQ question not found', 404);
  if (!old.deleted_at) return err(res, 'MCQ question is not in trash', 400);

  const { data, error: e } = await supabase
    .from('mcq_questions')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore translations
  await supabase.from('mcq_question_translations').update({ deleted_at: null, is_active: true }).eq('mcq_question_id', id).not('deleted_at', 'is', null);

  // Cascade restore options + option translations
  const { data: options } = await supabase.from('mcq_options').select('id').eq('mcq_question_id', id).not('deleted_at', 'is', null);
  if (options && options.length > 0) {
    const optionIds = options.map((o: any) => o.id);
    await supabase.from('mcq_options').update({ deleted_at: null, is_active: true }).in('id', optionIds);
    await supabase.from('mcq_option_translations').update({ deleted_at: null, is_active: true }).in('mcq_option_id', optionIds).not('deleted_at', 'is', null);
  }

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_question_restored', targetType: 'mcq_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'MCQ question restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('mcq_questions').select('code, slug, topic_id').eq('id', id).single();
    if (!old) return err(res, 'MCQ question not found', 404);

    // Cascade permanent delete: bottom-up

    // 1. Get all options for this question
    const { data: options } = await supabase.from('mcq_options').select('id').eq('mcq_question_id', id);
    const optionIds = (options || []).map((o: any) => o.id);

    if (optionIds.length > 0) {
      // 1a. Delete option translation images from CDN
      const { data: optTranslations } = await supabase.from('mcq_option_translations').select('id, image').in('mcq_option_id', optionIds);
      if (optTranslations) {
        for (const t of optTranslations) {
          if (t.image) { try { await deleteImage(extractBunnyPath(t.image), t.image); } catch {} }
        }
      }
      // 1b. Delete option translations
      await supabase.from('mcq_option_translations').delete().in('mcq_option_id', optionIds);
      // 1c. Delete options
      await supabase.from('mcq_options').delete().eq('mcq_question_id', id);
    }

    // 2. Delete question translation images from CDN
    const { data: qTranslations } = await supabase.from('mcq_question_translations').select('id, image_1, image_2').eq('mcq_question_id', id);
    if (qTranslations) {
      for (const t of qTranslations) {
        if (t.image_1) { try { await deleteImage(extractBunnyPath(t.image_1), t.image_1); } catch {} }
        if (t.image_2) { try { await deleteImage(extractBunnyPath(t.image_2), t.image_2); } catch {} }
      }
    }
    // 2b. Delete question translations
    await supabase.from('mcq_question_translations').delete().eq('mcq_question_id', id);

    // 3. Delete the question itself
    const { error: e } = await supabase.from('mcq_questions').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache(old.topic_id);
    logAdmin({ actorId: req.user!.id, action: 'mcq_question_deleted', targetType: 'mcq_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
    return ok(res, null, 'MCQ question permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete MCQ question', 500);
  }
}

// ── Create Full MCQ (Question + Options + English Translations) ──
export async function createFull(req: Request, res: Response) {
  try {
    const {
      topic_id, mcq_type, difficulty_level, question_text, hint_text, explanation_text,
      options, points, display_order, is_mandatory, is_active
    } = req.body;

    if (!topic_id || !mcq_type || !question_text || !options || !Array.isArray(options) || options.length < 2) {
      return err(res, 'topic_id, mcq_type, question_text, and at least 2 options are required', 400);
    }

    const hasCorrect = options.some((o: any) => o.is_correct);
    if (!hasCorrect) return err(res, 'At least one option must be marked as correct', 400);

    // Auto-generate code from question_text (first 30 chars)
    const code = question_text.substring(0, 30).trim();
    const slug = await generateUniqueSlug(supabase, 'mcq_questions', question_text, undefined, { column: 'topic_id', value: topic_id });

    // Auto display_order: get max for this topic
    let finalDisplayOrder = display_order;
    if (finalDisplayOrder === undefined || finalDisplayOrder === null) {
      const { data: maxRow } = await supabase
        .from('mcq_questions').select('display_order')
        .eq('topic_id', topic_id).is('deleted_at', null)
        .order('display_order', { ascending: false }).limit(1);
      finalDisplayOrder = (maxRow && maxRow.length > 0 && maxRow[0].display_order != null) ? maxRow[0].display_order + 1 : 1;
    }

    // Map frontend mcq_type values to DB enum values
    const typeMap: Record<string, string> = { single_choice: 'single', multiple_choice: 'multiple', true_false: 'true_false', single: 'single', multiple: 'multiple' };
    const dbMcqType = typeMap[mcq_type] || mcq_type;

    // 1. Create the MCQ question
    const { data: question, error: qErr } = await supabase.from('mcq_questions').insert({
      topic_id, code, slug, mcq_type: dbMcqType,
      difficulty_level: difficulty_level || 'medium',
      points: points || 1,
      display_order: finalDisplayOrder,
      is_mandatory: is_mandatory ?? false,
      is_active: is_active ?? true,
      created_by: req.user!.id,
    }).select().single();
    if (qErr) {
      if (qErr.code === '23505') return err(res, 'MCQ question already exists for this topic', 409);
      return err(res, qErr.message, 500);
    }

    // 2. Create MCQ options
    const optionInserts = options.map((o: any, idx: number) => ({
      mcq_question_id: question.id,
      is_correct: o.is_correct || false,
      display_order: o.display_order ?? idx + 1,
      is_active: true,
      created_by: req.user!.id,
    }));
    const { data: createdOptions, error: oErr } = await supabase.from('mcq_options').insert(optionInserts).select();
    if (oErr) return err(res, `Options insert failed: ${oErr.message}`, 500);

    // 3. Create English question translation (language_id = 7)
    const { data: qTrans, error: qtErr } = await supabase.from('mcq_question_translations').insert({
      mcq_question_id: question.id,
      language_id: 7,
      question_text,
      hint_text: hint_text || null,
      explanation_text: explanation_text || null,
      is_active: true,
      created_by: req.user!.id,
    }).select().single();
    if (qtErr) return err(res, `Question translation failed: ${qtErr.message}`, 500);

    // 4. Create English option translations (language_id = 7)
    const optTransInserts = (createdOptions || []).map((opt: any, idx: number) => ({
      mcq_option_id: opt.id,
      language_id: 7,
      option_text: options[idx].option_text || '',
      is_active: true,
      created_by: req.user!.id,
    }));
    const { error: otErr } = await supabase.from('mcq_option_translations').insert(optTransInserts).select();
    if (otErr) return err(res, `Option translations failed: ${otErr.message}`, 500);

    await clearCache(topic_id);
    logAdmin({ actorId: req.user!.id, action: 'mcq_question_created_full', targetType: 'mcq_question', targetId: question.id, targetName: code, ip: getClientIp(req) });

    return ok(res, {
      ...question,
      question_text,
      hint_text: hint_text || null,
      explanation_text: explanation_text || null,
      options: (createdOptions || []).map((opt: any, idx: number) => ({
        ...opt,
        option_text: options[idx].option_text || '',
      })),
    }, 'MCQ question created with options and English translations', 201);
  } catch (error: any) {
    return err(res, error.message || 'Failed to create full MCQ question', 500);
  }
}

// ── Update Full MCQ (Question + Options + English Translations) ──
export async function updateFull(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from('mcq_questions').select('*').eq('id', id).single();
    if (!old) return err(res, 'MCQ question not found', 404);

    const {
      topic_id, mcq_type, difficulty_level, question_text, hint_text, explanation_text,
      options, points, display_order, is_mandatory, is_active
    } = req.body;

    // Map frontend mcq_type values to DB enum values
    const typeMap: Record<string, string> = { single_choice: 'single', multiple_choice: 'multiple', true_false: 'true_false', single: 'single', multiple: 'multiple' };

    // 1. Update the MCQ question
    const questionUpdates: any = { updated_by: req.user!.id };
    if (topic_id !== undefined && topic_id !== '') questionUpdates.topic_id = topic_id;
    if (mcq_type !== undefined) questionUpdates.mcq_type = typeMap[mcq_type] || mcq_type;
    if (difficulty_level !== undefined) questionUpdates.difficulty_level = difficulty_level;
    if (points !== undefined) questionUpdates.points = points;
    if (display_order !== undefined) questionUpdates.display_order = display_order;
    if (is_mandatory !== undefined) questionUpdates.is_mandatory = is_mandatory;
    if (is_active !== undefined) questionUpdates.is_active = is_active;

    // Re-generate slug if question_text changed
    if (question_text) {
      questionUpdates.code = question_text.substring(0, 30).trim();
      questionUpdates.slug = await generateUniqueSlug(supabase, 'mcq_questions', question_text, id, { column: 'topic_id', value: topic_id || old.topic_id });
    }

    const { data: updatedQ, error: qErr } = await supabase.from('mcq_questions').update(questionUpdates).eq('id', id).select().single();
    if (qErr) return err(res, qErr.message, 500);

    // 2. Update English question translation
    if (question_text !== undefined) {
      const { data: existingQT } = await supabase.from('mcq_question_translations')
        .select('id').eq('mcq_question_id', id).eq('language_id', 7).single();

      if (existingQT) {
        await supabase.from('mcq_question_translations').update({
          question_text,
          hint_text: hint_text ?? null,
          explanation_text: explanation_text ?? null,
          updated_by: req.user!.id,
        }).eq('id', existingQT.id);
      } else {
        await supabase.from('mcq_question_translations').insert({
          mcq_question_id: id,
          language_id: 7,
          question_text,
          hint_text: hint_text ?? null,
          explanation_text: explanation_text ?? null,
          is_active: true,
          created_by: req.user!.id,
        });
      }
    }

    // 3. Replace options if provided
    if (options && Array.isArray(options)) {
      // Delete old options + their translations
      const { data: oldOpts } = await supabase.from('mcq_options').select('id').eq('mcq_question_id', id);
      if (oldOpts && oldOpts.length > 0) {
        const oldOptIds = oldOpts.map((o: any) => o.id);
        await supabase.from('mcq_option_translations').delete().in('mcq_option_id', oldOptIds);
        await supabase.from('mcq_options').delete().eq('mcq_question_id', id);
      }

      // Enforce single correct for single_choice / true_false
      const effectiveType = questionUpdates.mcq_type || old.mcq_type;
      if ((effectiveType === 'single' || effectiveType === 'single_choice' || effectiveType === 'true_false') &&
          options.filter((o: any) => o.is_correct).length > 1) {
        let foundFirst = false;
        options.forEach((o: any) => {
          if (o.is_correct && !foundFirst) { foundFirst = true; }
          else if (o.is_correct) { o.is_correct = false; }
        });
      }

      // Insert new options
      const optionInserts = options.map((o: any, idx: number) => ({
        mcq_question_id: id,
        is_correct: o.is_correct || false,
        display_order: o.display_order ?? idx + 1,
        is_active: true,
        created_by: req.user!.id,
      }));
      const { data: newOpts, error: oErr } = await supabase.from('mcq_options').insert(optionInserts).select();
      if (oErr) return err(res, `Options update failed: ${oErr.message}`, 500);

      // Insert English option translations
      const optTransInserts = (newOpts || []).map((opt: any, idx: number) => ({
        mcq_option_id: opt.id,
        language_id: 7,
        option_text: options[idx].option_text || '',
        is_active: true,
        created_by: req.user!.id,
      }));
      await supabase.from('mcq_option_translations').insert(optTransInserts);
    }

    await clearCache(old.topic_id);
    if (topic_id && topic_id !== old.topic_id) await clearCache(topic_id);
    logAdmin({ actorId: req.user!.id, action: 'mcq_question_updated_full', targetType: 'mcq_question', targetId: id, targetName: updatedQ.code || updatedQ.slug, ip: getClientIp(req) });

    return ok(res, updatedQ, 'MCQ question updated with options and translations');
  } catch (error: any) {
    return err(res, error.message || 'Failed to update full MCQ question', 500);
  }
}

// ── Get Full MCQ (Question + Options + All Translations + Coverage) ──
export async function getFullById(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: question, error: qErr } = await supabase.from('mcq_questions').select('*').eq('id', id).is('deleted_at', null).single();
    if (qErr || !question) return err(res, 'MCQ question not found', 404);

    // Get question translations (all languages)
    const { data: qTranslations } = await supabase.from('mcq_question_translations')
      .select('*').eq('mcq_question_id', id).is('deleted_at', null);

    // Get options
    const { data: options } = await supabase.from('mcq_options')
      .select('*').eq('mcq_question_id', id).is('deleted_at', null)
      .order('display_order', { ascending: true });

    // Get option translations (all languages)
    const optionIds = (options || []).map((o: any) => o.id);
    let optTranslations: any[] = [];
    if (optionIds.length > 0) {
      const { data } = await supabase.from('mcq_option_translations')
        .select('*').in('mcq_option_id', optionIds).is('deleted_at', null);
      optTranslations = data || [];
    }

    // Get all material languages
    const { data: languages } = await supabase.from('languages')
      .select('id, name, iso_code, for_material').eq('for_material', true).eq('is_active', true);

    // Build translation coverage
    const qTransLangIds = new Set((qTranslations || []).map((t: any) => t.language_id));
    const coverage = (languages || []).map((lang: any) => ({
      language_id: lang.id,
      language_name: lang.name,
      language_code: lang.iso_code,
      has_question_translation: qTransLangIds.has(lang.id),
      has_option_translations: optTranslations.some((ot: any) => ot.language_id === lang.id),
    }));

    // Enrich options with their translations
    const enrichedOptions = (options || []).map((opt: any) => ({
      ...opt,
      translations: optTranslations.filter((ot: any) => ot.mcq_option_id === opt.id),
    }));

    return ok(res, {
      ...question,
      question_translations: qTranslations || [],
      options: enrichedOptions,
      translation_coverage: coverage,
    });
  } catch (error: any) {
    return err(res, error.message || 'Failed to get full MCQ question', 500);
  }
}
