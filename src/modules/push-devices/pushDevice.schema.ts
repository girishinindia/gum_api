import { z } from 'zod';

/**
 * Push device registration — two transports accepted.
 *
 * Web Push (VAPID), Phase 11.2.5 — browser PushManager.subscribe().toJSON():
 *   { endpoint, keys: { p256dh, auth } }
 *
 * Mobile (FCM), Phase 45 — Flutter firebase_messaging token:
 *   { provider: 'fcm', fcm_token, platform: 'android' | 'ios' }
 *
 * `user_agent` is client-supplied for debugging — not trusted.
 */
export const webPushDeviceSchema = z.object({
  provider:   z.literal('webpush').optional(),
  endpoint:   z.string().url().min(20).max(2048),
  keys: z.object({
    p256dh:   z.string().min(20).max(255),
    auth:     z.string().min(8).max(255),
  }),
  user_agent: z.string().max(512).optional(),
  platform:   z.enum(['web', 'ios', 'android']).optional(),
});

export const fcmDeviceSchema = z.object({
  provider:   z.literal('fcm'),
  fcm_token:  z.string().min(20).max(4096),
  user_agent: z.string().max(512).optional(),
  platform:   z.enum(['ios', 'android']),
});

// FCM first: an FCM body carries `provider:'fcm'`; a web body has no provider
// (or 'webpush') and is matched by the second branch.
export const registerPushDeviceSchema = z.union([fcmDeviceSchema, webPushDeviceSchema]);

export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;
