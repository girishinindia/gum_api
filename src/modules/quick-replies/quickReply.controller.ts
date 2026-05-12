import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';

const TABLE = 'quick_replies';
const CACHE_KEY = 'quick_replies:all';
const FK_SELECT = '*, users!quick_replies_user_id_fkey(id, first_name, last_name, email)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  for (const k of ['user_id', 'display_order']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ── GET /quick-replies ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });
  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);

  if (search) q = applySearch(q, search, { ilike: ['title', 'shortcut', 'content'] });
  if (req.query.scope) q = q.eq('scope', req.query.scope as string);
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /quick-replies/:id ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Quick reply not found', 404);
  return ok(res, data);
}

// ── POST /quick-replies ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.title?.trim()) return err(res, 'Title is required', 400);
  if (!body.content?.trim()) return err(res, 'Content is required', 400);

  // Global quick replies don't have a user_id; personal ones do
  if (body.scope === 'personal' && !body.user_id) {
    body.user_id = req.user!.id;
  }

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'quick_reply_created', targetType: 'quick_reply', targetId: data.id, targetName: body.title, ip: getClientIp(req) });
  return ok(res, data, 'Quick reply created', 201);
}

// ── PATCH /quick-replies/:id ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Quick reply not found', 404);

  const body = parseBody(req);
  const { data, error: e } = await supabase.from(TABLE).update(body).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'quick_reply_updated', targetType: 'quick_reply', targetId: id, targetName: body.title || old.title, ip: getClientIp(req) });
  return ok(res, data, 'Quick reply updated');
}

// ── DELETE /quick-replies/:id (soft) ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Quick reply not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'quick_reply_soft_deleted', targetType: 'quick_reply', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Quick reply moved to trash');
}

// ── PATCH /quick-replies/:id/restore ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Quick reply not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null }).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'quick_reply_restored', targetType: 'quick_reply', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Quick reply restored');
}

// ── DELETE /quick-replies/:id/permanent ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('title').eq('id', id).single();
  if (!old) return err(res, 'Quick reply not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'quick_reply_deleted', targetType: 'quick_reply', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, null, 'Quick reply permanently deleted');
}
