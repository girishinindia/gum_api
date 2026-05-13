/**
 * Payout Executor (Phase 9.6)
 * ───────────────────────────
 * The function the BullMQ worker (or the sync-fallback) calls for each
 * queued payout. Reads the settlement, looks up the verified bank's
 * RazorpayX fund_account_id, calls the gateway, persists the gateway
 * payout id + status.
 *
 * Status transitions on the settlement row:
 *   queued       → (executor picks up) → processing
 *   processing   → (gateway returns)   → completed | failed
 *   completed    ← (webhook confirms)  ← processed | reversed
 *
 * Idempotent: returns early if settlement_status is already terminal
 * (completed / failed / reversed). The gateway call itself uses
 * X-Payout-Idempotency = settlement.settlement_number.
 */

import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { creditWallet, debitWallet } from './wallet.service';

const TERMINAL = new Set(['completed', 'failed', 'reversed']);

export async function executeQueuedPayout(settlementId: number): Promise<void> {
  const { data: s, error: sErr } = await supabase
    .from('payout_settlements')
    .select('*, bank_accounts!payout_settlements_bank_account_id_fkey(id, razorpayx_fund_account_id, account_holder_name, account_number, ifsc_code, verification_status)')
    .eq('id', settlementId)
    .is('deleted_at', null)
    .single();

  if (sErr || !s) {
    logger.error({ settlementId, err: sErr?.message }, '[PayoutExecutor] settlement not found');
    return;
  }

  if (TERMINAL.has(String(s.settlement_status))) {
    logger.info({ settlementId, status: s.settlement_status }, '[PayoutExecutor] already terminal, skipping');
    return;
  }

  const bank: any = (s as any).bank_accounts;
  if (!bank || bank.verification_status !== 'verified') {
    await supabase.from('payout_settlements').update({
      settlement_status: 'failed',
      failure_reason: 'Bank account is not verified',
      gateway_processed_at: new Date().toISOString(),
    }).eq('id', settlementId);
    return;
  }

  // Move to processing FIRST so concurrent runs are no-ops
  const { error: lockErr } = await supabase
    .from('payout_settlements')
    .update({ settlement_status: 'processing', gateway: s.gateway || 'razorpayx' })
    .eq('id', settlementId)
    .eq('settlement_status', s.settlement_status);
  if (lockErr) {
    logger.warn({ settlementId, err: lockErr.message }, '[PayoutExecutor] state-lock failed');
    // Another worker may have picked it up — bail
    return;
  }

  // If bank has no fund_account_id yet, create one on the fly
  let fundAccountId: string | null = bank.razorpayx_fund_account_id;
  try {
    if (!fundAccountId) {
      const { createContact, createFundAccount } = await import('./payoutGateway.service');
      const contact = await createContact({
        name: bank.account_holder_name,
        type: 'vendor',
        reference_id: `inst_${s.instructor_id}`,
      });
      const fund = await createFundAccount({
        contact_id: contact.id,
        account_holder_name: bank.account_holder_name,
        account_number: bank.account_number,
        ifsc: bank.ifsc_code,
      });
      fundAccountId = fund.id;
      await supabase.from('bank_accounts').update({
        razorpayx_contact_id: contact.id,
        razorpayx_fund_account_id: fund.id,
      }).eq('id', bank.id);
    }

    // Fire the actual payout
    const { createPayout } = await import('./payoutGateway.service');
    const out = await createPayout({
      fund_account_id: fundAccountId!,
      amount: Number(s.net_amount),
      reference_id: s.settlement_number,
      purpose: 'payout',
      narration: `GUM payout ${s.fy_label}`.slice(0, 30),
      notes: {
        instructor_id: String(s.instructor_id),
        payout_request_id: String(s.payout_request_id),
        gross: String(s.gross_amount),
        tds: String(s.tds_amount),
        net: String(s.net_amount),
      },
    });

    // Map gateway status → our domain
    let domainStatus = 'processing';
    if (['processed', 'completed', 'paid'].includes(out.status)) domainStatus = 'completed';
    else if (['failed', 'rejected', 'cancelled'].includes(out.status)) domainStatus = 'failed';
    else if (['reversed'].includes(out.status)) domainStatus = 'reversed';

    await supabase.from('payout_settlements').update({
      gateway_payout_id: out.id,
      gateway_status_raw: out.status,
      gateway_processed_at: new Date().toISOString(),
      settlement_status: domainStatus,
      settled_at: domainStatus === 'completed' ? new Date().toISOString() : null,
      transaction_reference: out.id,
    }).eq('id', settlementId);

    // If the gateway completed synchronously, debit the wallet now.
    // Otherwise the webhook will do it on transition to completed.
    if (domainStatus === 'completed') {
      await onPayoutCompleted(settlementId);
    }

    logger.info({ settlementId, gatewayPayoutId: out.id, gatewayStatus: out.status, domainStatus }, '[PayoutExecutor] gateway responded');
  } catch (e: any) {
    logger.error({ settlementId, err: e?.message }, '[PayoutExecutor] gateway call failed');
    await supabase.from('payout_settlements').update({
      settlement_status: 'failed',
      failure_reason: e?.message?.slice(0, 500) || 'gateway error',
      gateway_processed_at: new Date().toISOString(),
    }).eq('id', settlementId);
    throw e;   // surface to BullMQ for retry/DLQ
  }
}

/**
 * Called when a settlement transitions to 'completed' (either inline from
 * the executor or asynchronously from the webhook). Debits the wallet,
 * updates instructor_profiles aggregates.
 */
export async function onPayoutCompleted(settlementId: number): Promise<void> {
  const { data: s } = await supabase
    .from('payout_settlements')
    .select('id, instructor_id, gross_amount, net_amount, payout_request_id, settlement_number')
    .eq('id', settlementId)
    .is('deleted_at', null)
    .single();
  if (!s) return;

  // Debit instructor wallet for the gross amount (TDS retention is recorded
  // separately; the wallet only ever held the gross — net hit their bank,
  // the platform now owes the TDS amount to govt). Idempotent via source_id.
  try {
    await debitWallet({
      userId: s.instructor_id,
      amount: Number(s.gross_amount),
      sourceType: 'payout',
      sourceId: s.id,
      description: `Bank payout ${s.settlement_number}`,
      metadata: { payout_settlement_id: s.id, payout_request_id: s.payout_request_id },
    });
  } catch (e: any) {
    logger.error({ err: e?.message, settlementId }, '[PayoutExecutor] wallet debit failed');
  }

  // Update instructor profile aggregates (best-effort)
  try {
    const { data: inst } = await supabase
      .from('instructor_profiles')
      .select('user_id, total_paid_out, pending_earnings')
      .eq('user_id', s.instructor_id)
      .single();
    if (inst) {
      await supabase.from('instructor_profiles').update({
        total_paid_out: Math.round(((inst.total_paid_out || 0) + Number(s.gross_amount)) * 100) / 100,
        pending_earnings: Math.max(0, Math.round(((inst.pending_earnings || 0) - Number(s.gross_amount)) * 100) / 100),
      }).eq('user_id', s.instructor_id);
    }
  } catch { /* swallow */ }
}
