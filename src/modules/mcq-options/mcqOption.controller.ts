import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { deleteImage } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

const CACHE_KEY = 'mcq_options:all';
const clearCache = async (questionId?: number) => {
  await redis.del(CACHE_KEY);
  if (questionId) await redis.del(`mcq_options:question:${questionId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_correct === 'string') body.is_correct = body.is_correct === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.mcq_question_id === 'string') {
    body.mcq_question_id = body.mcq_question_id === '' || body.mcq_question_id === 'null' ? null : parseInt(body.mcq_question_id) || null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('mcq_options').select('*', { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.mcq_question_id) q = q.eq('mcq_question_id', parseInt(req.query.mcq_question_id as string));
  if (req.query.is_correct === 'true') q = q.eq('is_correct', true);
  else if (req.query.is_correct === 'false') q = q.eq('is_correct', false);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation (option_text) for display
  const optionIds = (data || []).map((o: any) => o.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishMap: Record<number, string> = {};
  if (optionIds.length > 0) {
    let tQ = supabase.from('mcq_option_translations').select('mcq_option_id, option_text').eq('language_id', 7).in('mcq_option_id', optionIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) englishMap[t.mcq_option_id] = t.option_text;
    }
  }

  // Fetch translation count
  let translationCountMap: Record<number, number> = {};
  if (optionIds.length > 0) {
    let tQ = supabase.from('mcq_option_translations').select('mcq_option_id').in('mcq_option_id', optionIds);
    if (!isTrash) tQ = tQ.is('deleted_at', null);
    const { data: translations } = await tQ;
    if (translations) {
      for (const t of translations) {
        translationCountMap[t.mcq_option_id] = (translationCountMap[t.mcq_option_id] || 0) + 1;
      }
    }
  }

  const enriched = (data || []).map((o: any) => ({
    ...o,
    option_text: englishMap[o.id] || null,
    translation_count: translationCountMap[o.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('mcq_options').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'MCQ option not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'mcq_option', 'activate')) {
    return err(res, 'Permission denied: mcq_option:activate required to create inactive', 403);
  }

  // Verify question exists
  const { data: question } = await supabase.from('mcq_questions').select('id').eq('id', body.mcq_question_id).single();
  if (!question) return err(res, 'MCQ question not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('mcq_options').insert(body).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.mcq_question_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_option_created', targetType: 'mcq_option', targetId: data.id, targetName: `Option-${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'MCQ option created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_options').select('*').eq('id', id).single();
  if (!old) return err(res, 'MCQ option not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'mcq_option', 'activate')) {
      return err(res, 'Permission denied: mcq_option:activate required to change active status', 403);
    }
  }

  if (updates.mcq_question_id && updates.mcq_question_id !== old.mcq_question_id) {
    const { data: question } = await supabase.from('mcq_questions').select('id').eq('id', updates.mcq_question_id).single();
    if (!question) return err(res, 'MCQ question not found', 404);
  }

  updates.updated_by = req.user!.id;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('mcq_options').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.mcq_question_id);
  if (updates.mcq_question_id && updates.mcq_question_id !== old.mcq_question_id) await clearCache(updates.mcq_question_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_option_updated', targetType: 'mcq_option', targetId: id, targetName: `Option-${id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'MCQ option updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_options').select('mcq_question_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'MCQ option not found', 404);
  if (old.deleted_at) return err(res, 'MCQ option is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('mcq_options')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to option translations
  await supabase.from('mcq_option_translations').update({ deleted_at: now, is_active: false }).eq('mcq_option_id', id).is('deleted_at', null);

  await clearCache(old.mcq_question_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_option_soft_deleted', targetType: 'mcq_option', targetId: id, targetName: `Option-${id}`, ip: getClientIp(req) });
  return ok(res, data, 'MCQ option moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('mcq_options').select('mcq_question_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'MCQ option not found', 404);
  if (!old.deleted_at) return err(res, 'MCQ option is not in trash', 400);

  const { data, error: e } = await supabase
    .from('mcq_options')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore option translations
  await supabase.from('mcq_option_translations').update({ deleted_at: null, is_active: true }).eq('mcq_option_id', id).not('deleted_at', 'is', null);

  await clearCache(old.mcq_question_id);
  logAdmin({ actorId: req.user!.id, action: 'mcq_option_restored', targetType: 'mcq_option', targetId: id, targetName: `Option-${id}`, ip: getClientIp(req) });
  return ok(res, data, 'MCQ option restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('mcq_options').select('mcq_question_id').eq('id', id).single();
    if (!old) return err(res, 'MCQ option not found', 404);

    // Cascade permanent delete: delete option translations first (CDN cleanup)
    const { data: optTranslations } = await supabase.from('mcq_option_translations').select('id, image').eq('mcq_option_id', id);
    if (optTranslations) {
      for (const t of optTranslations) {
        if (t.image) { try { await deleteImage(extractBunnyPath(t.image), t.image); } catch {} }
      }
    }
    await supabase.from('mcq_option_translations').delete().eq('mcq_option_id', id);

    // Delete the option
    const { error: e } = await supabase.from('mcq_options').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache(old.mcq_question_id);
    logAdmin({ actorId: req.user!.id, action: 'mcq_option_deleted', targetType: 'mcq_option', targetId: id, targetName: `Option-${id}`, ip: getClientIp(req) });
    return ok(res, null, 'MCQ option permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete MCQ option', 500);
  }
}
