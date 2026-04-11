/* eslint-disable no-console */
/**
 * Step 2 — Environment & configuration verification.
 *
 * Runs four checks in sequence and exits non-zero on the first failure:
 *   1. env.ts parses cleanly (all Zod requirements satisfied)
 *   2. pg pool connects to Supabase and executes SELECT 1 + version()
 *   3. ioredis client connects and responds to PING
 *   4. Logger emits one line at every level
 *
 * Usage: npx tsx scripts/verify-config.ts
 */

import { env } from '../src/config/env';
import { logger } from '../src/core/logger/logger';
import { closePool, getPool } from '../src/database/pg-pool';
import { getRedisClient } from '../src/database/redis';

// ─── Tiny reporter ─────────────────────────────────────────
type CheckResult = { name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✔' : '✖'}  ${name.padEnd(38)} ${detail}`);
};

// ─── Redaction helper ──────────────────────────────────────
const mask = (s: string, head = 4, tail = 4): string => {
  if (!s || s.length <= head + tail) return '[REDACTED]';
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
};

async function main(): Promise<void> {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Step 2 — Environment & Configuration Verification');
  console.log('══════════════════════════════════════════════════════\n');

  // ─── 1. ENV check ────────────────────────────────────
  console.log('1. Environment variables (Zod-parsed)\n');
  try {
    record('NODE_ENV',               true, env.NODE_ENV);
    record('APP_NAME',                true, env.APP_NAME);
    record('PORT',                    true, String(env.PORT));
    record('API_VERSION',             true, env.API_VERSION);
    record('TIMEZONE',                true, env.TIMEZONE);
    record('APP_URL',                 true, env.APP_URL);
    record('DATABASE_URL host',       true, new URL(env.DATABASE_URL).hostname);
    record('SUPABASE_URL',            true, env.SUPABASE_URL);
    record('SUPABASE_ANON_KEY',       true, mask(env.SUPABASE_ANON_KEY));
    record('SUPABASE_SERVICE_ROLE',   true, mask(env.SUPABASE_SERVICE_ROLE_KEY));
    record('JWT_ACCESS_SECRET',       true, `${env.JWT_ACCESS_SECRET.length} chars (min 32)`);
    record('JWT_REFRESH_SECRET',      true, `${env.JWT_REFRESH_SECRET.length} chars (min 32)`);
    record('JWT_ACCESS_EXPIRES_IN',   true, env.JWT_ACCESS_EXPIRES_IN);
    record('JWT_REFRESH_EXPIRES_IN',  true, env.JWT_REFRESH_EXPIRES_IN);
    record('CORS_ORIGINS',            true, `${env.CORS_ORIGINS.length} entries`);
    record('UPSTASH_REDIS_URL host',  true, new URL(env.UPSTASH_REDIS_URL).hostname);
    record('REDIS_SESSION_TTL',       true, `${env.REDIS_SESSION_TTL}s`);
    record('REDIS_CACHE_TTL',         true, `${env.REDIS_CACHE_TTL}s`);
    record('REDIS_OTP_TTL',           true, `${env.REDIS_OTP_TTL}s`);
    record('BUNNY_STORAGE_ZONE',      true, env.BUNNY_STORAGE_ZONE);
    record('BUNNY_CDN_URL',           true, env.BUNNY_CDN_URL);
    record('BUNNY_STREAM_LIBRARY_ID', true, env.BUNNY_STREAM_LIBRARY_ID);
    record('BREVO_API_KEY',           true, mask(env.BREVO_API_KEY));
    record('EMAIL_FROM',              true, env.EMAIL_FROM);
    record('SMS_SENDER_ID',           true, env.SMS_SENDER_ID);
    record('SMS_ENTITY_ID',           true, env.SMS_ENTITY_ID);
    record('RECAPTCHA_ENABLED',       true, String(env.RECAPTCHA_ENABLED));
    record('OTP_LENGTH',              true, String(env.OTP_LENGTH));
    record('BCRYPT_SALT_ROUNDS',      true, String(env.BCRYPT_SALT_ROUNDS));
    record('DEFAULT_LANG_CODE',       true, env.DEFAULT_LANG_CODE);
  } catch (error) {
    record('env parsing', false, (error as Error).message);
  }

  // ─── 2. PostgreSQL connection ────────────────────────
  console.log('\n2. PostgreSQL connectivity\n');
  try {
    const pool = getPool();
    const startQuery = Date.now();
    const versionResult = await pool.query<{ version: string }>('SELECT version() AS version');
    record('SELECT version()', true, `${Date.now() - startQuery}ms`);
    record('server version', true, versionResult.rows[0].version.substring(0, 60));

    const oneResult = await pool.query<{ one: number }>('SELECT 1 AS one');
    record('SELECT 1', true, `returned ${oneResult.rows[0].one}`);

    const currentDb = await pool.query<{ current_database: string; current_user: string }>(
      'SELECT current_database(), current_user'
    );
    record('current_database', true, currentDb.rows[0].current_database);
    record('current_user', true, currentDb.rows[0].current_user);

    // Spot-check phase-01 UDFs
    const udfCheck = await pool.query<{ proname: string }>(
      "SELECT proname FROM pg_proc WHERE proname LIKE 'udf_get_%' ORDER BY proname LIMIT 20"
    );
    record('udf_get_* count (≤20)', true, `${udfCheck.rowCount} functions`);
    if (udfCheck.rowCount && udfCheck.rowCount > 0) {
      console.log(`       found: ${udfCheck.rows.map((r) => r.proname).join(', ')}`);
    }

    // Try calling udf_get_countries if it exists
    try {
      const countries = await pool.query(
        'SELECT * FROM udf_get_countries(p_page_size := 3) LIMIT 3'
      );
      record('udf_get_countries()', true, `${countries.rowCount} row(s)`);
    } catch (e) {
      record('udf_get_countries()', false, `NOT CALLABLE: ${(e as Error).message.substring(0, 80)}`);
    }
  } catch (error) {
    const err = error as Error & { code?: string };
    record('pg connection', false, `${err.code ?? 'ERR'}: ${err.message.substring(0, 120)}`);
  }

  // ─── 3. Redis connection ─────────────────────────────
  console.log('\n3. Redis connectivity\n');
  try {
    const redis = getRedisClient();
    const start = Date.now();
    const pong = await redis.ping();
    record('PING', pong === 'PONG', `${pong} (${Date.now() - start}ms)`);

    // Light round-trip test
    await redis.set('verify:step2', 'ok', 'EX', 10);
    const got = await redis.get('verify:step2');
    record('SET/GET round-trip', got === 'ok', `got=${got}`);
    await redis.del('verify:step2');
  } catch (error) {
    record('redis connection', false, (error as Error).message);
  }

  // ─── 4. Logger smoke test ────────────────────────────
  console.log('\n4. Logger smoke test\n');
  logger.debug({ step: 2 }, 'logger.debug — verify-config');
  logger.info({ step: 2 }, 'logger.info  — verify-config');
  logger.warn({ step: 2 }, 'logger.warn  — verify-config');
  record('pino logger', true, `level=${env.LOG_LEVEL}`);

  // ─── Clean shutdown ──────────────────────────────────
  console.log('\nClosing connections…');
  try {
    await closePool();
  } catch (e) {
    console.log(`  pg pool close error: ${(e as Error).message}`);
  }
  try {
    await getRedisClient().quit();
  } catch (e) {
    console.log(`  redis close error: ${(e as Error).message}`);
  }

  // ─── Final verdict ───────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failed.length > 0) {
    console.log('FAILED CHECKS:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }

  console.log('All Step 2 configuration checks passed.');
  process.exit(0);
}

main().catch((error) => {
  console.error('\nFatal error during verification:');
  console.error(error);
  process.exit(1);
});
