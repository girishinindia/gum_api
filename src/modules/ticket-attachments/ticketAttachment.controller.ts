import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'ticket_attachments';
const CACHE_KEY = 'ticket_attachments:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['ticket_id', 'message_id', 'file_size', 'uploaded_by']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /ticket-attachments
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select('*', { count: 'exact' });

  if (req.query.ticket_id) q = q.eq('ticket_id', parseInt(req.query.ticket_id as string));
  if (req.query.message_id) q = q.eq('message_id', parseInt(req.query.message_id as string));
  if (req.query.file_type) q = q.eq('file_type', req.query.file_type as string);

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

// GET /ticket-attachments/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Ticket attachment not found', 404);
  return ok(res, data);
}

// POST /ticket-attachments
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (!body.ticket_id) return err(res, 'ticket_id is required', 400);

  // Set uploaded_by from current user
  body.uploaded_by = req.user!.id;
  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_attachment_created', targetType: 'ticket_attachment', targetId: data.id, targetName: data.file_name || `Attachment #${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Attachment created', 201);
}

// DELETE /ticket-attachments/:id (permanent only)
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id, file_name').eq('id', id).single();
  if (!old) return err(res, 'Ticket attachment not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) {
    if (e.message?.includes('violates foreign key constraint')) return err(res, 'Cannot delete — this record is in use. Remove referencing records first.', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_attachment_deleted', targetType: 'ticket_attachment', targetId: id, targetName: old.file_name || `Attachment #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Attachment deleted');
}
