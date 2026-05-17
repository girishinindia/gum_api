import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { db } from '../../services/db';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { notifyPayoutApproved, notifyPayoutRejected } from '../../services/notification.service';
import { applySearch } from '../../utils/search';
import { logger } from '../../utils/logger';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

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
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Float fields
  for (const k of ['requested_amount', 'approved_amount']) {
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

    if (search) q = applySearch(q, search, { ilike: ['request_number', 'review_notes'] });
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
    const { approved_amount, review_notes, bank_account_id: bodyBankId } = req.body;
    const grossAmount = approved_amount ? parseFloat(approved_amount) : Number(old.requested_amount);

    // Phase 9.6 — Resolve a verified bank account for this instructor.
    // Caller can pass bank_account_id explicitly; otherwise we use the
    // instructor's primary verified account.
    const bankAccountId = bodyBankId ? parseInt(bodyBankId) : (old.bank_account_id || null);
    let bank: any = null;
    if (bankAccountId) {
      const { data: b } = await supabase.from('bank_accounts').select('*').eq('id', bankAccountId).is('deleted_at', null).maybeSingle();
      if (b && b.user_id === old.instructor_id) bank = b;
    }
    if (!bank) {
      const { data: b } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', old.instructor_id)
        .eq('verification_status', 'verified')
        .eq('is_primary', true)
        .is('deleted_at', null)
        .maybeSingle();
      bank = b;
    }
    if (!bank) {
      return err(res, 'Instructor has no verified bank account on file. Ask them to add + verify one before approving payouts.', 409);
    }

    // Phase 9.6 — Compute TDS (uses YTD aggregate + PAN status)
    const { computeTdsForPayout } = await import('../../services/tds.service');
    const tds = await computeTdsForPayout({
      instructorId: old.instructor_id,
      grossAmount,
    });

    // Update the payout_request row (approved + linked bank)
    const updates: any = {
      request_status: 'approved',
      approved_amount: grossAmount,
      reviewed_by: req.user!.id,
      reviewed_at: now,
      review_notes: review_notes || null,
      bank_account_id: bank.id,
      updated_by: req.user!.id,
    };

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    // Allocate TDS certificate number (only if TDS is being deducted)
    let tdsCertificateNo: string | null = null;
    if (tds.tdsAmount > 0) {
      try {
        const certNoData = await db.callFn('fn_generate_tds_certificate_no', {
          p_instructor_id: old.instructor_id,
          p_fy_label: tds.fyLabel,
        });
        tdsCertificateNo = String(Array.isArray(certNoData) ? certNoData[0] : certNoData);
      } catch { /* keep tdsCertificateNo null on failure — settlement still goes ahead */ }
    }

    // Phase 9.6 — Create a payout_settlement row in 'queued' state
    const settlementNo = `STL-${tds.fyLabel}-${String(old.instructor_id).padStart(6, '0')}-${String(id).padStart(6, '0')}`;
    const { data: settlement, error: stlErr } = await supabase
      .from('payout_settlements')
      .insert({
        payout_request_id: id,
        instructor_id: old.instructor_id,
        settlement_number: settlementNo,
        settled_amount: tds.netAmount,
        gross_amount: tds.grossAmount,
        net_amount: tds.netAmount,
        tds_amount: tds.tdsAmount,
        tds_rate: tds.tdsRate,
        tds_section: tds.appliedSection.startsWith('exempt') ? '194-O' : tds.appliedSection,
        tds_certificate_no: tdsCertificateNo,
        fy_label: tds.fyLabel,
        bank_account_id: bank.id,
        gateway: 'razorpayx',
        settlement_status: 'queued',
        payment_method: 'bank_transfer',
        bank_details: {
          masked_account: `••••${String(bank.account_number).slice(-4)}`,
          ifsc: bank.ifsc_code,
        },
        metadata: { tds_breakdown: tds },
        created_by: req.user!.id,
      })
      .select('id, settlement_number')
      .single();

    if (stlErr) {
      logger.error({ err: stlErr.message, payoutRequestId: id }, '[PayoutRequest.approve] Settlement insert failed');
      return err(res, `Settlement creation failed: ${stlErr.message}`, 500);
    }

    // Phase 9.6 — enqueue the actual bank transfer (worker calls gateway)
    try {
      const { enqueue } = await import('../../services/queue.service');
      await enqueue(
        'payouts',
        'execute',
        { settlementId: settlement!.id },
        {
          jobId: `payout:${settlement!.id}`,
          syncFallback: async ({ settlementId }) => {
            const { executeQueuedPayout } = await import('../../services/payoutExecutor.service');
            await executeQueuedPayout(settlementId);
          },
        },
      );
    } catch (queueErr: any) {
      logger.error({ err: queueErr?.message, settlementId: settlement?.id }, '[PayoutRequest.approve] Enqueue failed');
      // The settlement row stays in 'queued' — admin can replay via /admin/queues
    }

    await clearCache();

    // Notify instructor
    try {
      await notifyPayoutApproved(old.instructor_id, tds.netAmount, id);
    } catch (notifyErr) {
      console.error('[PAYOUT_REQUEST] Failed to send approval notification:', notifyErr);
    }

    logAdmin({
      actorId: req.user!.id,
      action: 'payout_request_approved',
      targetType: 'payout_request',
      targetId: id,
      targetName: old.request_number || `#${id}`,
      changes: { gross: tds.grossAmount, tds: tds.tdsAmount, net: tds.netAmount, fy: tds.fyLabel },
      ip: getClientIp(req),
    });

    return ok(res, {
      ...data,
      settlement_id: settlement!.id,
      settlement_number: settlement!.settlement_number,
      tds: {
        gross_amount: tds.grossAmount,
        tds_amount: tds.tdsAmount,
        tds_rate: tds.tdsRate,
        net_amount: tds.netAmount,
        applied_section: tds.appliedSection,
        fy_label: tds.fyLabel,
        certificate_no: tdsCertificateNo,
      },
    }, 'Payout request approved and queued for bank transfer');
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
