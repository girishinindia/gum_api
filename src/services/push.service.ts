/**
 * Push Service (Phase 11.2.3)
 * ───────────────────────────
 * Web Push (VAPID) via the `web-push` library — no Firebase.
 *
 * Two entry points:
 *
 *   • `sendPushDirect(device, payload)` — fire one push immediately.
 *     Used by the queue worker and as the syncFallback in `enqueuePush`.
 *
 *   • `enqueuePush(userId, payload)` — fan out a push to every active
 *     device owned by `userId`. Each device gets its own queue job so a
 *     single dead endpoint can't poison the rest of the batch.
 *
 * Auto-deactivation: when the browser vendor returns 404 / 410, the
 * subscription is gone for good (user uninstalled the app, cleared site
 * data, etc.) — we mark `is_active = false` and stop trying.
 */

import webpush from 'web-push';
import { config } from '../config';
import { logger } from '../utils/logger';
import { supabase } from '../config/supabase';
import { enqueue } from './queue.service';
import { getMessaging } from './firebase';

let _configured = false;
function ensureConfigured() {
  if (_configured) return;
  if (!config.push.vapidPublicKey || !config.push.vapidPrivateKey) {
    throw new Error('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set');
  }
  webpush.setVapidDetails(
    config.push.vapidSubject,
    config.push.vapidPublicKey,
    config.push.vapidPrivateKey,
  );
  _configured = true;
}

export interface PushDevice {
  id:       number;
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

export interface PushPayload {
  title: string;
  body:  string;
  /** Click target (relative or absolute URL). The service worker handles `notificationclick`. */
  url?:  string;
  icon?: string;
  /** Caller-provided correlation id surfaced in logs. */
  tag?:  string;
  /** Arbitrary structured data passed through to the SW (kept ≤ 3KB total payload after JSON-encode). */
  data?: Record<string, unknown>;
}

/**
 * Send one push to one device. Throws on transport errors; on 404/410
 * the device is silently deactivated and the call resolves.
 *
 * @returns `'sent'` on success, `'gone'` if the subscription is dead.
 */
export async function sendPushDirect(
  device: PushDevice,
  payload: PushPayload,
): Promise<'sent' | 'gone'> {
  ensureConfigured();

  const body = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    url:   payload.url  ?? '/',
    icon:  payload.icon ?? '/icons/notification.png',
    tag:   payload.tag,
    data:  payload.data ?? {},
  });

  try {
    await webpush.sendNotification(
      { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      body,
      { TTL: 60 * 60 * 24 },   // browser holds the message up to 1 day if device is offline
    );

    // Mark device "alive" so we can prune stale ones later.
    await supabase.from('push_devices')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', device.id);

    return 'sent';
  } catch (e: any) {
    const status = e?.statusCode ?? e?.status ?? null;
    if (status === 404 || status === 410) {
      // Subscription is permanently dead — flip off.
      await supabase.from('push_devices')
        .update({ is_active: false })
        .eq('id', device.id);
      logger.info({ deviceId: device.id, status }, '[push] deactivated dead subscription');
      return 'gone';
    }
    logger.error({ err: e, deviceId: device.id, status }, '[push] sendNotification failed');
    throw e;
  }
}

/** A push_devices row that carries an FCM token (mobile). */
export interface FcmDevice {
  id:        number;
  fcm_token: string;
}

/** FCM data payloads must be flat string→string maps. */
function fcmData(payload: PushPayload): Record<string, string> {
  const out: Record<string, string> = { url: payload.url ?? '/' };
  if (payload.tag) out.tag = payload.tag;
  for (const [k, v] of Object.entries(payload.data ?? {})) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

/**
 * Best-effort multicast to a user's mobile (FCM) devices. No-ops when Firebase
 * isn't configured. Unregistered / invalid tokens are deactivated so the table
 * self-prunes, mirroring the 404/410 handling for web push.
 */
export async function sendFcmToDevices(
  devices: FcmDevice[],
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  const messaging = getMessaging();
  if (!messaging || devices.length === 0) return { sent: 0, pruned: 0 };

  try {
    const resp = await messaging.sendEachForMulticast({
      tokens: devices.map((d) => d.fcm_token),
      notification: { title: payload.title, body: payload.body },
      data: fcmData(payload),
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    const dead: number[] = [];
    const alive: number[] = [];
    resp.responses.forEach((r: any, i: number) => {
      if (r.success) { alive.push(devices[i].id); return; }
      const code: string = r.error?.code || r.error?.errorInfo?.code || '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) dead.push(devices[i].id);
    });

    if (dead.length) {
      await supabase.from('push_devices').update({ is_active: false }).in('id', dead);
      logger.info({ count: dead.length }, '[fcm] deactivated dead tokens');
    }
    if (alive.length) {
      await supabase.from('push_devices')
        .update({ last_used_at: new Date().toISOString() })
        .in('id', alive);
    }
    return { sent: alive.length, pruned: dead.length };
  } catch (e) {
    logger.error({ err: e }, '[fcm] multicast send failed');
    return { sent: 0, pruned: 0 };
  }
}

/**
 * Fan a push out to every active device for a user. Each device gets its
 * own queue job so failures are isolated. Returns the number of devices
 * targeted (jobs enqueued, not delivery successes).
 *
 * When the push queue is disabled (PUSH_QUEUE_ENABLED=false), sends
 * synchronously in-process via `syncFallback`.
 */
export interface EnqueuePushResult {
  /** Total devices targeted (web + fcm). */
  enqueued: number;
  /** Pushes confirmed sent in-process (sync path). 0 when queued to the worker. */
  sent: number;
  /** Dead subscriptions pruned (404/410 web, unregistered FCM) during this send. */
  gone: number;
  /** Sends that threw a transport error in-process. */
  failed: number;
}

export async function enqueuePush(
  userId: number,
  payload: PushPayload,
): Promise<EnqueuePushResult> {
  const empty: EnqueuePushResult = { enqueued: 0, sent: 0, gone: 0, failed: 0 };

  // Fetch active devices for the user (service-role bypasses RLS).
  const { data: devices, error } = await supabase
    .from('push_devices')
    .select('id, provider, endpoint, p256dh, auth, fcm_token')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (error) {
    logger.error({ err: error, userId }, '[push] failed to load devices');
    return empty;
  }
  if (!devices || devices.length === 0) {
    logger.debug({ userId }, '[push] no active devices');
    return empty;
  }

  // Split by transport: web push (VAPID) vs mobile push (FCM).
  const webDevices = (devices as any[]).filter((d) => d.provider !== 'fcm' && d.endpoint) as PushDevice[];
  const fcmDevices = (devices as any[]).filter((d) => d.provider === 'fcm' && d.fcm_token) as FcmDevice[];

  let sent = 0, gone = 0, failed = 0;

  // Mobile (FCM): best-effort multicast — no per-device queue needed.
  if (fcmDevices.length) {
    const r = await sendFcmToDevices(fcmDevices, payload);
    sent += r.sent;
    gone += r.pruned;
  }

  // Web (VAPID): one queue job per device — failure isolation. When queues are
  // disabled the syncFallback runs in-process (awaited), so we capture the real
  // send outcome here — including dead subscriptions pruned to is_active=false.
  for (const d of webDevices) {
    await enqueue<{ device: PushDevice; payload: PushPayload }>(
      'push',
      'send',
      { device: d, payload },
      {
        // Stable job id keeps double-enqueues idempotent for short windows.
        jobId: `push:${d.id}:${payload.tag ?? Date.now()}`,
        syncFallback: async ({ device, payload }) => {
          try {
            const status = await sendPushDirect(device, payload);
            if (status === 'gone') gone++; else sent++;
          } catch (e) {
            failed++;
            logger.warn({ err: e, deviceId: device.id }, '[push] syncFallback delivery failed');
          }
        },
      },
    );
  }

  const enqueued = webDevices.length + fcmDevices.length;
  if (gone > 0) logger.info({ userId, sent, gone, failed }, '[push] dead subscriptions pruned on send');
  return { enqueued, sent, gone, failed };
}

/**
 * Worker processor — wired in `src/worker.ts`.
 */
export async function processPushJob(job: {
  data: { device: PushDevice; payload: PushPayload };
}): Promise<{ status: 'sent' | 'gone' }> {
  const status = await sendPushDirect(job.data.device, job.data.payload);
  return { status };
}
