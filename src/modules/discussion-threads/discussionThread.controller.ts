import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'discussion_threads';
const CACHE_KEY = 'discussion_threads:all';

const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_pinned === 'string') body.is_pinned = body.is_pinned === 'true';
  if (typeof body.is_answered === 'string') body.is_answered = body.is_answered === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['item_id', 'author_id', 'reply_count', 'upvote_count', 'view_count', 'last_reply_by']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = '*, users!discussion_threads_author_id_fkey(id, first_name, last_name, email)';

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['title', 'body'] });
  if (req.query.item_type) q = q.eq('item_type', req.query.item_type as string);
  if (req.query.item_id) q = q.eq('item_id', parseInt(req.query.item_id as string));
  if (req.query.author_id) q = q.eq('author_id', parseInt(req.query.author_id as string));
  if (req.query.thread_status) q = q.eq('thread_status', req.query.thread_status as string);
  if (req.query.is_pinned === 'true') q = q.eq('is_pinned', true);
  else if (req.query.is_pinned === 'false') q = q.eq('is_pinned', false);
  if (req.query.is_answered === 'true') q = q.eq('is_answered', true);
  else if (req.query.is_answered === 'false') q = q.eq('is_answered', false);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Discussion thread not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'discussion_thread_created', targetType: 'discussion_thread', targetId: data.id, targetName: body.title, ip: getClientIp(req) });
  return ok(res, data, 'Discussion thread created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Discussion thread not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'discussion_thread_updated', targetType: 'discussion_thread', targetId: id, targetName: updates.title || old.title, ip: getClientIp(req) });
  return ok(res, data, 'Discussion thread updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Discussion thread not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'discussion_thread_soft_deleted', targetType: 'discussion_thread', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Discussion thread moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Discussion thread not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'discussion_thread_restored', targetType: 'discussion_thread', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Discussion thread restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Discussion thread not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'discussion_thread_deleted', targetType: 'discussion_thread', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, null, 'Discussion thread permanently deleted');
}

export async function closeThread(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Discussion thread not found', 404);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ thread_status: 'closed', updated_by: req.user!.id })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'discussion_thread_closed', targetType: 'discussion_thread', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Discussion thread closed');
}

export async function resolveThread(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Discussion thread not found', 404);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ thread_status: 'resolved', is_answered: true, updated_by: req.user!.id })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'discussion_thread_resolved', targetType: 'discussion_thread', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Discussion thread resolved');
}

export async function pinThread(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, is_pinned').eq('id', id).single();
  if (!old) return err(res, 'Discussion thread not found', 404);

  const newPinned = !old.is_pinned;
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ is_pinned: newPinned, updated_by: req.user!.id })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'discussion_thread_pinned', targetType: 'discussion_thread', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, newPinned ? 'Discussion thread pinned' : 'Discussion thread unpinned');
}
