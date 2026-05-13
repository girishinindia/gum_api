/**
 * Bank Accounts Controller (Phase 9.5)
 * ────────────────────────────────────
 * Per-user verified bank details. Instructors own theirs; admins with the
 * 'bank_account:read' permission can list across users.
 *
 * Add bank → POST   /bank-accounts        (creates a row, status='unverified')
 * Verify   → POST   /bank-accounts/:id/verify
 *             • In disabled-gateway mode, marks status='verified' immediately
 *             • In RazorpayX mode, creates contact + fund_account; if both
 *               succeed we mark 'verified' and persist the gateway IDs.
 * List own → GET    /bank-accounts/me
 * Primary  → PATCH  /bank-accounts/:id/primary
 */

import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { logAdmin } from '../../services/activityLog.service';
import { hasPermission } from '../../middleware/rbac';
import {
  createContact,
  createFundAccount,
  gatewayMode,
} from '../../services/payoutGateway.service';

const TABLE = 'bank_accounts';

// ── Validators ──
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCT_RE = /^[0-9]{6,20}$/;
const PAN_RE  = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function validateBody(body: any): { error?: string } {
  if (!body.account_holder_name || String(body.account_holder_name).trim().length < 2) {
    return { error: 'account_holder_name is required (min 2 chars)' };
  }
  if (!ACCT_RE.test(String(body.account_number || ''))) {
    return { error: 'account_number must be 6–20 digits' };
  }
  if (!IFSC_RE.test(String(body.ifsc_code || '').toUpperCase())) {
    return { error: 'ifsc_code is invalid (expect format ABCD0XXXXXX)' };
  }
  return {};
}

// ── Public handlers ──

export async function listMine(req: Request, res: Response) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, verification_status, is_primary, is_active, created_at')
    .eq('user_id', req.user!.id)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return err(res, error.message, 500);

  // Mask account_number for safety even in the user's own listing
  const masked = (data || []).map((b: any) => ({
    ...b,
    account_number_masked: b.account_number ? `••••${String(b.account_number).slice(-4)}` : null,
    account_number: undefined,
  }));
  return ok(res, masked);
}

export async function listAll(req: Request, res: Response) {
  if (!hasPermission(req, 'bank_account', 'read')) return err(res, 'Forbidden', 403);

  const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'created_at' });
  let q = supabase.from(TABLE)
    .select('id, user_id, account_holder_name, account_number, ifsc_code, bank_name, account_type, verification_status, is_primary, is_active, created_at', { count: 'exact' })
    .is('deleted_at', null);
  if (req.query.user_id)              q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.verification_status)  q = q.eq('verification_status', req.query.verification_status as string);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error } = await q;
  if (error) return err(res, error.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!row) return err(res, 'Bank account not found', 404);
  if (row.user_id !== req.user!.id && !hasPermission(req, 'bank_account', 'read')) return err(res, 'Forbidden', 403);
  return ok(res, {
    ...row,
    account_number_masked: row.account_number ? `••••${String(row.account_number).slice(-4)}` : null,
    account_number: undefined,
  });
}

export async function create(req: Request, res: Response) {
  const valErr = validateBody(req.body);
  if (valErr.error) return err(res, valErr.error, 400);

  const ifsc = String(req.body.ifsc_code).toUpperCase();
  const acct = String(req.body.account_number);
  const userId = req.user!.id;

  // Hint the bank/branch from IFSC prefix when not provided
  let bankName = req.body.bank_name || null;
  let branchName = req.body.branch_name || null;
  if (!bankName) bankName = ifsc.slice(0, 4); // very rough; Razorpay IFSC API can refine

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      account_holder_name: String(req.body.account_holder_name).trim(),
      account_number: acct,
      ifsc_code: ifsc,
      bank_name: bankName,
      branch_name: branchName,
      account_type: req.body.account_type === 'current' ? 'current' : 'savings',
      verification_status: 'unverified',
      is_primary: req.body.is_primary === true,
      is_active: true,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) {
    if ((error as any).code === '23505') return err(res, 'A bank account with these details already exists', 409);
    return err(res, error.message, 500);
  }

  logAdmin({ actorId: userId, action: 'bank_account_added', targetType: 'bank_account', targetId: data.id, targetName: `••••${acct.slice(-4)}`, ip: getClientIp(req) });
  return ok(res, {
    ...data,
    account_number_masked: `••••${acct.slice(-4)}`,
    account_number: undefined,
  }, 'Bank account added', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('user_id, verification_status').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!row) return err(res, 'Not found', 404);
  if (row.user_id !== req.user!.id && !hasPermission(req, 'bank_account', 'update')) return err(res, 'Forbidden', 403);

  // Only safe-to-edit fields without re-verification
  const allowed: Record<string, any> = {};
  if (req.body.account_holder_name) allowed.account_holder_name = String(req.body.account_holder_name).trim();
  if (req.body.account_type)        allowed.account_type = req.body.account_type === 'current' ? 'current' : 'savings';
  if (req.body.bank_name !== undefined)   allowed.bank_name = req.body.bank_name || null;
  if (req.body.branch_name !== undefined) allowed.branch_name = req.body.branch_name || null;

  // If they touch account_number / IFSC, the row needs re-verification.
  if (req.body.account_number || req.body.ifsc_code) {
    if (req.body.account_number) {
      if (!ACCT_RE.test(String(req.body.account_number))) return err(res, 'account_number must be 6–20 digits', 400);
      allowed.account_number = String(req.body.account_number);
    }
    if (req.body.ifsc_code) {
      const u = String(req.body.ifsc_code).toUpperCase();
      if (!IFSC_RE.test(u)) return err(res, 'ifsc_code is invalid', 400);
      allowed.ifsc_code = u;
    }
    allowed.verification_status = 'unverified';
    allowed.verified_at = null;
    allowed.razorpayx_contact_id = null;
    allowed.razorpayx_fund_account_id = null;
  }

  allowed.updated_by = req.user!.id;

  const { data, error } = await supabase.from(TABLE).update(allowed).eq('id', id).select('*').single();
  if (error) return err(res, error.message, 500);
  return ok(res, { ...data, account_number_masked: data.account_number ? `••••${String(data.account_number).slice(-4)}` : null, account_number: undefined }, 'Bank account updated');
}

export async function setPrimary(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('user_id, deleted_at').eq('id', id).maybeSingle();
  if (!row || row.deleted_at) return err(res, 'Not found', 404);
  if (row.user_id !== req.user!.id && !hasPermission(req, 'bank_account', 'update')) return err(res, 'Forbidden', 403);

  // unset other primaries (partial unique index will reject if we try to set 2)
  await supabase.from(TABLE).update({ is_primary: false }).eq('user_id', row.user_id).neq('id', id);
  const { data, error } = await supabase.from(TABLE).update({ is_primary: true, updated_by: req.user!.id }).eq('id', id).select('*').single();
  if (error) return err(res, error.message, 500);
  return ok(res, data, 'Primary bank account updated');
}

export async function verifyAccount(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: ba } = await supabase.from(TABLE).select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!ba) return err(res, 'Not found', 404);
  if (ba.user_id !== req.user!.id && !hasPermission(req, 'bank_account', 'update')) return err(res, 'Forbidden', 403);

  if (ba.verification_status === 'verified') {
    return ok(res, ba, 'Already verified');
  }

  await supabase.from(TABLE).update({ verification_status: 'pending', updated_by: req.user!.id }).eq('id', id);

  try {
    const userRow = (await supabase.from('users').select('full_name, first_name, last_name, email, mobile').eq('id', ba.user_id).single()).data;
    const displayName = ba.account_holder_name || userRow?.full_name || [userRow?.first_name, userRow?.last_name].filter(Boolean).join(' ').trim() || 'Instructor';

    const contact = await createContact({
      name: displayName,
      email: userRow?.email,
      contact: userRow?.mobile,
      type: 'vendor',
      reference_id: `inst_${ba.user_id}`,
    });

    const fund = await createFundAccount({
      contact_id: contact.id,
      account_holder_name: ba.account_holder_name,
      account_number: ba.account_number,
      ifsc: ba.ifsc_code,
    });

    const { data: updated, error: upErr } = await supabase
      .from(TABLE)
      .update({
        verification_status: 'verified',
        verification_method: gatewayMode() === 'disabled' ? 'manual' : 'razorpay_basic',
        verification_response: { contact, fund },
        verified_at: new Date().toISOString(),
        verified_by: req.user!.id,
        razorpayx_contact_id: contact.id,
        razorpayx_fund_account_id: fund.id,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (upErr) return err(res, upErr.message, 500);

    logAdmin({ actorId: req.user!.id, action: 'bank_account_verified', targetType: 'bank_account', targetId: id, targetName: `••••${String(ba.account_number).slice(-4)}`, ip: getClientIp(req) });
    return ok(res, { ...updated, account_number_masked: `••••${String(updated.account_number).slice(-4)}`, account_number: undefined }, 'Bank account verified');
  } catch (e: any) {
    await supabase.from(TABLE).update({
      verification_status: 'failed',
      verification_response: { error: e?.message },
    }).eq('id', id);
    return err(res, `Verification failed: ${e?.message}`, 502);
  }
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(TABLE).select('user_id').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!row) return err(res, 'Not found', 404);
  if (row.user_id !== req.user!.id && !hasPermission(req, 'bank_account', 'delete')) return err(res, 'Forbidden', 403);

  await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), is_active: false, is_primary: false, updated_by: req.user!.id }).eq('id', id);
  return ok(res, { id }, 'Bank account removed');
}
