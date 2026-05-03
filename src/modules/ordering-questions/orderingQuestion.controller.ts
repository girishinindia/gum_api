import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';

const CACHE_KEY = 'ordering_questions:all';
const clearCache = async (topicId?: number) => {
  await redis.del(CACHE_KEY);
  if (topicId) await redis.del(`ordering_questions:topic:${topicId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_mandatory === 'string') body.is_mandatory = body.is_mandatory === 'true';
  if (typeof body.partial_scoring === 'string') body.partial_scoring = body.partial_scoring === 'true';
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

  let q = supabase.from('ordering_questions').select('*', { count: 'exact' });

  if (search) q = q.or(`code.ilike.%${search}%,slug.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.topic_id) q = q.eq('topic_id', parseInt(req.query.topic_id as string));
  if (req.query.difficulty_level) q = q.eq('difficulty_level', req.query.difficulty_level as string);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation (question_text) for display
  const questionIds = (data || []).map((q: any) => q.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishMap: Record<number, { question_text: string }> = {};
  if (questionIds.length > 0) {
    let tQ = supabase.from('ordering_question_translations').select('ordering_question_id, question_text').eq('language_id', 7).in('ordering_question_id', questionIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) englishMap[t.ordering_question_id] = { question_text: t.question_text };
    }
  }

  // Fetch translation count
  let translationCountMap: Record<number, number> = {};
  if (questionIds.length > 0) {
    let tQ = supabase.from('ordering_question_translations').select('ordering_question_id').in('ordering_question_id', questionIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) {
        translationCountMap[t.ordering_question_id] = (translationCountMap[t.ordering_question_id] || 0) + 1;
      }
    }
  }

  // Fetch item count
  let itemCountMap: Record<number, number> = {};
  if (questionIds.length > 0) {
    let iQ = supabase.from('ordering_items').select('ordering_question_id').in('ordering_question_id', questionIds);
    if (!isTrash) iQ = iQ.is('deleted_at', null);
    const { data: items } = await iQ;
    if (items) {
      for (const i of items) {
        itemCountMap[i.ordering_question_id] = (itemCountMap[i.ordering_question_id] || 0) + 1;
      }
    }
  }

  // Get total material languages count
  const { count: totalLanguages } = await supabase.from('languages')
    .select('id', { count: 'exact', head: true })
    .eq('for_material', true).eq('is_active', true);

  const enriched = (data || []).map((q: any) => ({
    ...q,
    question_text: englishMap[q.id]?.question_text || null,
    translation_count: translationCountMap[q.id] || 0,
    total_languages: totalLanguages || 0,
    item_count: itemCountMap[q.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('ordering_questions').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Ordering question not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'ordering_question', 'activate')) {
    return err(res, 'Permission denied: ordering_question:activate required to create inactive', 403);
  }

  body.created_by = req.user!.id;

  // Auto-generate slug from code
  if (!body.slug && body.code) {
    body.slug = await generateUniqueSlug(supabase, 'ordering_questions', body.code, undefined, { column: 'topic_id', value: body.topic_id });
  } else if (body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'ordering_questions', body.slug, undefined, { column: 'topic_id', value: body.topic_id });
  }

  const { data, error: e } = await supabase.from('ordering_questions').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Ordering question code or slug already exists for this topic', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_created', targetType: 'ordering_question', targetId: data.id, targetName: data.code || data.slug, ip: getClientIp(req) });
  return ok(res, data, 'Ordering question created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_questions').select('*').eq('id', id).single();
  if (!old) return err(res, 'Ordering question not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'ordering_question', 'activate')) {
      return err(res, 'Permission denied: ordering_question:activate required to change active status', 403);
    }
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('ordering_questions').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Ordering question code or slug already exists for this topic', 409);
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
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_updated', targetType: 'ordering_question', targetId: id, targetName: data.code || data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'Ordering question updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_questions').select('code, slug, topic_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Ordering question not found', 404);
  if (old.deleted_at) return err(res, 'Ordering question is already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from('ordering_questions')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to translations
  await supabase.from('ordering_question_translations').update({ deleted_at: now, is_active: false }).eq('ordering_question_id', id).is('deleted_at', null);

  // Cascade soft-delete to items
  const { data: items } = await supabase.from('ordering_items').select('id').eq('ordering_question_id', id).is('deleted_at', null);
  if (items && items.length > 0) {
    const itemIds = items.map((i: any) => i.id);
    await supabase.from('ordering_items').update({ deleted_at: now, is_active: false }).in('id', itemIds);
    // Cascade to item translations
    await supabase.from('ordering_item_translations').update({ deleted_at: now, is_active: false }).in('ordering_item_id', itemIds).is('deleted_at', null);
  }

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_soft_deleted', targetType: 'ordering_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Ordering question moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_questions').select('code, slug, topic_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Ordering question not found', 404);
  if (!old.deleted_at) return err(res, 'Ordering question is not in trash', 400);

  const { data, error: e } = await supabase
    .from('ordering_questions')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore translations
  await supabase.from('ordering_question_translations').update({ deleted_at: null, is_active: true }).eq('ordering_question_id', id).not('deleted_at', 'is', null);

  // Cascade restore items + item translations
  const { data: items } = await supabase.from('ordering_items').select('id').eq('ordering_question_id', id).not('deleted_at', 'is', null);
  if (items && items.length > 0) {
    const itemIds = items.map((i: any) => i.id);
    await supabase.from('ordering_items').update({ deleted_at: null, is_active: true }).in('id', itemIds);
    await supabase.from('ordering_item_translations').update({ deleted_at: null, is_active: true }).in('ordering_item_id', itemIds).not('deleted_at', 'is', null);
  }

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_restored', targetType: 'ordering_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Ordering question restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('ordering_questions').select('code, slug, topic_id').eq('id', id).single();
    if (!old) return err(res, 'Ordering question not found', 404);

    // Cascade permanent delete: bottom-up

    // 1. Get all items for this question
    const { data: items } = await supabase.from('ordering_items').select('id').eq('ordering_question_id', id);
    const itemIds = (items || []).map((i: any) => i.id);

    if (itemIds.length > 0) {
      // 1a. Delete item translations
      await supabase.from('ordering_item_translations').delete().in('ordering_item_id', itemIds);
      // 1b. Delete items
      await supabase.from('ordering_items').delete().eq('ordering_question_id', id);
    }

    // 2. Delete question translations
    await supabase.from('ordering_question_translations').delete().eq('ordering_question_id', id);

    // 3. Delete the question itself
    const { error: e } = await supabase.from('ordering_questions').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache(old.topic_id);
    logAdmin({ actorId: req.user!.id, action: 'ordering_question_deleted', targetType: 'ordering_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
    return ok(res, null, 'Ordering question permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete ordering question', 500);
  }
}

// ── Create Full Ordering Question (Question + Items + English Translations) ──
export async function createFull(req: Request, res: Response) {
  try {
    const {
      topic_id, difficulty_level, question_text, hint, explanation,
      items, points, display_order, is_mandatory, is_active, partial_scoring
    } = req.body;

    if (!topic_id || !question_text || !items || !Array.isArray(items) || items.length < 2) {
      return err(res, 'topic_id, question_text, and at least 2 items are required', 400);
    }

    // Auto-generate code from question_text (first 30 chars)
    const code = question_text.substring(0, 30).trim();
    const slug = await generateUniqueSlug(supabase, 'ordering_questions', question_text, undefined, { column: 'topic_id', value: topic_id });

    // Auto display_order: get max for this topic
    let finalDisplayOrder = display_order;
    if (finalDisplayOrder === undefined || finalDisplayOrder === null) {
      const { data: maxRow } = await supabase
        .from('ordering_questions').select('display_order')
        .eq('topic_id', topic_id).is('deleted_at', null)
        .order('display_order', { ascending: false }).limit(1);
      finalDisplayOrder = (maxRow && maxRow.length > 0 && maxRow[0].display_order != null) ? maxRow[0].display_order + 1 : 1;
    }

    // 1. Create the ordering question
    const { data: question, error: qErr } = await supabase.from('ordering_questions').insert({
      topic_id, code, slug,
      difficulty_level: difficulty_level || 'medium',
      points: points || 1,
      display_order: finalDisplayOrder,
      is_mandatory: is_mandatory ?? false,
      partial_scoring: partial_scoring ?? false,
      is_active: is_active ?? true,
      created_by: req.user!.id,
    }).select().single();
    if (qErr) {
      if (qErr.code === '23505') return err(res, 'Ordering question already exists for this topic', 409);
      return err(res, qErr.message, 500);
    }

    // 2. Create English question translation (language_id = 7)
    const { data: qTrans, error: qtErr } = await supabase.from('ordering_question_translations').insert({
      ordering_question_id: question.id,
      language_id: 7,
      question_text,
      hint: hint || null,
      explanation: explanation || null,
      is_active: true,
      created_by: req.user!.id,
    }).select().single();
    if (qtErr) return err(res, `Question translation failed: ${qtErr.message}`, 500);

    // 3. Create ordering items
    const itemInserts = items.map((item: any, idx: number) => ({
      ordering_question_id: question.id,
      correct_position: item.correct_position ?? idx + 1,
      display_order: item.display_order ?? idx + 1,
      is_active: true,
      created_by: req.user!.id,
    }));
    const { data: createdItems, error: iErr } = await supabase.from('ordering_items').insert(itemInserts).select();
    if (iErr) return err(res, `Items insert failed: ${iErr.message}`, 500);

    // 4. Create English item translations (language_id = 7)
    const itemTransInserts = (createdItems || []).map((item: any, idx: number) => ({
      ordering_item_id: item.id,
      language_id: 7,
      item_text: items[idx].item_text || '',
      is_active: true,
      created_by: req.user!.id,
    }));
    const { error: itErr } = await supabase.from('ordering_item_translations').insert(itemTransInserts).select();
    if (itErr) return err(res, `Item translations failed: ${itErr.message}`, 500);

    await clearCache(topic_id);
    logAdmin({ actorId: req.user!.id, action: 'ordering_question_created_full', targetType: 'ordering_question', targetId: question.id, targetName: code, ip: getClientIp(req) });

    return ok(res, {
      ...question,
      question_text,
      hint: hint || null,
      explanation: explanation || null,
      items: (createdItems || []).map((item: any, idx: number) => ({
        ...item,
        item_text: items[idx].item_text || '',
      })),
    }, 'Ordering question created with items and English translations', 201);
  } catch (error: any) {
    return err(res, error.message || 'Failed to create full ordering question', 500);
  }
}

// ── Update Full Ordering Question (Question + Items + English Translations) ──
export async function updateFull(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from('ordering_questions').select('*').eq('id', id).single();
    if (!old) return err(res, 'Ordering question not found', 404);

    const {
      topic_id, difficulty_level, question_text, hint, explanation,
      items, points, display_order, is_mandatory, is_active, partial_scoring
    } = req.body;

    // 1. Update the ordering question
    const questionUpdates: any = { updated_by: req.user!.id };
    if (topic_id !== undefined) questionUpdates.topic_id = topic_id;
    if (difficulty_level !== undefined) questionUpdates.difficulty_level = difficulty_level;
    if (points !== undefined) questionUpdates.points = points;
    if (display_order !== undefined) questionUpdates.display_order = display_order;
    if (is_mandatory !== undefined) questionUpdates.is_mandatory = is_mandatory;
    if (is_active !== undefined) questionUpdates.is_active = is_active;
    if (partial_scoring !== undefined) questionUpdates.partial_scoring = partial_scoring;

    // Re-generate slug if question_text changed
    if (question_text) {
      questionUpdates.code = question_text.substring(0, 30).trim();
      questionUpdates.slug = await generateUniqueSlug(supabase, 'ordering_questions', question_text, id, { column: 'topic_id', value: topic_id || old.topic_id });
    }

    const { data: updatedQ, error: qErr } = await supabase.from('ordering_questions').update(questionUpdates).eq('id', id).select().single();
    if (qErr) return err(res, qErr.message, 500);

    // 2. Update English question translation
    if (question_text !== undefined) {
      const { data: existingQT } = await supabase.from('ordering_question_translations')
        .select('id').eq('ordering_question_id', id).eq('language_id', 7).single();

      if (existingQT) {
        await supabase.from('ordering_question_translations').update({
          question_text,
          hint: hint ?? null,
          explanation: explanation ?? null,
          updated_by: req.user!.id,
        }).eq('id', existingQT.id);
      } else {
        await supabase.from('ordering_question_translations').insert({
          ordering_question_id: id,
          language_id: 7,
          question_text,
          hint: hint ?? null,
          explanation: explanation ?? null,
          is_active: true,
          created_by: req.user!.id,
        });
      }
    }

    // 3. Replace items if provided
    if (items && Array.isArray(items)) {
      // Delete old items + their translations
      const { data: oldItems } = await supabase.from('ordering_items').select('id').eq('ordering_question_id', id);
      if (oldItems && oldItems.length > 0) {
        const oldItemIds = oldItems.map((i: any) => i.id);
        await supabase.from('ordering_item_translations').delete().in('ordering_item_id', oldItemIds);
        await supabase.from('ordering_items').delete().eq('ordering_question_id', id);
      }

      // Insert new items
      const itemInserts = items.map((item: any, idx: number) => ({
        ordering_question_id: id,
        correct_position: item.correct_position ?? idx + 1,
        display_order: item.display_order ?? idx + 1,
        is_active: true,
        created_by: req.user!.id,
      }));
      const { data: newItems, error: iErr } = await supabase.from('ordering_items').insert(itemInserts).select();
      if (iErr) return err(res, `Items update failed: ${iErr.message}`, 500);

      // Insert English item translations
      const itemTransInserts = (newItems || []).map((item: any, idx: number) => ({
        ordering_item_id: item.id,
        language_id: 7,
        item_text: items[idx].item_text || '',
        is_active: true,
        created_by: req.user!.id,
      }));
      await supabase.from('ordering_item_translations').insert(itemTransInserts);
    }

    await clearCache(old.topic_id);
    if (topic_id && topic_id !== old.topic_id) await clearCache(topic_id);
    logAdmin({ actorId: req.user!.id, action: 'ordering_question_updated_full', targetType: 'ordering_question', targetId: id, targetName: updatedQ.code || updatedQ.slug, ip: getClientIp(req) });

    return ok(res, updatedQ, 'Ordering question updated with items and translations');
  } catch (error: any) {
    return err(res, error.message || 'Failed to update full ordering question', 500);
  }
}

// ── Get Full Ordering Question (Question + Items + All Translations + Coverage) ──
export async function getFullById(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: question, error: qErr } = await supabase.from('ordering_questions').select('*').eq('id', id).is('deleted_at', null).single();
    if (qErr || !question) return err(res, 'Ordering question not found', 404);

    // Get question translations (all languages)
    const { data: qTranslations } = await supabase.from('ordering_question_translations')
      .select('*').eq('ordering_question_id', id).is('deleted_at', null);

    // Get items (ordered by correct_position)
    const { data: items } = await supabase.from('ordering_items')
      .select('*').eq('ordering_question_id', id).is('deleted_at', null)
      .order('correct_position', { ascending: true });

    // Get item translations (all languages)
    const itemIds = (items || []).map((i: any) => i.id);
    let itemTranslations: any[] = [];
    if (itemIds.length > 0) {
      const { data } = await supabase.from('ordering_item_translations')
        .select('*').in('ordering_item_id', itemIds).is('deleted_at', null);
      itemTranslations = data || [];
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
      has_item_translations: itemTranslations.some((it: any) => it.language_id === lang.id),
    }));

    // Enrich items with their translations
    const enrichedItems = (items || []).map((item: any) => ({
      ...item,
      translations: itemTranslations.filter((it: any) => it.ordering_item_id === item.id),
    }));

    return ok(res, {
      ...question,
      question_translations: qTranslations || [],
      items: enrichedItems,
      translation_coverage: coverage,
    });
  } catch (error: any) {
    return err(res, error.message || 'Failed to get full ordering question', 500);
  }
}
