import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'ordering_item_translations:all';
const clearCache = async (itemId?: number) => {
  await redis.del(CACHE_KEY);
  if (itemId) await redis.del(`ordering_item_translations:item:${itemId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['ordering_item_id', 'language_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('ordering_item_translations').select('*, ordering_items(correct_position, ordering_question_id), languages(name, native_name, iso_code)', { count: 'exact' });

  if (search) q = q.ilike('item_text', `%${search}%`);
  if (req.query.ordering_item_id) q = q.eq('ordering_item_id', parseInt(req.query.ordering_item_id as string));
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
  const { data, error: e } = await supabase.from('ordering_item_translations').select('*, ordering_items(correct_position, ordering_question_id), languages(name, native_name, iso_code)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Ordering item translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'ordering_item_translation', 'activate')) {
    return err(res, 'Permission denied: ordering_item_translation:activate required to create inactive', 403);
  }

  // Verify ordering item exists
  const { data: item } = await supabase.from('ordering_items').select('id, correct_position').eq('id', body.ordering_item_id).single();
  if (!item) return err(res, 'Ordering item not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).eq('for_material', true).single();
  if (!lang) return err(res, 'Language not found or not available for material', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('ordering_item_translations').insert(body).select('*, ordering_items(correct_position, ordering_question_id), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this ordering item and language already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.ordering_item_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_item_translation_created', targetType: 'ordering_item_translation', targetId: data.id, targetName: `OI${body.ordering_item_id}-${lang.iso_code}`, ip: getClientIp(req) });
  return ok(res, data, 'Ordering item translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_item_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Ordering item translation not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'ordering_item_translation', 'activate')) {
      return err(res, 'Permission denied: ordering_item_translation:activate required to change active status', 403);
    }
  }

  if (updates.ordering_item_id && updates.ordering_item_id !== old.ordering_item_id) {
    const { data: item } = await supabase.from('ordering_items').select('id').eq('id', updates.ordering_item_id).single();
    if (!item) return err(res, 'Ordering item not found', 404);
  }

  if (updates.language_id && updates.language_id !== old.language_id) {
    const { data: lang } = await supabase.from('languages').select('id').eq('id', updates.language_id).eq('for_material', true).single();
    if (!lang) return err(res, 'Language not found or not available for material', 404);
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('ordering_item_translations').update(updates).eq('id', id).select('*, ordering_items(correct_position, ordering_question_id), languages(name, native_name, iso_code)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation for this ordering item and language already exists', 409);
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

  await clearCache(old.ordering_item_id);
  if (updates.ordering_item_id && updates.ordering_item_id !== old.ordering_item_id) await clearCache(updates.ordering_item_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_item_translation_updated', targetType: 'ordering_item_translation', targetId: id, targetName: `OI${old.ordering_item_id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Ordering item translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_item_translations').select('ordering_item_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Ordering item translation not found', 404);
  if (old.is_deleted) return err(res, 'Translation is already in trash', 400);

  const { data, error: e } = await supabase
    .from('ordering_item_translations')
    .update({ is_deleted: true, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.ordering_item_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_item_translation_soft_deleted', targetType: 'ordering_item_translation', targetId: id, targetName: `OI${old.ordering_item_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Ordering item translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('ordering_item_translations').select('ordering_item_id, is_deleted').eq('id', id).single();
  if (!old) return err(res, 'Ordering item translation not found', 404);
  if (!old.is_deleted) return err(res, 'Translation is not in trash', 400);

  const { data, error: e } = await supabase
    .from('ordering_item_translations')
    .update({ is_deleted: false, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.ordering_item_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_item_translation_restored', targetType: 'ordering_item_translation', targetId: id, targetName: `OI${old.ordering_item_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Ordering item translation restored');
}

export async function coverage(req: Request, res: Response) {
  const itemId = req.query.ordering_item_id ? parseInt(req.query.ordering_item_id as string) : undefined;
  let q = supabase.from('ordering_item_translations').select('language_id, languages(name, native_name, iso_code)').eq('is_deleted', false);
  if (itemId) q = q.eq('ordering_item_id', itemId);
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
  const { data: old } = await supabase.from('ordering_item_translations').select('ordering_item_id').eq('id', id).single();
  if (!old) return err(res, 'Ordering item translation not found', 404);

  const { error: e } = await supabase.from('ordering_item_translations').delete().eq('id', id);
  if (e) {
    if (e.code === '23503') return err(res, 'Cannot delete: record is referenced by other data', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.ordering_item_id);
  logAdmin({ actorId: req.user!.id, action: 'ordering_item_translation_deleted', targetType: 'ordering_item_translation', targetId: id, targetName: `OI${old.ordering_item_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Ordering item translation permanently deleted');
}
