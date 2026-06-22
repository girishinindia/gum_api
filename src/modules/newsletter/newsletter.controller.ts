import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'newsletter_subscribers';

// ── POST /newsletter/subscribe  (PUBLIC) ──
export async function subscribe(req: Request, res: Response) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim() || null;
  const source = String(req.body?.source || '').trim() || 'homepage';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err(res, 'Please enter a valid email address.', 400);
  }

  // De-dupe on email (ignoring soft-deleted rows).
  const { data: existing } = await supabase
    .from(TABLE).select('id, is_active').ilike('email', email).is('deleted_at', null).maybeSingle();

  if (existing) {
    if (existing.is_active) return ok(res, { id: existing.id }, "You're already subscribed — thanks!");
    const { error: re } = await supabase.from(TABLE).update({ is_active: true, unsubscribed_at: null }).eq('id', existing.id);
    if (re) return err(res, re.message, 500);
    return ok(res, { id: existing.id }, 'Welcome back! You are subscribed again.');
  }

  const { data, error: e } = await supabase
    .from(TABLE).insert({ email, name, source, ip_address: getClientIp(req), is_active: true }).select('id').single();
  if (e) return err(res, e.message, 500);
  return ok(res, { id: data.id }, 'Subscribed! Check your inbox for a welcome email soon.', 201);
}

// ── GET /newsletter  (admin) ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });
  let q = supabase.from(TABLE).select('*', { count: 'exact' });

  if (search) {
    const t = String(search).replace(/[%_\\(),]/g, '');
    if (t) q = q.or(`email.ilike.%${t}%,name.ilike.%${t}%`);
  }
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);

  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── DELETE /newsletter/:id  (admin, soft delete) ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Subscriber not found', 404);
  if (old.deleted_at) return err(res, 'Subscriber is already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Subscriber moved to trash');
}

// ── PATCH /newsletter/:id/restore  (admin) ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Subscriber not found', 404);
  if (!old.deleted_at) return err(res, 'Subscriber is not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Subscriber restored');
}
