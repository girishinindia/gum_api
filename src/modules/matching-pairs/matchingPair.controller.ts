import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'matching_pairs:all';
const clearCache = async (questionId?: number) => {
  await redis.del(CACHE_KEY);
  if (questionId) await redis.del(`matching_pairs:question:${questionId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.matching_question_id === 'string') {
    body.matching_question_id = body.matching_question_id === '' || body.matching_question_id === 'null' ? null : parseInt(body.matching_question_id) || null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('matching_pairs').select('*', { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.matching_question_id) q = q.eq('matching_question_id', parseInt(req.query.matching_question_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation (left_text, right_text) for display
  const pairIds = (data || []).map((o: any) => o.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishMap: Record<number, { left_text: string | null; right_text: string | null }> = {};
  if (pairIds.length > 0) {
    let tQ = supabase.from('matching_pair_translations').select('matching_pair_id, left_text, right_text').eq('language_id', 7).in('matching_pair_id', pairIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) englishMap[t.matching_pair_id] = { left_text: t.left_text, right_text: t.right_text };
    }
  }

  // Fetch translation count
  let translationCountMap: Record<number, number> = {};
  if (pairIds.length > 0) {
    let tQ = supabase.from('matching_pair_translations').select('matching_pair_id').in('matching_pair_id', pairIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) {
        translationCountMap[t.matching_pair_id] = (translationCountMap[t.matching_pair_id] || 0) + 1;
      }
    }
  }

  const enriched = (data || []).map((o: any) => ({
    ...o,
    left_text: englishMap[o.id]?.left_text || null,
    right_text: englishMap[o.id]?.right_text || null,
    translation_count: translationCountMap[o.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('matching_pairs').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Matching pair not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'matching_pair', 'activate')) {
    return err(res, 'Permission denied: matching_pair:activate required to create inactive', 403);
  }

  // Verify question exists
  const { data: question } = await supabase.from('matching_questions').select('id').eq('id', body.matching_question_id).single();
  if (!question) return err(res, 'Matching question not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('matching_pairs').insert(body).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.matching_question_id);
  logAdmin({ actorId: req.user!.id, action: 'matching_pair_created', targetType: 'matching_pair', targetId: data.id, targetName: `MatchingPair-${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Matching pair created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('matching_pairs').select('*').eq('id', id).single();
  if (!old) return err(res, 'Matching pair not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'matching_pair', 'activate')) {
      return err(res, 'Permission denied: matching_pair:activate required to change active status', 403);
    }
  }

  if (updates.matching_question_id && updates.matching_question_id !== old.matching_question_id) {
    const { data: question } = await supabase.from('matching_questions').select('id').eq('id', updates.matching_question_id).single();
    if (!question) return err(res, 'Matching question not found', 404);
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('matching_pairs').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.matching_question_id);
  if (updates.matching_question_id && updates.matching_question_id !== old.matching_question_id) await clearCache(updates.matching_question_id);
  logAdmin({ actorId: req.user!.id, action: 'matching_pair_updated', targetType: 'matching_pair', targetId: id, targetName: `MatchingPair-${id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Matching pair updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('matching_pairs').select('matching_question_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Matching pair not found', 404);
  if (old.deleted_at) return err(res, 'Matching pair is already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from('matching_pairs')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to matching pair translations
  await supabase.from('matching_pair_translations').update({ deleted_at: now, is_active: false }).eq('matching_pair_id', id).is('deleted_at', null);

  await clearCache(old.matching_question_id);
  logAdmin({ actorId: req.user!.id, action: 'matching_pair_soft_deleted', targetType: 'matching_pair', targetId: id, targetName: `MatchingPair-${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Matching pair moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('matching_pairs').select('matching_question_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Matching pair not found', 404);
  if (!old.deleted_at) return err(res, 'Matching pair is not in trash', 400);

  const { data, error: e } = await supabase
    .from('matching_pairs')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore matching pair translations
  await supabase.from('matching_pair_translations').update({ deleted_at: null, is_active: true }).eq('matching_pair_id', id).not('deleted_at', 'is', null);

  await clearCache(old.matching_question_id);
  logAdmin({ actorId: req.user!.id, action: 'matching_pair_restored', targetType: 'matching_pair', targetId: id, targetName: `MatchingPair-${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Matching pair restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('matching_pairs').select('matching_question_id').eq('id', id).single();
    if (!old) return err(res, 'Matching pair not found', 404);

    // Cascade permanent delete: delete matching pair translations first
    await supabase.from('matching_pair_translations').delete().eq('matching_pair_id', id);

    // Delete the matching pair
    const { error: e } = await supabase.from('matching_pairs').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache(old.matching_question_id);
    logAdmin({ actorId: req.user!.id, action: 'matching_pair_deleted', targetType: 'matching_pair', targetId: id, targetName: `MatchingPair-${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Matching pair permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete matching pair', 500);
  }
}
