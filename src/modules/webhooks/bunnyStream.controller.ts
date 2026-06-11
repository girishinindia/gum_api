/**
 * Bunny Stream Webhook Listener
 * ─────────────────────────────
 * Bunny fires a POST to a configured URL on every encoding state change.
 * Payload shape (per Bunny docs):
 *   {
 *     "VideoLibraryId": 629329,
 *     "VideoGuid": "abc-...",
 *     "Status": 0|1|2|3|4|5|6,
 *     "EncodingStatus"?: "..."
 *   }
 *
 * Status codes (Bunny Stream API):
 *   0  Created          — record exists, no upload yet
 *   1  Uploaded         — binary received, queued for encoding
 *   2  Processing       — being read / pre-processed
 *   3  Transcoding      — actively transcoding
 *   4  Finished         — ready to play
 *   5  Error            — encoding failed
 *   6  UploadFailed     — upload itself failed
 *
 * Security:
 *   • PRIMARY: shared-secret token in the webhook URL query string —
 *     configure Bunny's WebhookUrl as
 *       https://<api-host>/api/v1/webhooks/bunny-stream?token=<BUNNY_STREAM_WEBHOOK_SECRET>
 *     Bunny Stream does NOT sign webhook payloads, so URL-token auth is
 *     the practical mechanism. Compared in constant time.
 *   • FALLBACK: HMAC-SHA256 of the raw body in an `X-Bunny-Signature`-style
 *     header (kept for proxies/gateways that sign on Bunny's behalf).
 *   • Fail-closed: if BUNNY_STREAM_WEBHOOK_SECRET is unset, reject all.
 *   • Idempotency: webhook_events table with provider='bunny_stream',
 *     event_id = `<library>:<video>:<status>:<timestamp>` — duplicates
 *     are answered 200 OK with `{duplicate: true}`.
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

const BUNNY_STATUS_TO_TEXT: Record<number, string> = {
  0: 'created',
  1: 'uploaded',
  2: 'processing',
  3: 'transcoding',
  4: 'ready',
  5: 'error',
  6: 'upload_failed',
};

function getSignatureHeader(req: Request): string {
  const h = req.headers;
  return String(
    (h['x-bunny-signature'] ||
      h['bunny-signature'] ||
      h['x-bunnycdn-signature'] ||
      '') as string,
  );
}

/**
 * Constant-time match of the `?token=` query parameter against the shared
 * secret. Both sides are SHA-256-hashed first so timingSafeEqual always
 * receives equal-length buffers.
 */
function verifyUrlToken(req: Request): boolean {
  if (!config.bunny.streamWebhookSecret) return false; // fail-closed
  const token = String(req.query.token || '');
  if (!token) return false;
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(config.bunny.streamWebhookSecret).digest();
  return crypto.timingSafeEqual(a, b);
}

function verifyBunnySignature(rawBody: string, signature: string): boolean {
  if (!config.bunny.streamWebhookSecret) {
    // If no secret is configured we MUST reject everything — fail-closed.
    return false;
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', config.bunny.streamWebhookSecret)
    .update(rawBody)
    .digest('hex');

  // Constant-time compare
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature.toLowerCase().replace(/^sha256=/, ''), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function handleBunnyStreamWebhook(req: Request, res: Response) {
  let webhookRowId: number | null = null;
  try {
    const rawBody = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(req.body ?? {});
    const signature = getSignatureHeader(req);

    // Accept EITHER the URL token (primary — Bunny doesn't sign payloads)
    // OR a valid HMAC signature header (proxy-signed setups).
    if (!verifyUrlToken(req) && !verifyBunnySignature(rawBody, signature)) {
      logger.warn(
        { token_present: !!req.query.token, signature_present: !!signature },
        '[BunnyWebhook] Auth failed — rejecting',
      );
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    const body = req.body || {};
    const videoGuid: string = String(body.VideoGuid || body.videoGuid || '');
    const libraryId: string = String(body.VideoLibraryId || body.videoLibraryId || '');
    const statusCode: number = Number(body.Status ?? body.status ?? -1);

    if (!videoGuid || !libraryId || statusCode < 0) {
      logger.warn({ body }, '[BunnyWebhook] Missing required fields');
      return res.status(400).json({ success: false, error: 'Bad payload' });
    }

    // Only accept callbacks for OUR library
    if (libraryId !== String(config.bunny.streamLibraryId)) {
      logger.warn(
        { received: libraryId, expected: config.bunny.streamLibraryId },
        '[BunnyWebhook] Library mismatch — ignoring',
      );
      return res.status(200).json({ success: true, ignored: 'library_mismatch' });
    }

    // Idempotency — same (video, status) at the same Bunny timestamp is one event
    const eventId = fallbackEventId('bunny_stream', libraryId, videoGuid, statusCode, body.Time || body.time);

    const registered = await beginWebhookEvent({
      provider: 'bunny_stream',
      eventId,
      eventType: `video.${BUNNY_STATUS_TO_TEXT[statusCode] || `status_${statusCode}`}`,
      rawBody,
      payload: body,
      relatedType: 'sub_topic',
      relatedId: null,
    });

    if (!registered) {
      return res.status(200).json({ success: true, duplicate: true });
    }
    webhookRowId = registered.id;

    // Map to our domain status
    const newStatus = BUNNY_STATUS_TO_TEXT[statusCode] || `status_${statusCode}`;

    // Find the sub-topic referencing this video
    const { data: subTopic } = await supabase
      .from('sub_topics')
      .select('id, video_id, video_status')
      .eq('video_id', videoGuid)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (!subTopic) {
      // Not necessarily an error — could be an orphaned video being cleaned up
      logger.info({ videoGuid, libraryId }, '[BunnyWebhook] No sub_topic for video — skipping');
      if (webhookRowId) await completeWebhookEvent(webhookRowId, { skipped: 'no_sub_topic', videoGuid });
      return res.status(200).json({ success: true, skipped: 'no_sub_topic' });
    }

    // Update sub-topic status + thumbnail (Bunny exposes a thumbnail at a known path once ready)
    const updates: Record<string, any> = { video_status: newStatus };
    if (statusCode === 4 /* finished */) {
      const streamCdn = config.bunny.streamCdn || 'https://vz-cdn.b-cdn.net';
      updates.video_thumbnail_url = `${streamCdn.replace(/\/+$/, '')}/${videoGuid}/thumbnail.jpg`;
    }

    const { error: updErr } = await supabase
      .from('sub_topics')
      .update(updates)
      .eq('id', subTopic.id);

    if (updErr) {
      logger.error({ err: updErr.message, subTopicId: subTopic.id }, '[BunnyWebhook] sub_topic update failed');
      if (webhookRowId) await failWebhookEvent(webhookRowId, updErr.message);
      // Still 200 — Bunny otherwise retries; we'll catch via webhook_events.status='failed'
      return res.status(200).json({ success: true, recorded_failure: true });
    }

    if (webhookRowId) {
      await completeWebhookEvent(webhookRowId, {
        subTopicId: subTopic.id,
        previousStatus: subTopic.video_status,
        newStatus,
      });
    }

    return res.status(200).json({ success: true, sub_topic_id: subTopic.id, new_status: newStatus });
  } catch (e: any) {
    logger.error({ err: e?.message, stack: e?.stack }, '[BunnyWebhook] Unhandled error');
    if (webhookRowId) {
      try { await failWebhookEvent(webhookRowId, e?.message || 'unknown'); } catch { /* best-effort */ }
    }
    // 200 OK so Bunny does not retry-storm us on bugs we own
    return res.status(200).json({ success: true, recorded_failure: true });
  }
}
