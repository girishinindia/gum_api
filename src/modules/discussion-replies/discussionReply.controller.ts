import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'discussion_replies';
const CACHE_KEY = 'discussion_replies:all';

const clearCache = async (threadId?: number) => {
  await redis.del(CACHE_KEY);
  if (threadId) await redis.del(`discussion_replies:thread:${threadId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_accepted_answer === 'string') body.is_accepted_answer = body.is_accepted_answer === 'true';
  if (typeof body.is_instructor_reply === 'string') body.is_instructor_reply = body.is_instructor_reply === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['thread_id', 'parent_reply_id', 'author_id', 'upvote_count']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = '*, users!discussion_replies_author_id_fkey(id, first_name, last_name, email), discussion_threads!discussion_replies_thread_id_fkey(id, title)';

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['body'] });
  if (req.query.thread_id) q = q.eq('thread_id', parseInt(req.query.thread_id as string));
  if (req.query.parent_reply_id) q = q.eq('parent_reply_id', parseInt(req.query.parent_reply_id as string));
  if (req.query.author_id) q = q.eq('author_id', parseInt(req.query.author_id as string));
  if (req.query.is_accepted_answer === 'true') q = q.eq('is_accepted_answer', true);
  else if (req.query.is_accepted_answer === 'false') q = q.eq('is_accepted_answer', false);
  if (req.query.is_instructor_reply === 'true') q = q.eq('is_instructor_reply', true);
  else if (req.query.is_instructor_reply === 'false') q = q.eq('is_instructor_reply', false);

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
  if (e || !data) return err(res, 'Discussion reply not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  body.created_by = req.user!.id;

  // Verify thread exists
  if (body.thread_id) {
    const { data: thread } = await supabase.from('discussion_threads').select('id').eq('id', body.thread_id).single();
    if (!thread) return err(res, 'Discussion thread not found', 404);
  }

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Update thread: increment reply_count, set last_reply_at and last_reply_by
  if (body.thread_id) {
    await supabase.rpc('increment_field', { table_name: 'discussion_threads', row_id: body.thread_id, field_name: 'reply_count', amount: 1 }).maybeSingle();
    await supabase
      .from('discussion_threads')
      .update({ last_reply_at: new Date().toISOString(), last_reply_by: body.author_id })
      .eq('id', body.thread_id);
  }

  await clearCache(body.thread_id);
  logAdmin({ actorId: req.user!.id, action: 'discussion_reply_created', targetType: 'discussion_reply', targetId: data.id, targetName: `Reply to thread #${body.thread_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Discussion reply created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Discussion reply not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.thread_id);
  logAdmin({ actorId: req.user!.id, action: 'discussion_reply_updated', targetType: 'discussion_reply', targetId: id, targetName: `Reply to thread #${old.thread_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Discussion reply updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('thread_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Discussion reply not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.thread_id);
  logAdmin({ actorId: req.user!.id, action: 'discussion_reply_soft_deleted', targetType: 'discussion_reply', targetId: id, targetName: `Reply to thread #${old.thread_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Discussion reply moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('thread_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Discussion reply not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.thread_id);
  logAdmin({ actorId: req.user!.id, action: 'discussion_reply_restored', targetType: 'discussion_reply', targetId: id, targetName: `Reply to thread #${old.thread_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Discussion reply restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('thread_id').eq('id', id).single();
  if (!old) return err(res, 'Discussion reply not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.thread_id);
  logAdmin({ actorId: req.user!.id, action: 'discussion_reply_deleted', targetType: 'discussion_reply', targetId: id, targetName: `Reply to thread #${old.thread_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Discussion reply permanently deleted');
}

export async function acceptAnswer(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('thread_id').eq('id', id).single();
  if (!old) return err(res, 'Discussion reply not found', 404);

  // Mark this reply as accepted answer
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ is_accepted_answer: true, updated_by: req.user!.id })
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  // Mark the parent thread as answered
  await supabase
    .from('discussion_threads')
    .update({ is_answered: true })
    .eq('id', old.thread_id);

  await clearCache(old.thread_id);
  logAdmin({ actorId: req.user!.id, action: 'discussion_reply_accepted', targetType: 'discussion_reply', targetId: id, targetName: `Reply to thread #${old.thread_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Reply accepted as answer');
}
