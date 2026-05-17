import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { markEarningsAsPaid } from '../../services/instructorEarning.service';
import { notifyPayoutCompleted } from '../../services/notification.service';
import { debitWallet } from '../../services/wallet.service';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'payout_settlements';
const CACHE_KEY = 'payout_settlements:all';

const FK_SELECT = '*, users!payout_settlements_instructor_id_fkey(id, first_name, last_name, email), payout_requests(id, request_number, requested_amount)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['instructor_id', 'payout_request_id', 'processed_by']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Float fields
  for (const k of ['settlement_amount', 'processing_fee']) {
    if (typeof body[k] === 'string') body[k] = toNumOrNull(body[k]);
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

    if (search) q = applySearch(q, search, { ilike: ['settlement_number', 'transaction_reference'] });
    if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
    if (req.query.payout_request_id) q = q.eq('payout_request_id', parseInt(req.query.payout_request_id as string));
    if (req.query.settlement_status) q = q.eq('settlement_status', req.query.settlement_status as string);
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
    if (e || !data) return err(res, 'Payout settlement not found', 404);
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (!body.instructor_id) return err(res, 'instructor_id is required', 400);
    if (!body.payout_request_id) return err(res, 'payout_request_id is required', 400);

    body.created_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_settlement_created', targetType: 'payout_settlement', targetId: data.id, targetName: data.settlement_number || `#${data.id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout settlement created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Payout settlement not found', 404);

    const updates = parseBody(req);
    updates.updated_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_settlement_updated', targetType: 'payout_settlement', targetId: id, targetName: data.settlement_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout settlement updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('settlement_number, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Payout settlement not found', 404);
    if (old.deleted_at) return err(res, 'Already in trash', 400);

    const now = new Date().toISOString();
    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_settlement_soft_deleted', targetType: 'payout_settlement', targetId: id, targetName: old.settlement_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout settlement moved to trash');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('settlement_number, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Payout settlement not found', 404);
    if (!old.deleted_at) return err(res, 'Not in trash', 400);

    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_settlement_restored', targetType: 'payout_settlement', targetId: id, targetName: old.settlement_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout settlement restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('settlement_number').eq('id', id).single();
    if (!old) return err(res, 'Payout settlement not found', 404);

    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_settlement_deleted', targetType: 'payout_settlement', targetId: id, targetName: old.settlement_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Payout settlement permanently deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function markCompleted(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Payout settlement not found', 404);
    if (old.settlement_status === 'completed') return err(res, 'Settlement already completed', 400);

    const now = new Date().toISOString();
    const { transaction_reference } = req.body;

    const updates: any = {
      settlement_status: 'completed',
      settled_at: now,
      transaction_reference: transaction_reference || null,
      updated_by: req.user!.id,
    };

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    // Mark all confirmed earnings linked to this payout_request_id as paid
    if (old.payout_request_id) {
      try {
        const { data: confirmedEarnings } = await supabase
          .from('instructor_earnings')
          .select('id')
          .eq('payout_request_id', old.payout_request_id)
          .eq('earning_status', 'confirmed')
          .is('deleted_at', null);

        if (confirmedEarnings && confirmedEarnings.length > 0) {
          const earningIds = confirmedEarnings.map((e: any) => e.id);
          await markEarningsAsPaid(earningIds, old.payout_request_id, req.user!.id);
        }
      } catch (earningErr) {
        console.error('[PAYOUT_SETTLEMENT] Failed to mark earnings as paid:', earningErr);
      }

      // Debit wallet for the payout amount
      try {
        await debitWallet({
          userId: old.instructor_id,
          amount: Number(old.settlement_amount || 0),
          sourceType: 'payout',
          sourceId: old.payout_request_id,
          description: `Payout settlement #${id} completed`,
          metadata: { settlement_id: id, payout_request_id: old.payout_request_id },
          createdBy: req.user!.id,
        });
      } catch (walletErr) {
        console.error('[PAYOUT_SETTLEMENT] Wallet debit failed (non-fatal):', walletErr);
      }

      // Notify instructor
      try {
        await notifyPayoutCompleted(old.instructor_id, old.settlement_amount || 0, old.payout_request_id);
      } catch (notifyErr) {
        console.error('[PAYOUT_SETTLEMENT] Failed to send completion notification:', notifyErr);
      }
    }

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_settlement_completed', targetType: 'payout_settlement', targetId: id, targetName: old.settlement_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout settlement marked as completed');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function markFailed(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Payout settlement not found', 404);
    if (old.settlement_status === 'completed') return err(res, 'Cannot mark a completed settlement as failed', 400);

    const { failure_reason } = req.body;

    const updates: any = {
      settlement_status: 'failed',
      failure_reason: failure_reason || null,
      updated_by: req.user!.id,
    };

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'payout_settlement_failed', targetType: 'payout_settlement', targetId: id, targetName: old.settlement_number || `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Payout settlement marked as failed');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
