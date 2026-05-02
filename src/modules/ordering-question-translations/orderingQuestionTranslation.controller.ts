import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'ordering_question_translations:all';
const clearCache = async (questionId?: number) => {
  await redis.del(CACHE_KEY);
  if (questionId) await redis.del(`ordering_question_translations:question:${questionId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['ordering_question_id', 'language_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('ordering_question_translations').select('*, ordering_questions(code, slug), languages(name, native_name, iso_code)', { count: 'exact' });

  if (search) q = q.ilike('question_text', `%${search}%`);
  if (req.query.ordering_question_id) q = q.eq('ordering_question_id', parseInt(req.query.ordering_question_id as string));
  if (req.query.language_id) q = q.eq('language_id', parseInt(req.query.language_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  if (req.query.show_deleted === 'true') {
    q = q.eq('is_deleted', true);
  } else {
    q = q.eq('is_deleted', false);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('ordering_question_translations').select('*, ordering_questions(code, slug), languages(name, native_name, iso_code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Ordering question translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'ordering_question_translation', 'activate')) {
    return err(res, 'Permission denied: ordering_question_translation:activate required to create inactive', 403);
  }

  // Verify question exists
  const { data: question } = await supabase.from('ordering_questions').select('id, code, slug').eq('id', body.ordering_question_id).single();
  if (!question) return err(res, 'Ordering question not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('ordering_question_translations').insert(body).select('*, ordering_questions(code, slug), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this question and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.ordering_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_translation_created', targetType: 'ordering_question_translation', targetId: data.id, targetName: `Q${body.ordering_question_id}-${lang.iso_code}`, ip: getClientIp(req) });
  return ok(res, data, 'Ordering question translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_question_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Ordering question translation not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'ordering_question_translation', 'activate')) {
      return err(res, 'Permission denied: ordering_question_translation:activate required to change active status', 403);
    }
  }

  if (updates.ordering_question_id && updates.ordering_question_id !== old.ordering_question_id) {
    const { data: question } = await supabase.from('ordering_questions').select('id').eq('id', updates.ordering_question_id).single();
    if (!question) return err(res, 'Ordering question not found', 404);
  }

  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('ordering_question_translations').update(updates).eq('id', id).select('*, ordering_questions(code, slug), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this question and language already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') {
      // skip
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.ordering_question_id);
  if (updates.ordering_question_id && updates.ordering_question_id !== old.ordering_question_id) await clearCache(updates.ordering_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_translation_updated', targetType: 'ordering_question_translation', targetId: id, targetName: `Q${old.ordering_question_id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Ordering question translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_question_translations').select('ordering_question_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Ordering question translation not found', 404);
  if (old.is_deleted) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('ordering_question_translations')
    .update({ is_deleted: true, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.ordering_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_translation_soft_deleted', targetType: 'ordering_question_translation', targetId: id, targetName: `Q${old.ordering_question_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Ordering question translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_question_translations').select('ordering_question_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Ordering question translation not found', 404);
  if (!old.is_deleted) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('ordering_question_translations')
    .update({ is_deleted: false, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.ordering_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_translation_restored', targetType: 'ordering_question_translation', targetId: id, targetName: `Q${old.ordering_question_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Ordering question translation restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_question_translations').select('ordering_question_id').eq('id', id).single();
  if (!old) return err(res, 'Ordering question translation not found', 404);

  const { error: e } = await supabase.from('ordering_question_translations').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.ordering_question_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_question_translation_deleted', targetType: 'ordering_question_translation', targetId: id, targetName: `Q${old.ordering_question_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Ordering question translation permanently deleted');
}

export async function coverage(req: Request, res: Response) {
  const questionId = req.query.ordering_question_id ? parseInt(req.query.ordering_question_id as string) : undefined;
  let q = supabase.from('ordering_question_translations').select('language_id, languages(name, native_name, iso_code)').eq('is_deleted', false);
  if (questionId) q = q.eq('ordering_question_id', questionId);
  const { data, error: e } = await q;
  if (e) return err(res, e.message, 500);
  const map: Record<number, { count: number; language: any }> = {};
  for (const row of (data || [])) {
    if (!map[row.language_id]) map[row.language_id] = { count: 0, language: (row as any).languages };
    map[row.language_id].count++;
  }
  return ok(res, Object.entries(map).map(([lid, v]) => ({ language_id: parseInt(lid), ...v })));
}
