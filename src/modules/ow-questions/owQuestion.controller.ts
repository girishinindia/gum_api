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

const CACHE_KEY = 'ow_questions:all';
const clearCache = async (topicId?: number) => {
  await redis.del(CACHE_KEY);
  if (topicId) await redis.del(`ow_questions:topic:${topicId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_mandatory === 'string') body.is_mandatory = body.is_mandatory === 'true';
  if (typeof body.is_case_sensitive === 'string') body.is_case_sensitive = body.is_case_sensitive === 'true';
  if (typeof body.is_trim_whitespace === 'string') body.is_trim_whitespace = body.is_trim_whitespace === 'true';
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

  let q = supabase.from('one_word_questions').select('*', { count: 'exact' });

  if (search) q = q.or(`code.ilike.%${search}%,slug.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.topic_id) q = q.eq('topic_id', parseInt(req.query.topic_id as string));
  if (req.query.question_type) q = q.eq('question_type', req.query.question_type as string);
  if (req.query.difficulty_level) q = q.eq('difficulty_level', req.query.difficulty_level as string);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation (question_text + correct_answer) for display
  const questionIds = (data || []).map((q: any) => q.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishMap: Record<number, { question_text: string; correct_answer: string }> = {};
  if (questionIds.length > 0) {
    let tQ = supabase.from('one_word_question_translations').select('ow_question_id, question_text, correct_answer').eq('language_id', 7).in('ow_question_id', questionIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) englishMap[t.ow_question_id] = { question_text: t.question_text, correct_answer: t.correct_answer };
    }
  }

  // Fetch translation count
  let translationCountMap: Record<number, number> = {};
  if (questionIds.length > 0) {
    let tQ = supabase.from('one_word_question_translations').select('ow_question_id').in('ow_question_id', questionIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) {
        translationCountMap[t.ow_question_id] = (translationCountMap[t.ow_question_id] || 0) + 1;
      }
    }
  }

  // Fetch synonym count
  let synonymCountMap: Record<number, number> = {};
  if (questionIds.length > 0) {
    let sQ = supabase.from('one_word_synonyms').select('ow_question_id').in('ow_question_id', questionIds);
    if (!isTrash) sQ = sQ.is('deleted_at', null);
    const { data: synonyms } = await sQ;
    if (synonyms) {
      for (const s of synonyms) {
        synonymCountMap[s.ow_question_id] = (synonymCountMap[s.ow_question_id] || 0) + 1;
      }
    }
  }

  const enriched = (data || []).map((q: any) => ({
    ...q,
    question_text: englishMap[q.id]?.question_text || null,
    correct_answer: englishMap[q.id]?.correct_answer || null,
    translation_count: translationCountMap[q.id] || 0,
    synonym_count: synonymCountMap[q.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('one_word_questions').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'One-word question not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'ow_question', 'activate')) {
    return err(res, 'Permission denied: ow_question:activate required to create inactive', 403);
  }

  body.created_by = req.user!.id;

  // Auto-generate slug from code
  if (!body.slug && body.code) {
    body.slug = await generateUniqueSlug(supabase, 'one_word_questions', body.code, undefined, { column: 'topic_id', value: body.topic_id });
  } else if (body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'one_word_questions', body.slug, undefined, { column: 'topic_id', value: body.topic_id });
  }

  const { data, error: e } = await supabase.from('one_word_questions').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'One-word question code or slug already exists for this topic', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_question_created', targetType: 'ow_question', targetId: data.id, targetName: data.code || data.slug, ip: getClientIp(req) });
  return ok(res, data, 'One-word question created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('one_word_questions').select('*').eq('id', id).single();
  if (!old) return err(res, 'One-word question not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'ow_question', 'activate')) {
      return err(res, 'Permission denied: ow_question:activate required to change active status', 403);
    }
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('one_word_questions').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'One-word question code or slug already exists for this topic', 409);
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
  logAdmin({ actorId: req.user!.id, action: 'ow_question_updated', targetType: 'ow_question', targetId: id, targetName: data.code || data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'One-word question updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('one_word_questions').select('code, slug, topic_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'One-word question not found', 404);
  if (old.deleted_at) return err(res, 'One-word question is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('one_word_questions')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to translations
  await supabase.from('one_word_question_translations').update({ deleted_at: now, is_active: false }).eq('ow_question_id', id).is('deleted_at', null);

  // Cascade soft-delete to synonyms
  const { data: synonyms } = await supabase.from('one_word_synonyms').select('id').eq('ow_question_id', id).is('deleted_at', null);
  if (synonyms && synonyms.length > 0) {
    const synonymIds = synonyms.map((s: any) => s.id);
    await supabase.from('one_word_synonyms').update({ deleted_at: now, is_active: false }).in('id', synonymIds);
    // Cascade to synonym translations
    await supabase.from('one_word_synonym_translations').update({ deleted_at: now, is_active: false }).in('ow_synonym_id', synonymIds).is('deleted_at', null);
  }

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_question_soft_deleted', targetType: 'ow_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'One-word question moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('one_word_questions').select('code, slug, topic_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'One-word question not found', 404);
  if (!old.deleted_at) return err(res, 'One-word question is not in trash', 400);

  const { data, error: e } = await supabase
    .from('one_word_questions')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore translations
  await supabase.from('one_word_question_translations').update({ deleted_at: null, is_active: true }).eq('ow_question_id', id).not('deleted_at', 'is', null);

  // Cascade restore synonyms + synonym translations
  const { data: synonyms } = await supabase.from('one_word_synonyms').select('id').eq('ow_question_id', id).not('deleted_at', 'is', null);
  if (synonyms && synonyms.length > 0) {
    const synonymIds = synonyms.map((s: any) => s.id);
    await supabase.from('one_word_synonyms').update({ deleted_at: null, is_active: true }).in('id', synonymIds);
    await supabase.from('one_word_synonym_translations').update({ deleted_at: null, is_active: true }).in('ow_synonym_id', synonymIds).not('deleted_at', 'is', null);
  }

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_question_restored', targetType: 'ow_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'One-word question restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('one_word_questions').select('code, slug, topic_id').eq('id', id).single();
    if (!old) return err(res, 'One-word question not found', 404);

    // Cascade permanent delete: bottom-up

    // 1. Get all synonyms for this question
    const { data: synonyms } = await supabase.from('one_word_synonyms').select('id').eq('ow_question_id', id);
    const synonymIds = (synonyms || []).map((s: any) => s.id);

    if (synonymIds.length > 0) {
      // 1a. Delete synonym translations
      await supabase.from('one_word_synonym_translations').delete().in('ow_synonym_id', synonymIds);
      // 1b. Delete synonyms
      await supabase.from('one_word_synonyms').delete().eq('ow_question_id', id);
    }

    // 2. Delete question translation images from CDN
    const { data: qTranslations } = await supabase.from('one_word_question_translations').select('id, image_1, image_2').eq('ow_question_id', id);
    if (qTranslations) {
      for (const t of qTranslations) {
        if (t.image_1) { try { await deleteImage(extractBunnyPath(t.image_1), t.image_1); } catch {} }
        if (t.image_2) { try { await deleteImage(extractBunnyPath(t.image_2), t.image_2); } catch {} }
      }
    }
    // 2b. Delete question translations
    await supabase.from('one_word_question_translations').delete().eq('ow_question_id', id);

    // 3. Delete the question itself
    const { error: e } = await supabase.from('one_word_questions').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache(old.topic_id);
    logAdmin({ actorId: req.user!.id, action: 'ow_question_deleted', targetType: 'ow_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
    return ok(res, null, 'One-word question permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete one-word question', 500);
  }
}
