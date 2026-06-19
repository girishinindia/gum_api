import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch, SEARCH_CONFIGS } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'support_tickets';
const CACHE_KEY = 'support_tickets:all';

// Phase 47 — the two users embeds (requester + assignee) point at the same
// table. Without an alias on the second, PostgREST derives the same internal
// name for both and fails with: table name "support_tickets_users_1" specified
// more than once. Aliasing the assignee disambiguates them; the requester stays
// keyed as `users` so existing frontend reads (c.users) keep working.
const FK_SELECT = `*, ticket_categories(id, name), ticket_priorities(id, name, code, color, sla_hours), users!support_tickets_user_id_fkey(id, first_name, last_name, email), assignee:users!support_tickets_assigned_to_fkey(id, first_name, last_name, email)`;

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['category_id', 'priority_id', 'user_id', 'assigned_to', 'related_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  // Phase 48 — DB check constraint only allows: course, order, enrollment,
  // payment, webinar, bundle (or NULL). The frontend sends 'general' when
  // the ticket isn't linked to a specific entity — convert to NULL.
  if (body.related_type === 'general') body.related_type = null;
  return body;
}

// ── OPTION LISTS (id + name) for the admin Create Ticket searchable dropdowns ──
export async function userOptions(req: Request, res: Response) {
  const search = ((req.query.search as string) || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  let q = supabase.from('users').select('id, first_name, last_name, email').order('id', { ascending: false }).limit(limit);
  if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error: e } = await q;
  if (e) return err(res, e.message, 500);
  const options = (data || []).map((u: any) => ({ id: u.id, name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email, email: u.email }));
  return ok(res, options);
}

// related_type → entity table + display column (matches the support_tickets check constraint)
const RELATED_TABLES: Record<string, { table: string; nameCol: string }> = {
  course:  { table: 'courses',  nameCol: 'name' },
  webinar: { table: 'webinars', nameCol: 'title' },
  bundle:  { table: 'bundles',  nameCol: 'name' },
  order:   { table: 'orders',   nameCol: 'order_number' },
};

export async function relatedOptions(req: Request, res: Response) {
  const relatedType = req.query.related_type as string;
  const search = ((req.query.search as string) || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const cfg = RELATED_TABLES[relatedType];
  if (!cfg) return ok(res, []); // general / unsupported → no options
  let q = supabase.from(cfg.table).select(`id, ${cfg.nameCol}`).order('id', { ascending: false }).limit(limit);
  if (search) q = q.ilike(cfg.nameCol, `%${search}%`);
  const { data, error: e } = await q;
  if (e) return err(res, e.message, 500);
  const options = (data || []).map((row: any) => ({ id: row.id, name: row[cfg.nameCol] || `#${row.id}` }));
  return ok(res, options);
}

// GET /support-tickets
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, SEARCH_CONFIGS.support_tickets);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  if (req.query.ticket_status) q = q.eq('ticket_status', req.query.ticket_status as string);
  if (req.query.is_active === 'true') q = q.eq('is_active', true); else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  if (req.query.category_id) q = q.eq('category_id', parseInt(req.query.category_id as string));
  if (req.query.priority_id) q = q.eq('priority_id', parseInt(req.query.priority_id as string));
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.assigned_to) q = q.eq('assigned_to', parseInt(req.query.assigned_to as string));
  if (req.query.related_type) q = q.eq('related_type', req.query.related_type as string);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /support-tickets/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Support ticket not found', 404);
  return ok(res, data);
}

// POST /support-tickets
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  // Auto-generate ticket_number — Phase 48: use MAX suffix instead of COUNT
  // so that permanently-deleted tickets don't cause collisions (e.g. if 001
  // was deleted and 002 exists, COUNT=1 → generates 002 again = clash).
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `TKT-${today}-`;
  const { data: latest } = await supabase
    .from(TABLE)
    .select('ticket_number')
    .like('ticket_number', `${prefix}%`)
    .order('ticket_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastNum = latest?.ticket_number
    ? parseInt(latest.ticket_number.replace(prefix, ''), 10) || 0
    : 0;
  const num = String(lastNum + 1).padStart(3, '0');
  body.ticket_number = `${prefix}${num}`;

  // Set user_id from body or current user. Phase 45 — support_tickets has no
  // created_by/updated_by columns; the requester lives in user_id. Writing
  // created_by caused "Could not find the 'created_by' column".
  if (!body.user_id) body.user_id = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Support ticket already exists', 409);
    return err(res, e.message, 500);
  }

  // Insert initial status history
  await supabase.from('ticket_status_history').insert({
    ticket_id: data.id,
    from_status: null,
    to_status: 'open',
    changed_by: req.user!.id,
  });

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'support_ticket_created', targetType: 'support_ticket', targetId: data.id, targetName: data.ticket_number, ip: getClientIp(req) });
  return ok(res, data, 'Support ticket created', 201);
}

// PATCH /support-tickets/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Support ticket not found', 404);

  const updates = parseBody(req);
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'support_ticket_updated', targetType: 'support_ticket', targetId: id, targetName: old.ticket_number, changes, ip: getClientIp(req) });
  return ok(res, data, 'Support ticket updated');
}

// PATCH /support-tickets/:id/status
export async function changeStatus(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { status, notes } = req.body;

  if (!status) return err(res, 'status is required', 400);

  const { data: ticket } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!ticket) return err(res, 'Support ticket not found', 404);

  const validStatuses = ['open', 'in_progress', 'awaiting_reply', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) return err(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);

  const updates: any = { ticket_status: status };
  if (status === 'resolved') updates.resolved_at = new Date().toISOString();
  if (status === 'closed') updates.closed_at = new Date().toISOString();

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Insert status history
  await supabase.from('ticket_status_history').insert({
    ticket_id: id,
    from_status: ticket.ticket_status,
    to_status: status,
    changed_by: req.user!.id,
    notes: notes || null,
  });

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'support_ticket_status_changed', targetType: 'support_ticket', targetId: id, targetName: ticket.ticket_number, changes: { ticket_status: { old: ticket.ticket_status, new: status } }, ip: getClientIp(req) });
  return ok(res, data, 'Ticket status updated');
}

// PATCH /support-tickets/:id/assign
export async function assign(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { assigned_to } = req.body;

  const { data: ticket } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!ticket) return err(res, 'Support ticket not found', 404);

  const updates: any = { assigned_to: assigned_to ? parseInt(assigned_to) : null };

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'support_ticket_assigned', targetType: 'support_ticket', targetId: id, targetName: ticket.ticket_number, changes: { assigned_to: { old: ticket.assigned_to, new: updates.assigned_to } }, ip: getClientIp(req) });
  return ok(res, data, 'Ticket assigned');
}

// GET /support-tickets/stats
export async function stats(req: Request, res: Response) {
  // Count by status
  const statusCounts: Record<string, number> = { open: 0, in_progress: 0, awaiting_reply: 0, resolved: 0, closed: 0 };
  for (const s of Object.keys(statusCounts)) {
    const { count } = await supabase.from(TABLE).select('*', { count: 'exact', head: true }).eq('ticket_status', s).is('deleted_at', null);
    statusCounts[s] = count || 0;
  }

  // Count by priority
  const { data: priorities } = await supabase.from('ticket_priorities').select('id, name, code').is('deleted_at', null).order('display_order');
  const priorityCounts: Array<{ id: number; name: string; code: string; count: number }> = [];
  if (priorities) {
    for (const p of priorities) {
      const { count } = await supabase.from(TABLE).select('*', { count: 'exact', head: true }).eq('priority_id', p.id).is('deleted_at', null);
      priorityCounts.push({ id: p.id, name: p.name, code: p.code, count: count || 0 });
    }
  }

  return ok(res, { by_status: statusCounts, by_priority: priorityCounts });
}

// DELETE /support-tickets/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('ticket_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Support ticket not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'support_ticket_soft_deleted', targetType: 'support_ticket', targetId: id, targetName: old.ticket_number, ip: getClientIp(req) });
  return ok(res, data, 'Support ticket moved to trash');
}

// PATCH /support-tickets/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('ticket_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Support ticket not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'support_ticket_restored', targetType: 'support_ticket', targetId: id, targetName: old.ticket_number, ip: getClientIp(req) });
  return ok(res, data, 'Support ticket restored');
}

// DELETE /support-tickets/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('ticket_number').eq('id', id).single();
  if (!old) return err(res, 'Support ticket not found', 404);

  // Cascade delete messages and attachments
  await supabase.from('ticket_attachments').delete().eq('ticket_id', id);
  await supabase.from('ticket_messages').delete().eq('ticket_id', id);
  await supabase.from('ticket_status_history').delete().eq('ticket_id', id);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) {
    if (e.message?.includes('violates foreign key constraint')) return err(res, 'Cannot delete — this record is in use. Remove referencing records first.', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'support_ticket_deleted', targetType: 'support_ticket', targetId: id, targetName: old.ticket_number, ip: getClientIp(req) });
  return ok(res, null, 'Support ticket permanently deleted');
}
