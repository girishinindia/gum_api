/**
 * RazorpayX Webhook Listener (Phase 9.7)
 * ──────────────────────────────────────
 * RazorpayX fires HTTP POSTs to a configured URL on every payout lifecycle
 * event:
 *
 *   payout.created      → payout queued at the bank rails
 *   payout.queued       → balance is low; payout will retry when funded
 *   payout.processing   → bank is processing the transfer
 *   payout.processed    → success (money in beneficiary account)
 *   payout.failed       → terminal failure (insufficient balance, etc.)
 *   payout.rejected     → terminal rejection (e.g. RazorpayX manual review)
 *   payout.reversed     → success then reversed by bank (rare)
 *
 * Security:
 *   • Signature is HMAC-SHA256(rawBody, RAZORPAYX_WEBHOOK_SECRET) hex,
 *     delivered in header `x-razorpay-signature`.
 *   • Idempotency: same provider='razorpayx' bucket on the existing
 *     webhook_events table (Phase 2 plumbing).
 *
 * Mapping to our domain:
 *   payout.processed  → settlement_status='completed' + onPayoutCompleted
 *   payout.reversed   → settlement_status='reversed'  + reverse wallet debit
 *   payout.failed     → settlement_status='failed'
 *   payout.rejected   → settlement_status='failed'
 *   payout.processing → settlement_status='processing'
 *   payout.queued     → settlement_status='queued'
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../../config/supabase';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import {
  beginWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  fallbackEventId,
} from '../../services/webhookEvents.service';
import { onPayoutCompleted } from '../../services/payoutExecutor.service';
import { creditWallet } from '../../services/wallet.service';

const STATUS_MAP: Record<string, string> = {
  'payout.created':    'queued',
  'payout.queued':     'queued',
  'payout.processing': 'processing',
  'payout.processed':  'completed',
  'payout.failed':     'failed',
  'payout.rejected':   'failed',
  'payout.reversed':   'reversed',
};

function verifySignature(rawBody: string, signatureHeader: string): boolean {
  const secret = config.payouts.razorpayx.webhookSecret;
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHeader.toLowerCase().replace(/^sha256=/, ''), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function handleRazorpayxWebhook(req: Request, res: Response) {
  let webhookRowId: number | null = null;
  try {
    const sig = String(req.headers['x-razorpay-signature'] || req.headers['x-razorpayx-signature'] || '');
    // Exact raw bytes captured by the express.json `verify` hook in app.ts.
    const rawBody: string = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(req.body ?? {});

    if (!verifySignature(rawBody, sig)) {
      logger.warn('[RazorpayXWebhook] invalid signature');
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    const event: string = String(req.body.event || '');
    const payload = req.body.payload || {};
    const payoutEntity = payload?.payout?.entity || {};
    const gatewayPayoutId: string = payoutEntity.id;

    const headerEventId = (req.headers['x-razorpay-event-id'] as string) || '';
    const eventId = headerEventId || fallbackEventId('razorpayx', event, gatewayPayoutId, payoutEntity.created_at);

    const registered = await beginWebhookEvent({
      provider: 'razorpayx',
      eventId,
      eventType: event || 'unknown',
      rawBody,
      payload: req.body,
      relatedType: 'payout_settlement',
      relatedId: null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    if (!registered) {
      return res.status(200).json({ success: true, duplicate: true });
    }
    webhookRowId = registered.id;

    if (!gatewayPayoutId) {
      logger.warn({ event }, '[RazorpayXWebhook] missing payout id — ignoring');
      if (webhookRowId) await completeWebhookEvent(webhookRowId, { skipped: 'no_payout_id' });
      return res.status(200).json({ success: true, skipped: 'no_payout_id' });
    }

    // Find our settlement
    const { data: settlement } = await supabase
      .from('payout_settlements')
      .select('id, instructor_id, settlement_status, gross_amount, net_amount, settlement_number, gateway_payout_id')
      .eq('gateway_payout_id', gatewayPayoutId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!settlement) {
      logger.info({ gatewayPayoutId, event }, '[RazorpayXWebhook] no matching settlement — skipping');
      if (webhookRowId) await completeWebhookEvent(webhookRowId, { skipped: 'no_settlement', gatewayPayoutId });
      return res.status(200).json({ success: true, skipped: 'no_settlement' });
    }

    const newDomain = STATUS_MAP[event];
    if (!newDomain) {
      logger.info({ event, gatewayPayoutId }, '[RazorpayXWebhook] unhandled event — recording only');
      if (webhookRowId) await completeWebhookEvent(webhookRowId, { skipped: 'unhandled_event', event });
      return res.status(200).json({ success: true, skipped: 'unhandled_event' });
    }

    // Update settlement status (don't move terminal → non-terminal)
    const TERMINAL = ['completed', 'reversed', 'failed'];
    const wasTerminal = TERMINAL.includes(String(settlement.settlement_status));
    if (wasTerminal && newDomain !== 'reversed') {
      // Already terminal — only a reversal can override
      if (webhookRowId) await completeWebhookEvent(webhookRowId, { skipped: 'already_terminal', currentStatus: settlement.settlement_status });
      return res.status(200).json({ success: true, skipped: 'already_terminal' });
    }

    const upd: Record<string, any> = {
      settlement_status: newDomain,
      gateway_status_raw: event.replace(/^payout\./, ''),
      gateway_processed_at: new Date().toISOString(),
    };
    if (newDomain === 'completed') upd.settled_at = new Date().toISOString();
    if (newDomain === 'failed') upd.failure_reason = payoutEntity.failure_reason || event;

    await supabase.from('payout_settlements').update(upd).eq('id', settlement.id);

    // Post-transition side effects
    if (newDomain === 'completed') {
      await onPayoutCompleted(settlement.id);
    } else if (newDomain === 'reversed') {
      // Bank reversed the transfer — credit the instructor's wallet back.
      // Idempotent via source_id.
      try {
        await creditWallet({
          userId: settlement.instructor_id,
          amount: Number(settlement.gross_amount),
          sourceType: 'adjustment',
          sourceId: settlement.id,
          description: `Payout ${settlement.settlement_number} reversed by bank`,
          metadata: { reversed_settlement_id: settlement.id, source: 'razorpayx_webhook' },
        });
      } catch (e: any) {
        logger.error({ err: e?.message, settlementId: settlement.id }, '[RazorpayXWebhook] reversal credit failed');
      }
    }

    if (webhookRowId) await completeWebhookEvent(webhookRowId, { settlementId: settlement.id, previousStatus: settlement.settlement_status, newStatus: newDomain });
    return res.status(200).json({ success: true, settlement_id: settlement.id, new_status: newDomain });
  } catch (e: any) {
    logger.error({ err: e?.message, stack: e?.stack }, '[RazorpayXWebhook] unhandled error');
    if (webhookRowId) {
      try { await failWebhookEvent(webhookRowId, e?.message || 'unknown'); } catch { /* swallow */ }
    }
    return res.status(200).json({ success: true, recorded_failure: true });
  }
}
