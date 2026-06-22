import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'contact_enquiries';

// ── POST /contact-enquiries  (PUBLIC) — submit the contact form ──
export async function submit(req: Request, res: Response) {
  const b: any = req.body || {};
  const name    = String(b.name || '').trim();
  const email   = String(b.email || '').trim();
  const phone   = String(b.phone || '').trim();
  const message = String(b.message || '').trim();

  if (!name || !email || !phone || !message) {
    return err(res, 'Please fill all required fields (name, email, phone, message).', 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err(res, 'Please enter a valid email address.', 400);
  }

  const row = {
    name,
    email,
    phone,
    website:     String(b.website || '').trim() || null,
    subject:     String(b.subject || '').trim() || null,
    message,
    source_page: String(b.source_page || '').trim() || 'contact',
    status:      'new',
    ip_address:  getClientIp(req),
    user_agent:  String(req.headers['user-agent'] || '').slice(0, 500) || null,
  };

  const { data, error: e } = await supabase.from(TABLE).insert(row).select('id').single();
  if (e) return err(res, e.message, 500);
  return ok(res, { id: data.id }, 'Thank you! We will get back to you soon.', 201);
}

// ── GET /contact-enquiries  (admin) ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });
  let q = supabase.from(TABLE).select('*', { count: 'exact' });

  if (search) {
    const t = String(search).replace(/[%_\\(),]/g, '');
    if (t) q = q.or(`name.ilike.%${t}%,email.ilike.%${t}%,subject.ilike.%${t}%,message.ilike.%${t}%`);
  }
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);

  if (req.query.status) q = q.eq('status', req.query.status as string);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /contact-enquiries/:id  (admin) ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Enquiry not found', 404);
  return ok(res, data);
}

// ── PATCH /contact-enquiries/:id  (admin) — status + admin notes ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Enquiry not found', 404);

  const updates: any = {};
  if (typeof req.body.status === 'string') updates.status = req.body.status;
  if ('admin_notes' in req.body) updates.admin_notes = req.body.admin_notes || null;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Enquiry updated');
}

// ── DELETE /contact-enquiries/:id  (admin, soft delete) ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Enquiry not found', 404);
  if (old.deleted_at) return err(res, 'Enquiry is already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Enquiry moved to trash');
}

// ── PATCH /contact-enquiries/:id/restore  (admin) ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Enquiry not found', 404);
  if (!old.deleted_at) return err(res, 'Enquiry is not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Enquiry restored');
}
