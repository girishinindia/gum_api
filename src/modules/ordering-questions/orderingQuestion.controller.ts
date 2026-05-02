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
    q = q.eq('is_deleted', true);
  } else {
    q = q.eq('is_deleted', false);
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
    if (!isTrash) tQ = tQ.eq('is_deleted', false);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) englishMap[t.ordering_question_id] = { question_text: t.question_text };
    }
  }

  // Fetch translation count
  let translationCountMap: Record<number, number> = {};
  if (questionIds.length > 0) {
    let tQ = supabase.from('ordering_question_translations').select('ordering_question_id').in('ordering_question_id', questionIds);
    if (!isTrash) tQ = tQ.eq('is_deleted', false);
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
    if (!isTrash) iQ = iQ.eq('is_deleted', false);
    const { data: items } = await iQ;
    if (items) {
      for (const i of items) {
        itemCountMap[i.ordering_question_id] = (itemCountMap[i.ordering_question_id] || 0) + 1;
      }
    }
  }

  const enriched = (data || []).map((q: any) => ({
    ...q,
    question_text: englishMap[q.id]?.question_text || null,
    translation_count: translationCountMap[q.id] || 0,
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
  const { data: old } = await supabase.from('ordering_questions').select('code, slug, topic_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Ordering question not found', 404);
  if (old.is_deleted) return err(res, 'Ordering question is already in trash', 400);

  const { data, error: e } = await supabase
    .from('ordering_questions')
    .update({ is_deleted: true, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to translations
  await supabase.from('ordering_question_translations').update({ is_deleted: true, is_active: false }).eq('ordering_question_id', id).eq('is_deleted', false);

  // Cascade soft-delete to items
  const { data: items } = await supabase.from('ordering_items').select('id').eq('ordering_question_id', id).eq('is_deleted', false);
  if (items && items.length > 0) {
    const itemIds = items.map((i: any) => i.id);
    await supabase.from('ordering_items').update({ is_deleted: true, is_active: false }).in('id', itemIds);
    // Cascade to item translations
    await supabase.from('ordering_item_translations').update({ is_deleted: true, is_active: false }).in('ordering_item_id', itemIds).eq('is_deleted', false);
  }

  await clearCache(old.topic_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_soft_deleted', targetType: 'ordering_question', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Ordering question moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_questions').select('code, slug, topic_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Ordering question not found', 404);
  if (!old.is_deleted) return err(res, 'Ordering question is not in trash', 400);

  const { data, error: e } = await supabase
    .from('ordering_questions')
    .update({ is_deleted: false, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore translations
  await supabase.from('ordering_question_translations').update({ is_deleted: false, is_active: true }).eq('ordering_question_id', id).eq('is_deleted', true);

  // Cascade restore items + item translations
  const { data: items } = await supabase.from('ordering_items').select('id').eq('ordering_question_id', id).eq('is_deleted', true);
  if (items && items.length > 0) {
    const itemIds = items.map((i: any) => i.id);
    await supabase.from('ordering_items').update({ is_deleted: false, is_active: true }).in('id', itemIds);
    await supabase.from('ordering_item_translations').update({ is_deleted: false, is_active: true }).in('ordering_item_id', itemIds).eq('is_deleted', true);
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
