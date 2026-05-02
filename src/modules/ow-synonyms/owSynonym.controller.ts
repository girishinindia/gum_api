import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'ow_synonyms:all';
const clearCache = async (questionId?: number) => {
  await redis.del(CACHE_KEY);
  if (questionId) await redis.del(`ow_synonyms:question:${questionId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.one_word_question_id === 'string') {
    body.one_word_question_id = body.one_word_question_id === '' || body.one_word_question_id === 'null' ? null : parseInt(body.one_word_question_id) || null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('one_word_synonyms').select('*', { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.one_word_question_id) q = q.eq('one_word_question_id', parseInt(req.query.one_word_question_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation (synonym_text) for display
  const synonymIds = (data || []).map((o: any) => o.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishMap: Record<number, string> = {};
  if (synonymIds.length > 0) {
    let tQ = supabase.from('one_word_synonym_translations').select('one_word_synonym_id, synonym_text').eq('language_id', 7).in('one_word_synonym_id', synonymIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) englishMap[t.one_word_synonym_id] = t.synonym_text;
    }
  }

  // Fetch translation count
  let translationCountMap: Record<number, number> = {};
  if (synonymIds.length > 0) {
    let tQ = supabase.from('one_word_synonym_translations').select('one_word_synonym_id').in('one_word_synonym_id', synonymIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) {
        translationCountMap[t.one_word_synonym_id] = (translationCountMap[t.one_word_synonym_id] || 0) + 1;
      }
    }
  }

  const enriched = (data || []).map((o: any) => ({
    ...o,
    synonym_text: englishMap[o.id] || null,
    translation_count: translationCountMap[o.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('one_word_synonyms').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Synonym not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'ow_synonym', 'activate')) {
    return err(res, 'Permission denied: ow_synonym:activate required to create inactive', 403);
  }

  // Verify question exists
  const { data: question } = await supabase.from('one_word_questions').select('id').eq('id', body.one_word_question_id).single();
  if (!question) return err(res, 'One Word question not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('one_word_synonyms').insert(body).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.one_word_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_synonym_created', targetType: 'ow_synonym', targetId: data.id, targetName: `Synonym-${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Synonym created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('one_word_synonyms').select('*').eq('id', id).single();
  if (!old) return err(res, 'Synonym not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'ow_synonym', 'activate')) {
      return err(res, 'Permission denied: ow_synonym:activate required to change active status', 403);
    }
  }

  if (updates.one_word_question_id && updates.one_word_question_id !== old.one_word_question_id) {
    const { data: question } = await supabase.from('one_word_questions').select('id').eq('id', updates.one_word_question_id).single();
    if (!question) return err(res, 'One Word question not found', 404);
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('one_word_synonyms').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.one_word_question_id);
  if (updates.one_word_question_id && updates.one_word_question_id !== old.one_word_question_id) await clearCache(updates.one_word_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_synonym_updated', targetType: 'ow_synonym', targetId: id, targetName: `Synonym-${id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Synonym updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('one_word_synonyms').select('one_word_question_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Synonym not found', 404);
  if (old.deleted_at) return err(res, 'Synonym is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('one_word_synonyms')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to synonym translations
  await supabase.from('one_word_synonym_translations').update({ deleted_at: now, is_active: false }).eq('one_word_synonym_id', id).is('deleted_at', null);

  await clearCache(old.one_word_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_synonym_soft_deleted', targetType: 'ow_synonym', targetId: id, targetName: `Synonym-${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Synonym moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('one_word_synonyms').select('one_word_question_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Synonym not found', 404);
  if (!old.deleted_at) return err(res, 'Synonym is not in trash', 400);

  const { data, error: e } = await supabase
    .from('one_word_synonyms')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore synonym translations
  await supabase.from('one_word_synonym_translations').update({ deleted_at: null, is_active: true }).eq('one_word_synonym_id', id).not('deleted_at', 'is', null);

  await clearCache(old.one_word_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ow_synonym_restored', targetType: 'ow_synonym', targetId: id, targetName: `Synonym-${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Synonym restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('one_word_synonyms').select('one_word_question_id').eq('id', id).single();
    if (!old) return err(res, 'Synonym not found', 404);

    // Cascade permanent delete: delete synonym translations first
    await supabase.from('one_word_synonym_translations').delete().eq('one_word_synonym_id', id);

    // Delete the synonym
    const { error: e } = await supabase.from('one_word_synonyms').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache(old.one_word_question_id);
    logAdmin({ actorId: req.user!.id, action: 'ow_synonym_deleted', targetType: 'ow_synonym', targetId: id, targetName: `Synonym-${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Synonym permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete synonym', 500);
  }
}
