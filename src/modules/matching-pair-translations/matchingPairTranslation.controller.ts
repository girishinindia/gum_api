import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'matching_pair_translations:all';
const clearCache = async (pairId?: number) => {
  await redis.del(CACHE_KEY);
  if (pairId) await redis.del(`matching_pair_translations:pair:${pairId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['matching_pair_id', 'language_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('matching_pair_translations').select('*, matching_pairs(display_order, matching_question_id), languages(name, native_name, iso_code)', { count: 'exact' });

  if (search) q = q.or(`left_text.ilike.%${search}%,right_text.ilike.%${search}%`);
  if (req.query.matching_pair_id) q = q.eq('matching_pair_id', parseInt(req.query.matching_pair_id as string));
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
  const { data, error: e } = await supabase.from('matching_pair_translations').select('*, matching_pairs(display_order, matching_question_id), languages(name, native_name, iso_code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Matching pair translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'matching_pair_translation', 'activate')) {
    return err(res, 'Permission denied: matching_pair_translation:activate required to create inactive', 403);
  }

  // Verify matching pair exists
  const { data: pair } = await supabase.from('matching_pairs').select('id, display_order').eq('id', body.matching_pair_id).single();
  if (!pair) return err(res, 'Matching pair not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('matching_pair_translations').insert(body).select('*, matching_pairs(display_order, matching_question_id), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this matching pair and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.matching_pair_id);
  logAdmin({ actorId: req.user!.id, action: 'matching_pair_translation_created', targetType: 'matching_pair_translation', targetId: data.id, targetName: `MP${body.matching_pair_id}-${lang.iso_code}`, ip: getClientIp(req) });
  return ok(res, data, 'Matching pair translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('matching_pair_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Matching pair translation not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'matching_pair_translation', 'activate')) {
      return err(res, 'Permission denied: matching_pair_translation:activate required to change active status', 403);
    }
  }

  if (updates.matching_pair_id && updates.matching_pair_id !== old.matching_pair_id) {
    const { data: pair } = await supabase.from('matching_pairs').select('id').eq('id', updates.matching_pair_id).single();
    if (!pair) return err(res, 'Matching pair not found', 404);
  }

  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('matching_pair_translations').update(updates).eq('id', id).select('*, matching_pairs(display_order, matching_question_id), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this matching pair and language already exists', 409);
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

  await clearCache(old.matching_pair_id);
  if (updates.matching_pair_id && updates.matching_pair_id !== old.matching_pair_id) await clearCache(updates.matching_pair_id);
  logAdmin({ actorId: req.user!.id, action: 'matching_pair_translation_updated', targetType: 'matching_pair_translation', targetId: id, targetName: `MP${old.matching_pair_id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Matching pair translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('matching_pair_translations').select('matching_pair_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Matching pair translation not found', 404);
  if (old.is_deleted) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('matching_pair_translations')
    .update({ is_deleted: true, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.matching_pair_id);
  logAdmin({ actorId: req.user!.id, action: 'matching_pair_translation_soft_deleted', targetType: 'matching_pair_translation', targetId: id, targetName: `MP${old.matching_pair_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Matching pair translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('matching_pair_translations').select('matching_pair_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Matching pair translation not found', 404);
  if (!old.is_deleted) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('matching_pair_translations')
    .update({ is_deleted: false, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.matching_pair_id);
  logAdmin({ actorId: req.user!.id, action: 'matching_pair_translation_restored', targetType: 'matching_pair_translation', targetId: id, targetName: `MP${old.matching_pair_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Matching pair translation restored');
}

export async function coverage(req: Request, res: Response) {
  const pairId = req.query.matching_pair_id ? parseInt(req.query.matching_pair_id as string) : undefined;
  let q = supabase.from('matching_pair_translations').select('language_id, languages(name, native_name, iso_code)').eq('is_deleted', false);
  if (pairId) q = q.eq('matching_pair_id', pairId);
  const { data, error: e } = await q;
  if (e) return err(res, e.message, 500);
  const map: Record<number, { count: number; language: any }> = {};
  for (const row of (data || [])) {
    if (!map[row.language_id]) map[row.language_id] = { count: 0, language: (row as any).languages };
    map[row.language_id].count++;
  }
  return ok(res, Object.entries(map).map(([lid, v]) => ({ language_id: parseInt(lid), ...v })));
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('matching_pair_translations').select('matching_pair_id').eq('id', id).single();
  if (!old) return err(res, 'Matching pair translation not found', 404);

  const { error: e } = await supabase.from('matching_pair_translations').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.matching_pair_id);
  logAdmin({ actorId: req.user!.id, action: 'matching_pair_translation_deleted', targetType: 'matching_pair_translation', targetId: id, targetName: `MP${old.matching_pair_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Matching pair translation permanently deleted');
}
