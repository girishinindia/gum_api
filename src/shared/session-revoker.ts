// ═══════════════════════════════════════════════════════════════
// session-revoker — shared helper for force-logging-out a user.
//
// Callers (auth-flows for password / email / mobile changes,
// users.changeUserRole for super-admin role changes, etc.) use
// this module when a state change should kick the target user's
// active tokens off of all devices.
//
// Two layers must be flipped together for the revocation to be
// effective:
//
//   1. DB — `udf_session_revoke_all(p_user_id)` marks every row
//      in `user_sessions` as is_active = false and stamps a
//      revoked_at timestamp. This is the source of truth for audit
//      and also what refresh-token rotation consults.
//
//   2. Redis — `redisRevoked` blocklist is what the authenticate
//      middleware checks on every request via `jti`. Without this
//      step, already-issued access tokens would continue to verify
//      until they expired on their own (up to JWT_ACCESS_EXPIRES_IN).
//
// We query `user_sessions` BEFORE calling the UDF so we still have
// access to the jtis (the UDF does not return them). A second pass
// could be layered in if race windows matter, but the existing
// auth-flows code has run this shape in production since Step 11
// without a gap.
// ═══════════════════════════════════════════════════════════════

import ms from 'ms';

import { db } from '../database/db';
import { getPool } from '../database/pg-pool';
import { redisRevoked } from '../database/redis';
import { env } from '../config/env';
import { logger } from '../core/logger/logger';

const parseAccessTtlSeconds = (): number => {
  const raw = env.JWT_ACCESS_EXPIRES_IN;
  const millis = typeof raw === 'string' ? ms(raw as ms.StringValue) : undefined;
  if (typeof millis === 'number' && Number.isFinite(millis) && millis > 0) {
    return Math.ceil(millis / 1000);
  }
  return 15 * 60;
};

/**
 * Push every active session jti for `userId` into the Redis
 * revocation list with a TTL matching the access-token lifetime.
 *
 * Idempotent: calling twice for the same user is safe (the set will
 * just re-add the same keys).
 */
export const blocklistActiveSessionsInRedis = async (
  userId: number
): Promise<number> => {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string | number }>(
    `SELECT id
       FROM user_sessions
      WHERE user_id = $1::BIGINT
        AND expires_at > NOW()`,
    [userId]
  );
  if (rows.length === 0) return 0;
  const ttl = parseAccessTtlSeconds();
  await Promise.all(
    rows.map((row) => redisRevoked.add(String(row.id), ttl))
  );
  return rows.length;
};

/**
 * Full revoke: flip DB rows (`udf_session_revoke_all`) AND push
 * jtis into the Redis blocklist so currently-issued access tokens
 * also stop validating.
 *
 * Order matters: we blocklist BEFORE the DB flip so we can still
 * read `user_sessions` for the jtis. The DB UDF only touches
 * is_active / revoked_at, so the row ids survive the update.
 */
export const revokeAllUserSessions = async (
  userId: number,
  reason: string
): Promise<void> => {
  let redisCount = 0;
  try {
    redisCount = await blocklistActiveSessionsInRedis(userId);
  } catch (err) {
    logger.warn(
      { err, userId, reason },
      '[session-revoker] Redis blocklist push failed — continuing with DB flip'
    );
  }

  try {
    await db.callFunction('udf_session_revoke_all', {
      p_user_id: userId
    });
  } catch (err) {
    logger.error(
      { err, userId, reason },
      '[session-revoker] udf_session_revoke_all failed'
    );
    throw err;
  }

  logger.info(
    { userId, reason, redisCount },
    '[session-revoker] revoked all sessions'
  );
};
