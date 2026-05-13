/**
 * Push Devices Controller (Phase 11.2.5)
 * ──────────────────────────────────────
 * Caller-scoped: a user can only register / list / delete their own devices.
 *
 * Routes:
 *   GET    /push/vapid-public-key      — public, returns VAPID public key
 *   POST   /push-devices/register      — auth'd
 *   GET    /me/push-devices            — auth'd, list own devices
 *   DELETE /push-devices/:endpoint     — auth'd, unsubscribe one device
 *
 * Endpoint URLs are long and contain `/` so we accept them base64url-encoded
 * in the DELETE path; the frontend just does `encodeURIComponent(endpoint)`.
 */

import { Request, Response } from 'express';
import { config } from '../../config';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';
import { logger } from '../../utils/logger';
import { registerPushDeviceSchema } from './pushDevice.schema';

/** GET /push/vapid-public-key — unauthenticated, returns the public VAPID key. */
export async function getVapidPublicKey(_req: Request, res: Response) {
  if (!config.push.vapidPublicKey) return err(res, 'Push not configured', 503);
  return ok(res, { vapidPublicKey: config.push.vapidPublicKey });
}

/** POST /push-devices/register — auth'd. Upserts on endpoint. */
export async function register(req: Request, res: Response) {
  const parsed = registerPushDeviceSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.issues[0].message, 400);

  const userId = req.user!.id;
  const { endpoint, keys, user_agent, platform } = parsed.data;

  // Upsert on the unique endpoint constraint. If a different user previously
  // registered this endpoint (shared device), bind it to the current user.
  const { data, error } = await supabase
    .from('push_devices')
    .upsert(
      {
        user_id:    userId,
        endpoint,
        p256dh:     keys.p256dh,
        auth:       keys.auth,
        user_agent: user_agent ?? null,
        platform:   platform   ?? 'web',
        is_active:  true,
        deleted_at: null,
      },
      { onConflict: 'endpoint' },
    )
    .select('id, endpoint, platform, is_active, last_used_at, created_at')
    .single();

  if (error) {
    logger.error({ err: error, userId }, '[push-devices] register failed');
    return err(res, error.message, 500);
  }

  logger.info({ userId, deviceId: data?.id, platform }, '[push-devices] registered');
  return ok(res, { device: data }, 'Push device registered');
}

/** GET /me/push-devices — list caller's active devices. */
export async function listMine(req: Request, res: Response) {
  const userId = req.user!.id;
  const { data, error } = await supabase
    .from('push_devices')
    .select('id, endpoint, platform, user_agent, is_active, last_used_at, created_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return err(res, error.message, 500);
  return ok(res, { devices: data ?? [], count: data?.length ?? 0 });
}

/** DELETE /push-devices/:endpoint — soft-delete + deactivate. */
export async function unregister(req: Request, res: Response) {
  const userId = req.user!.id;
  const rawEndpoint = decodeURIComponent(req.params.endpoint);

  if (!rawEndpoint.startsWith('http')) return err(res, 'Invalid endpoint', 400);

  const { data, error } = await supabase
    .from('push_devices')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('endpoint', rawEndpoint)
    .select('id')
    .maybeSingle();

  if (error) return err(res, error.message, 500);
  if (!data)  return err(res, 'Device not found', 404);

  return ok(res, { id: data.id }, 'Push device unregistered');
}
