import { z } from 'zod';

/**
 * Phase 11.2.5 — Body shape returned by the browser's
 *   `PushManager.subscribe({ applicationServerKey })`
 * .toJSON() → `{ endpoint, keys: { p256dh, auth } }`.
 *
 * `user_agent` is sent by the client for debugging — not trusted.
 */
export const registerPushDeviceSchema = z.object({
  endpoint:   z.string().url().min(20).max(2048),
  keys: z.object({
    p256dh:   z.string().min(20).max(255),
    auth:     z.string().min(8).max(255),
  }),
  user_agent: z.string().max(512).optional(),
  platform:   z.enum(['web', 'ios', 'android']).optional(),
});

export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;
