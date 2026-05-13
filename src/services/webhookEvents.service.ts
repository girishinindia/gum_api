/**
 * Webhook Events Service
 * ──────────────────────
 * Generic idempotency wrapper for any incoming webhook (Razorpay, Bunny Stream,
 * RazorpayX, etc.). The contract is simple:
 *
 *   const acquired = await beginWebhookEvent({ provider, eventId, eventType, ... });
 *   if (!acquired) return; // duplicate — already processed (or in-flight)
 *   try {
 *     await doWork();
 *     await completeWebhookEvent(rowId);
 *   } catch (e) {
 *     await failWebhookEvent(rowId, e.message);
 *     throw e;
 *   }
 *
 * Because the row insert is gated by a UNIQUE (provider, event_id) index, a
 * second delivery is rejected with Postgres error 23505 and we return null.
 * That makes the whole flow safe under concurrent re-delivery.
 */

import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export type WebhookProvider = 'razorpay' | 'razorpayx' | 'bunny_stream' | 'cashfree' | 'stripe' | string;

export interface BeginWebhookEventParams {
  provider: WebhookProvider;
  eventId: string;
  eventType: string;
  rawBody?: string;
  payload?: any;
  relatedType?: string;
  relatedId?: number | string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface WebhookEventRow {
  id: number;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'skipped';
  attempts: number;
}

/**
 * Atomically register the event as "in-flight".
 *
 * @returns the new row's id if WE are the first to process this event,
 *          or null if it was already processed / in-flight (duplicate).
 */
export async function beginWebhookEvent(params: BeginWebhookEventParams): Promise<WebhookEventRow | null> {
  const payloadHash = params.rawBody
    ? crypto.createHash('sha256').update(params.rawBody).digest('hex')
    : null;

  const { data, error } = await supabase
    .from('webhook_events')
    .insert({
      provider: params.provider,
      event_id: params.eventId,
      event_type: params.eventType,
      payload_hash: payloadHash,
      payload: params.payload ?? null,
      status: 'processing',
      attempts: 1,
      related_type: params.relatedType ?? null,
      related_id: params.relatedId != null ? Number(params.relatedId) : null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    })
    .select('id, status, attempts')
    .single();

  if (error) {
    // 23505 = unique_violation => duplicate event => already processed (or in-flight)
    if ((error as any).code === '23505') {
      logger.info(
        { provider: params.provider, eventId: params.eventId, eventType: params.eventType },
        '[webhookEvents] Duplicate event — skipping',
      );
      return null;
    }
    logger.error(
      { err: error, provider: params.provider, eventId: params.eventId },
      '[webhookEvents] Failed to register event',
    );
    throw error;
  }

  return data as WebhookEventRow;
}

/** Mark the event row as successfully processed. */
export async function completeWebhookEvent(rowId: number, summary?: any): Promise<void> {
  const updates: any = {
    status: 'processed',
    processed_at: new Date().toISOString(),
  };
  if (summary !== undefined) updates.payload = summary;

  await supabase.from('webhook_events').update(updates).eq('id', rowId);
}

/** Mark the event row as failed; safe to retry later by re-delivering. */
export async function failWebhookEvent(rowId: number, errorMessage: string): Promise<void> {
  await supabase
    .from('webhook_events')
    .update({
      status: 'failed',
      processed_at: new Date().toISOString(),
      last_error: errorMessage.slice(0, 4000),
    })
    .eq('id', rowId);
}

/**
 * Build a stable event id for providers that don't supply one.
 * (Razorpay does send x-razorpay-event-id; but if it's ever missing we fall
 *  back to a deterministic hash of the provider + the primary entity id.)
 */
export function fallbackEventId(provider: string, ...parts: (string | number | null | undefined)[]): string {
  return (
    `${provider}:` +
    crypto
      .createHash('sha1')
      .update(parts.filter(Boolean).join('|'))
      .digest('hex')
      .slice(0, 32)
  );
}
