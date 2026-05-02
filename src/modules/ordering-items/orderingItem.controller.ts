import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'ordering_items:all';
const clearCache = async (questionId?: number) => {
  await redis.del(CACHE_KEY);
  if (questionId) await redis.del(`ordering_items:question:${questionId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.correct_position === 'string') body.correct_position = parseInt(body.correct_position) || 1;
  if (typeof body.ordering_question_id === 'string') {
    body.ordering_question_id = body.ordering_question_id === '' || body.ordering_question_id === 'null' ? null : parseInt(body.ordering_question_id) || null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'correct_position' });

  let q = supabase.from('ordering_items').select('*', { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.eq('is_deleted', true);
  } else {
    q = q.eq('is_deleted', false);
  }

  // Filters
  if (req.query.ordering_question_id) q = q.eq('ordering_question_id', parseInt(req.query.ordering_question_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation (item_text) for display
  const itemIds = (data || []).map((o: any) => o.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishMap: Record<number, { item_text: string | null }> = {};
  if (itemIds.length > 0) {
    let tQ = supabase.from('ordering_item_translations').select('ordering_item_id, item_text').eq('language_id', 7).in('ordering_item_id', itemIds);
    if (!isTrash) tQ = tQ.eq('is_deleted', false);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) englishMap[t.ordering_item_id] = { item_text: t.item_text };
    }
  }

  // Fetch translation count
  let translationCountMap: Record<number, number> = {};
  if (itemIds.length > 0) {
    let tQ = supabase.from('ordering_item_translations').select('ordering_item_id').in('ordering_item_id', itemIds);
    if (!isTrash) tQ = tQ.eq('is_deleted', false);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) {
        translationCountMap[t.ordering_item_id] = (translationCountMap[t.ordering_item_id] || 0) + 1;
      }
    }
  }

  const enriched = (data || []).map((o: any) => ({
    ...o,
    item_text: englishMap[o.id]?.item_text || null,
    translation_count: translationCountMap[o.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('ordering_items').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Ordering item not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'ordering_item', 'activate')) {
    return err(res, 'Permission denied: ordering_item:activate required to create inactive', 403);
  }

  // Verify question exists
  const { data: question } = await supabase.from('ordering_questions').select('id').eq('id', body.ordering_question_id).single();
  if (!question) return err(res, 'Ordering question not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('ordering_items').insert(body).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.ordering_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_item_created', targetType: 'ordering_item', targetId: data.id, targetName: `OrderingItem-${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Ordering item created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_items').select('*').eq('id', id).single();
  if (!old) return err(res, 'Ordering item not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'ordering_item', 'activate')) {
      return err(res, 'Permission denied: ordering_item:activate required to change active status', 403);
    }
  }

  if (updates.ordering_question_id && updates.ordering_question_id !== old.ordering_question_id) {
    const { data: question } = await supabase.from('ordering_questions').select('id').eq('id', updates.ordering_question_id).single();
    if (!question) return err(res, 'Ordering question not found', 404);
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('ordering_items').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.ordering_question_id);
  if (updates.ordering_question_id && updates.ordering_question_id !== old.ordering_question_id) await clearCache(updates.ordering_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_item_updated', targetType: 'ordering_item', targetId: id, targetName: `OrderingItem-${id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Ordering item updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_items').select('ordering_question_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Ordering item not found', 404);
  if (old.is_deleted) return err(res, 'Ordering item is already in trash', 400);

  const { data, error: e } = await supabase
    .from('ordering_items')
    .update({ is_deleted: true, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to ordering item translations
  await supabase.from('ordering_item_translations').update({ is_deleted: true, is_active: false }).eq('ordering_item_id', id).eq('is_deleted', false);

  await clearCache(old.ordering_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_item_soft_deleted', targetType: 'ordering_item', targetId: id, targetName: `OrderingItem-${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Ordering item moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_items').select('ordering_question_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Ordering item not found', 404);
  if (!old.is_deleted) return err(res, 'Ordering item is not in trash', 400);

  const { data, error: e } = await supabase
    .from('ordering_items')
    .update({ is_deleted: false, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore ordering item translations
  await supabase.from('ordering_item_translations').update({ is_deleted: false, is_active: true }).eq('ordering_item_id', id).eq('is_deleted', true);

  await clearCache(old.ordering_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_item_restored', targetType: 'ordering_item', targetId: id, targetName: `OrderingItem-${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Ordering item restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('ordering_items').select('ordering_question_id').eq('id', id).single();
    if (!old) return err(res, 'Ordering item not found', 404);

    // Cascade permanent delete: delete ordering item translations first
    await supabase.from('ordering_item_translations').delete().eq('ordering_item_id', id);

    // Delete the ordering item
    const { error: e } = await supabase.from('ordering_items').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache(old.ordering_question_id);
    logAdmin({ actorId: req.user!.id, action: 'ordering_item_deleted', targetType: 'ordering_item', targetId: id, targetName: `OrderingItem-${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Ordering item permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete ordering item', 500);
  }
}
