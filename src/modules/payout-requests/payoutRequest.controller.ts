import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { notifyPayoutApproved, notifyPayoutRejected } from '../../services/notification.service';

const TABLE = 'payout_requests';
const CACHE_KEY = 'payout_requests:all';

const FK_SELECT = '*, users!payout_requests_instructor_id_fkey(id, first_name, last_name, email), users!payout_requests_reviewed_by_fkey(id, first_name, last_name, email)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['instructor_id', 'reviewed_by']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Float fields
  for (const k of ['requested_amount', 'approved_amount']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseFloat(body[k]) || null : null;
  }
  // JSON fields
  if (typeof body.metadata === 'string') {
    try { body.metadata = JSON.parse(body.metadata); } catch { body.metadata = null; }
  }
  if (typeof body.bank_details === 'string') {
    try { body.bank_details = JSON.parse(body.bank_details); } catch { body.bank_details = null; }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

    let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

    if (search) q = q.or(`request_number.ilike.%${search}%,review_notes.ilike.%${search}%`);
    if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
    if (req.query.request_status) q = q.eq('request_status', req.query.request_status as string);
    if (req.query.payment_method) q = q.eq('payment_method', req.query.payment_method as string);

    if (req.query.show_deleted === 'true') {
      q = q.not('deleted_at', 'is', null);
    } else {
      q = q.is('deleted_at', null);
    }

    q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

    const { data, count, error: e } = await q;
    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
    if (e || !data) return err(res, 'Payout request not found', 404);
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (!body.instructor_id) return err(res, 'instructor_id is required', 400);
    if (!body.requested_amount) return err(res, 'requested_amount is required', 400);

    body.created_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_request_created', targetType: 'payout_request', targetId: data.id, targetName: data.request_number || `#${data.id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout request created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Payout request not found', 404);

    const updates = parseBody(req);
    updates.updated_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_request_updated', targetType: 'payout_request', targetId: id, targetName: data.request_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout request updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('request_number, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Payout request not found', 404);
    if (old.deleted_at) return err(res, 'Already in trash', 400);

    const now = new Date().toISOString();
    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_request_soft_deleted', targetType: 'payout_request', targetId: id, targetName: old.request_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout request moved to trash');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('request_number, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Payout request not found', 404);
    if (!old.deleted_at) return err(res, 'Not in trash', 400);

    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_request_restored', targetType: 'payout_request', targetId: id, targetName: old.request_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout request restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('request_number').eq('id', id).single();
    if (!old) return err(res, 'Payout request not found', 404);

    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_request_deleted', targetType: 'payout_request', targetId: id, targetName: old.request_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Payout request permanently deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function approve(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Payout request not found', 404);
    if (old.request_status !== 'pending') return err(res, `Cannot approve a request with status "${old.request_status}"`, 400);

    const now = new Date().toISOString();
    const { approved_amount, review_notes } = req.body;

    const updates: any = {
      request_status: 'approved',
      approved_amount: approved_amount ? parseFloat(approved_amount) : old.requested_amount,
      reviewed_by: req.user!.id,
      reviewed_at: now,
      review_notes: review_notes || null,
      updated_by: req.user!.id,
    };

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();

    // Notify instructor
    try {
      await notifyPayoutApproved(old.instructor_id, updates.approved_amount, id);
    } catch (notifyErr) {
      console.error('[PAYOUT_REQUEST] Failed to send approval notification:', notifyErr);
    }

    logAdmin({ actorId: req.user!.id, action: 'payout_request_approved', targetType: 'payout_request', targetId: id, targetName: old.request_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout request approved');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function reject(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Payout request not found', 404);
    if (old.request_status !== 'pending') return err(res, `Cannot reject a request with status "${old.request_status}"`, 400);

    const now = new Date().toISOString();
    const { rejection_reason } = req.body;

    const updates: any = {
      request_status: 'rejected',
      rejection_reason: rejection_reason || null,
      reviewed_by: req.user!.id,
      reviewed_at: now,
      updated_by: req.user!.id,
    };

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();

    // Notify instructor
    try {
      await notifyPayoutRejected(old.instructor_id, rejection_reason || 'No reason provided', id);
    } catch (notifyErr) {
      console.error('[PAYOUT_REQUEST] Failed to send rejection notification:', notifyErr);
    }

    logAdmin({ actorId: req.user!.id, action: 'payout_request_rejected', targetType: 'payout_request', targetId: id, targetName: old.request_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout request rejected');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
