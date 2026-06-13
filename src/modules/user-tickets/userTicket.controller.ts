import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { sendNotification } from '../../services/notification.service';
import { uploadRawFile, processAndUploadImage } from '../../services/storage.service';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TICKET_TABLE = 'support_tickets';
const MESSAGE_TABLE = 'ticket_messages';

const TICKET_FK_SELECT = `*, ticket_categories(id, name), ticket_priorities(id, name, code, color, sla_hours)`;
const MESSAGE_FK_SELECT = `*, users!ticket_messages_sender_id_fkey(id, first_name, last_name, email)`;

// ── Helpers ──

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  for (const k of ['category_id', 'priority_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

async function getDefaultPriority(): Promise<number | null> {
  const { data } = await supabase
    .from('ticket_priorities')
    .select('id')
    .eq('code', 'medium')
    .is('deleted_at', null)
    .single();
  return data?.id || null;
}

async function insertAutoReply(ticketId: number, ticketNumber: string): Promise<void> {
  const message = `Thank you for submitting ticket ${ticketNumber}. Our support team has received your request and will review it shortly. You will be notified when there is an update. Please do not submit duplicate tickets for the same issue.`;

  await supabase.from(MESSAGE_TABLE).insert({
    ticket_id: ticketId,
    sender_id: null,
    sender_type: 'system',
    message,
    is_internal: false,
  });
}

async function notifyAdmins(ticketId: number, ticketNumber: string, subject: string, opts?: { title?: string; message?: string; notificationType?: string }): Promise<void> {
  try {
    // Find users with admin or super_admin roles
    // BUG-62: instructors are now level 60, so the old `>= 50` threshold sent
    // them support-ticket notifications. Raise to 80 so only admin (80) and
    // super_admin (100) are notified.
    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select('user_id, roles!inner(level)')
      .eq('is_active', true)
      .gte('roles.level', 80); // admin level 80+, super_admin 100

    if (!adminUsers || adminUsers.length === 0) return;

    const uniqueAdminIds = [...new Set(adminUsers.map((u: any) => u.user_id))];

    for (const adminId of uniqueAdminIds) {
      await sendNotification({
        userId: adminId,
        notificationType: opts?.notificationType || 'support_ticket',
        title: opts?.title || `New Support Ticket: ${ticketNumber}`,
        message: opts?.message || `A new support ticket "${subject}" has been submitted and needs review.`,
        channels: ['in_app', 'email'],
        referenceType: 'support_ticket',
        referenceId: ticketId,
      }).catch(() => {}); // Don't fail ticket creation if notification fails
    }
  } catch (_) {
    // Silently fail — notifications are best-effort
  }
}

// ── GET /user-tickets/categories ──
export async function getCategories(req: Request, res: Response) {
  const { data, error: e } = await supabase
    .from('ticket_categories')
    .select('id, name')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');

  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

// ── GET /user-tickets ──
export async function listMyTickets(req: Request, res: Response) {
  const userId = req.user!.id;
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TICKET_TABLE).select(TICKET_FK_SELECT, { count: 'exact' });

  // Ownership scope — user can only see their own tickets
  q = q.eq('user_id', userId).is('deleted_at', null);

  if (search) q = applySearch(q, search, { ilike: ['subject', 'ticket_number', 'description'] });

  if (req.query.ticket_status) q = q.eq('ticket_status', req.query.ticket_status as string);
  if (req.query.category_id) q = q.eq('category_id', parseInt(req.query.category_id as string));

  // Newest ticket first by default (issue: list was oldest-first). Opt into
  // ascending only with an explicit ?order=asc.
  const asc = (req.query.order as string) === 'asc' ? true : (req.query.order ? ascending : false);
  q = q.order(sort, { ascending: asc }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /user-tickets/:id ──
export async function getMyTicket(req: Request, res: Response) {
  const userId = req.user!.id;
  const ticketId = parseInt(req.params.id);

  // Fetch ticket with ownership check
  const { data: ticket, error: e } = await supabase
    .from(TICKET_TABLE)
    .select(TICKET_FK_SELECT)
    .eq('id', ticketId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (e || !ticket) return err(res, 'Ticket not found', 404);

  // Fetch non-internal messages for this ticket
  const { data: messages } = await supabase
    .from(MESSAGE_TABLE)
    .select(MESSAGE_FK_SELECT)
    .eq('ticket_id', ticketId)
    .eq('is_internal', false)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  return ok(res, { ...ticket, messages: messages || [] });
}

// ── POST /user-tickets ──
export async function submitTicket(req: Request, res: Response) {
  const userId = req.user!.id;
  const body = parseBody(req);

  if (!body.subject || !body.subject.trim()) return err(res, 'Subject is required', 400);
  if (!body.description || !body.description.trim()) return err(res, 'Description is required', 400);

  // Auto-generate ticket_number
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from(TICKET_TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ticket_number', `TKT-${today}-%`);
  const num = String((count || 0) + 1).padStart(3, '0');
  const ticketNumber = `TKT-${today}-${num}`;

  // Default priority if not provided
  if (!body.priority_id) {
    body.priority_id = await getDefaultPriority();
  }

  const insertData: any = {
    ticket_number: ticketNumber,
    subject: body.subject.trim(),
    description: body.description.trim(),
    category_id: body.category_id || null,
    priority_id: body.priority_id,
    user_id: userId,
    ticket_status: 'open',
  };

  const { data: ticket, error: e } = await supabase
    .from(TICKET_TABLE)
    .insert(insertData)
    .select(TICKET_FK_SELECT)
    .single();

  if (e) return err(res, e.message, 500);

  // Insert initial status history
  await supabase.from('ticket_status_history').insert({
    ticket_id: ticket.id,
    from_status: null,
    to_status: 'open',
    changed_by: userId,
  });

  // Insert system auto-reply message
  await insertAutoReply(ticket.id, ticketNumber);

  // Notify user via in-app + email
  await sendNotification({
    userId,
    notificationType: 'support_ticket',
    title: `Ticket Submitted: ${ticketNumber}`,
    message: `Your support ticket "${body.subject.trim()}" has been submitted successfully. We will get back to you soon.`,
    channels: ['in_app', 'email'],
    referenceType: 'support_ticket',
    referenceId: ticket.id,
  }).catch(() => {});

  // Notify admins (fire and forget)
  notifyAdmins(ticket.id, ticketNumber, body.subject.trim());

  return ok(res, ticket, 'Support ticket submitted successfully', 201);
}

// ── POST /user-tickets/:id/reply ──
export async function replyToTicket(req: Request, res: Response) {
  const userId = req.user!.id;
  const ticketId = parseInt(req.params.id);

  // Ownership check
  const { data: ticket } = await supabase
    .from(TICKET_TABLE)
    .select('id, ticket_number, ticket_status, user_id')
    .eq('id', ticketId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (!ticket) return err(res, 'Ticket not found', 404);

  if (['closed'].includes(ticket.ticket_status)) {
    return err(res, 'Cannot reply to a closed ticket', 400);
  }

  const message = req.body.message?.trim();
  if (!message) return err(res, 'Message is required', 400);

  const { data: msg, error: e } = await supabase
    .from(MESSAGE_TABLE)
    .insert({
      ticket_id: ticketId,
      sender_id: userId,
      sender_type: 'user',
      message,
      is_internal: false,
    })
    .select(MESSAGE_FK_SELECT)
    .single();

  if (e) return err(res, e.message, 500);

  // Update parent ticket's updated_at
  await supabase
    .from(TICKET_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', ticketId);

  // Notify admins/support of the student reply (fire and forget). They now see
  // it in the in-app inbox + email, so replies don't sit unanswered.
  notifyAdmins(ticketId, ticket.ticket_number, ticket.ticket_number, {
    title: `New reply on ${ticket.ticket_number}`,
    message: `A student replied: "${message.slice(0, 80)}${message.length > 80 ? '…' : ''}"`,
    notificationType: 'support_ticket_reply',
  });

  // If ticket was in 'resolved' status, move back to 'open' since user replied
  if (ticket.ticket_status === 'resolved') {
    await supabase
      .from(TICKET_TABLE)
      .update({ ticket_status: 'open', updated_at: new Date().toISOString() })
      .eq('id', ticketId);

    await supabase.from('ticket_status_history').insert({
      ticket_id: ticketId,
      from_status: 'resolved',
      to_status: 'open',
      changed_by: userId,
      notes: 'Reopened by user reply',
    });
  }

  return ok(res, msg, 'Reply sent', 201);
}

// ── PATCH /user-tickets/:id/close ──
export async function closeMyTicket(req: Request, res: Response) {
  const userId = req.user!.id;
  const ticketId = parseInt(req.params.id);

  // Ownership check
  const { data: ticket } = await supabase
    .from(TICKET_TABLE)
    .select('id, ticket_number, ticket_status, user_id')
    .eq('id', ticketId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (!ticket) return err(res, 'Ticket not found', 404);

  if (ticket.ticket_status === 'closed') {
    return err(res, 'Ticket is already closed', 400);
  }

  // User can close their own ticket from any status (resolved or otherwise)
  const { data, error: e } = await supabase
    .from(TICKET_TABLE)
    .update({
      ticket_status: 'closed',
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
    .select(TICKET_FK_SELECT)
    .single();

  if (e) return err(res, e.message, 500);

  // Insert status history
  await supabase.from('ticket_status_history').insert({
    ticket_id: ticketId,
    from_status: ticket.ticket_status,
    to_status: 'closed',
    changed_by: userId,
    notes: 'Closed by user',
  });

  return ok(res, data, 'Ticket closed');
}

// ── Attachments (self-serve, strictly ownership-scoped) ──

/** Returns the ticket row if it exists and belongs to the caller, else null. */
async function ownTicketOrNull(ticketId: number, userId: number) {
  const { data } = await supabase
    .from(TICKET_TABLE)
    .select('id, ticket_status, user_id')
    .eq('id', ticketId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();
  return data;
}

// ── GET /user-tickets/:id/attachments ──
export async function listMyAttachments(req: Request, res: Response) {
  const userId = req.user!.id;
  const ticketId = parseInt(req.params.id);
  const ticket = await ownTicketOrNull(ticketId, userId);
  if (!ticket) return err(res, 'Ticket not found', 404);

  const { data, error: e } = await supabase
    .from('ticket_attachments')
    .select('id, message_id, file_name, file_url, file_size, file_type, created_at')
    .eq('ticket_id', ticketId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

// ── POST /user-tickets/:id/attachments  (multipart: file, optional message_id) ──
export async function uploadMyAttachment(req: Request, res: Response) {
  const userId = req.user!.id;
  const ticketId = parseInt(req.params.id);
  const ticket = await ownTicketOrNull(ticketId, userId);
  if (!ticket) return err(res, 'Ticket not found', 404);
  if (ticket.ticket_status === 'closed') return err(res, 'This ticket is closed. Reopen it to add files.', 400);
  if (!req.file) return err(res, 'No file provided', 400);

  const messageId = toIntOrNull(req.body.message_id);
  const isImage = req.file.mimetype.startsWith('image/');
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `support-tickets/ticket-${ticketId}/${Date.now()}-${safeName}`;

  let fileUrl: string;
  try {
    fileUrl = isImage
      ? await processAndUploadImage(req.file.buffer, path, { width: 1600, height: 1600, quality: 85 })
      : await uploadRawFile(req.file.buffer, path);
  } catch (uploadErr: any) {
    return err(res, `File upload failed: ${uploadErr.message}`, 500);
  }

  const row: any = {
    ticket_id: ticketId,
    file_name: req.file.originalname,
    file_url: fileUrl,
    file_size: req.file.size,
    file_type: req.file.mimetype,
    uploaded_by: userId,
  };
  if (messageId) row.message_id = messageId;

  const { data, error: e } = await supabase
    .from('ticket_attachments')
    .insert(row)
    .select('id, message_id, file_name, file_url, file_size, file_type, created_at')
    .single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Attachment uploaded', 201);
}
