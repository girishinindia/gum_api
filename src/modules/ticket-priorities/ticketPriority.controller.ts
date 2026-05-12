import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'ticket_priorities';
const CACHE_KEY = 'ticket_priorities:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.display_order === 'string') body.display_order = body.display_order ? parseInt(body.display_order) || 0 : 0;
  if (typeof body.sla_hours === 'string') body.sla_hours = body.sla_hours ? parseInt(body.sla_hours) || null : null;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /ticket-priorities
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select('*', { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /ticket-priorities/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Ticket priority not found', 404);
  return ok(res, data);
}

// POST /ticket-priorities
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  const { data, error: e } = await supabase.from(TABLE).insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Ticket priority already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_priority_created', targetType: 'ticket_priority', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  return ok(res, data, 'Ticket priority created', 201);
}

// PATCH /ticket-priorities/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Ticket priority not found', 404);

  const updates = parseBody(req);
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Ticket priority already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_priority_updated', targetType: 'ticket_priority', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Ticket priority updated');
}

// DELETE /ticket-priorities/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Ticket priority not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_priority_soft_deleted', targetType: 'ticket_priority', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Ticket priority moved to trash');
}

// PATCH /ticket-priorities/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Ticket priority not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_priority_restored', targetType: 'ticket_priority', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Ticket priority restored');
}

// DELETE /ticket-priorities/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name').eq('id', id).single();
  if (!old) return err(res, 'Ticket priority not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) {
    if (e.message?.includes('violates foreign key constraint')) return err(res, 'Cannot delete — this record is in use. Remove referencing records first.', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'ticket_priority_deleted', targetType: 'ticket_priority', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Ticket priority deleted');
}
