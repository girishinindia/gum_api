import { Request, Response } from 'express';

import { env } from '../../../config/env';
import { sendSuccess } from '../../../core/utils/api-response';
import { getPool } from '../../../database/pg-pool';
import { getRedisClient } from '../../../database/redis';
import { healthService } from '../../../modules/health/health.service';

export const getHealth = (_req: Request, res: Response) => {
  return sendSuccess(res, healthService.getSnapshot(), 'Healthy');
};

/**
 * GET /api/v1/health/debug
 *
 * Diagnostic endpoint that tests each infrastructure connection individually.
 * Returns detailed status for: PostgreSQL, Redis, DNS resolution, and env checks.
 *
 * ⚠️  REMOVE THIS ENDPOINT once debugging is complete (contains sensitive info).
 */
export const getDebugHealth = async (_req: Request, res: Response) => {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeEnv: env.NODE_ENV,
    nodeVersion: process.version,
    platform: process.platform,
    uptime: `${Math.round(process.uptime())}s`,
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
  };

  // ── Test 1: DNS Resolution ──────────────────────────────────
  try {
    const dns = await import('node:dns');
    const { resolve4, resolve6 } = dns.promises;

    // Extract hostname from DATABASE_URL
    const dbHost = new URL(env.DATABASE_URL).hostname;

    let ipv4: string[] = [];
    let ipv6: string[] = [];

    try { ipv4 = await resolve4(dbHost); } catch { ipv4 = []; }
    try { ipv6 = await resolve6(dbHost); } catch { ipv6 = []; }

    results.dns = {
      status: 'ok',
      host: dbHost,
      ipv4,
      ipv6,
      defaultOrder: dns.getDefaultResultOrder()
    };
  } catch (error) {
    results.dns = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  // ── Test 2: PostgreSQL Connection ───────────────────────────
  try {
    const pool = getPool();
    const start = Date.now();
    const pgResult = await pool.query('SELECT NOW() AS server_time, current_database() AS db_name');
    const duration = Date.now() - start;

    results.postgresql = {
      status: 'ok',
      durationMs: duration,
      serverTime: pgResult.rows[0]?.server_time,
      database: pgResult.rows[0]?.db_name,
      poolTotal: pool.totalCount,
      poolIdle: pool.idleCount,
      poolWaiting: pool.waitingCount,
      sslEnabled: env.NODE_ENV === 'production'
    };
  } catch (error) {
    results.postgresql = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string })?.code ?? null,
      address: (error as { address?: string })?.address ?? null
    };
  }

  // ── Test 3: PostgreSQL UDF Check ────────────────────────────
  try {
    const pool = getPool();
    const start = Date.now();
    const udfResult = await pool.query(
      `SELECT udf_check_email_exists(p_email := $1) AS result`,
      ['test-debug@nonexistent.com']
    );
    const duration = Date.now() - start;

    results.udf_check = {
      status: 'ok',
      durationMs: duration,
      result: udfResult.rows[0]?.result
    };
  } catch (error) {
    results.udf_check = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  // ── Test 4: Redis Connection ────────────────────────────────
  try {
    const redis = getRedisClient();
    const start = Date.now();

    // Ensure connection is established (lazyConnect)
    if (redis.status !== 'ready' && redis.status !== 'connecting') {
      await redis.connect();
    }

    const pong = await redis.ping();
    const duration = Date.now() - start;

    results.redis = {
      status: 'ok',
      durationMs: duration,
      ping: pong,
      redisStatus: redis.status
    };
  } catch (error) {
    results.redis = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  // ── Test 5: Environment Config Check ────────────────────────
  results.envCheck = {
    databaseUrlSet: !!env.DATABASE_URL,
    databaseUrlHasSSL: env.DATABASE_URL.includes('sslmode=require'),
    redisUrlSet: !!env.UPSTASH_REDIS_URL,
    recaptchaEnabled: env.RECAPTCHA_ENABLED,
    trustProxy: env.NODE_ENV === 'production' ? 'enabled (1)' : 'disabled',
    rateLimitMax: env.RATE_LIMIT_MAX,
    port: env.PORT
  };

  // ── Overall Status ──────────────────────────────────────────
  const allOk =
    (results.postgresql as { status: string })?.status === 'ok' &&
    (results.redis as { status: string })?.status === 'ok' &&
    (results.udf_check as { status: string })?.status === 'ok';

  return res.status(allOk ? 200 : 503).json({
    success: allOk,
    message: allOk ? 'All systems operational' : 'One or more systems failing',
    data: results
  });
};
