import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'ticket_messages';
const CACHE_KEY = 'ticket_messages:all';

const FK_SELECT = `*, users!ticket_messages_sender_id_fkey(id, first_name, last_name, email)`;

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_internal === 'string') body.is_internal = body.is_internal === 'true';
  for (const k of ['ticket_id', 'sender_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /ticket-messages
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  if (!req.query.ticket_id) return err(res, 'ticket_id is required', 400);

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  q = q.eq('ticket_id', parseInt(req.query.ticket_id as string));

  if (search) q = applySearch(q, search, { ilike: ['message'] });

  if (req.query.sender_type) q = q.eq('sender_type', req.query.sender_type as string);
  if (req.query.is_internal === 'true') q = q.eq('is_internal', true);
  else if (req.query.is_internal === 'false') q = q.eq('is_internal', false);

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

// GET /ticket-messages/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Ticket message not found', 404);
  return ok(res, data);
}

// POST /ticket-messages
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (!body.ticket_id) return err(res, 'ticket_id is required', 400);

  // Set sender from current user
  body.sender_id = req.user!.id;
  body.sender_type = 'admin';
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Update the parent ticket's updated_at
  await supabase.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', body.ticket_id);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_message_created', targetType: 'ticket_message', targetId: data.id, targetName: `Message #${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Message sent', 201);
}

// PATCH /ticket-messages/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Ticket message not found', 404);

  const updates = parseBody(req);
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);
  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_message_updated', targetType: 'ticket_message', targetId: id, targetName: `Message #${id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Message updated');
}

// DELETE /ticket-messages/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Ticket message not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_message_soft_deleted', targetType: 'ticket_message', targetId: id, targetName: `Message #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Message moved to trash');
}

// PATCH /ticket-messages/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id, ticket_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Ticket message not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  // Block restore if parent ticket is deleted
  const { data: parent } = await supabase.from('support_tickets').select('deleted_at').eq('id', old.ticket_id).single();
  if (parent?.deleted_at) return err(res, 'Cannot restore: parent ticket is in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_message_restored', targetType: 'ticket_message', targetId: id, targetName: `Message #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Message restored');
}

// DELETE /ticket-messages/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Ticket message not found', 404);

  // Cascade delete attachments for this message
  await supabase.from('ticket_attachments').delete().eq('message_id', id);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) {
    if (e.message?.includes('violates foreign key constraint')) return err(res, 'Cannot delete — this record is in use. Remove referencing records first.', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_message_deleted', targetType: 'ticket_message', targetId: id, targetName: `Message #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Message permanently deleted');
}
