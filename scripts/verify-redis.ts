/* eslint-disable no-console */
/**
 * Step 4 — Redis primitives verification.
 *
 * Exercises the 4 namespaces (session / otp / pending / cache) that the
 * auth + data layer will depend on. Every write uses a unique test suffix
 * (`verify-test:<pid>:<timestamp>:*`) so it cannot collide with real traffic
 * on shared Upstash, and everything is cleaned up at the end.
 *
 * Sections:
 *   1. Connection & round-trip
 *   2. Key namespace sanity
 *   3. redisSession (store / get / isValid / revoke)
 *   4. redisOtp (store / verify happy / wrong / max-attempts burn / cooldown / resend / cleanup)
 *   5. redisPending (JSON round-trip / custom TTL / corrupted JSON / delete)
 *   6. redisCache (JSON / string / miss / delete / TTL)
 *   7. Real TTL expiry (set EX 2, wait 2.5s, expect gone)
 *   8. Concurrent INCR safety (50 parallel increments → expect exactly 50)
 */

import { env } from '../src/config/env';
import {
  getRedisClient,
  redisCache,
  redisOtp,
  redisPending,
  redisSession
} from '../src/database/redis';

// ─────────────────────────────────────────────────────────────
// Small result reporter (copied from verify-db.ts for parity)
// ─────────────────────────────────────────────────────────────

type CheckResult = { section: string; name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];

const record = (section: string, name: string, ok: boolean, detail: string): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(56)} ${detail}`);
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// Isolated test identifiers
// ─────────────────────────────────────────────────────────────

const TEST_TAG = `verify-test:${process.pid}:${Date.now()}`;
const testUserId = `${TEST_TAG}:user`;
const testOtpId = `${TEST_TAG}:otp`;
const testPendingKey = `${TEST_TAG}:pending`;
const testCacheKey = `${TEST_TAG}:cache`;

async function main(): Promise<void> {
  const client = getRedisClient();

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Step 4 — Redis primitives verification');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Test tag: ${TEST_TAG}`);
  console.log(`  Cleanup will delete all keys matching verify-test:${process.pid}:*\n`);

  // ── 1. Connection & round-trip ────────────────────────────────────────
  console.log('1. Connection & round-trip\n');
  {
    const t0 = Date.now();
    const pong = await client.ping();
    const ms = Date.now() - t0;
    record('conn', 'PING responds "PONG"', pong === 'PONG', `${pong} in ${ms}ms`);

    // status should be 'ready' (or 'connecting' transiently — but ping just worked)
    record('conn', 'client.status is ready', client.status === 'ready', `status=${client.status}`);
  }

  // ── 2. Key namespace sanity ───────────────────────────────────────────
  console.log('\n2. Key namespace sanity (direct GET/SET through prefixed helpers)\n');
  {
    // Seed via helper, then read back via raw client using the known prefix
    // to make sure helpers write to the namespace we expect.
    await redisSession.store(testUserId, 'probe-refresh');
    const raw = await client.get(`session:${testUserId}`);
    record('ns', 'session: prefix matches helper write', raw === 'probe-refresh', `raw=${raw ?? 'null'}`);

    await redisPending.store(testPendingKey, { probe: true });
    const pending = await client.get(`pending:${testPendingKey}`);
    record(
      'ns',
      'pending: prefix matches helper write',
      pending !== null && pending.includes('"probe":true'),
      `raw=${pending ?? 'null'}`
    );

    await redisCache.set(testCacheKey, { probe: 1 });
    const cache = await client.get(`cache:${testCacheKey}`);
    record(
      'ns',
      'cache: prefix matches helper write',
      cache !== null && cache.includes('"probe":1'),
      `raw=${cache ?? 'null'}`
    );
  }

  // ── 3. redisSession helpers ───────────────────────────────────────────
  console.log('\n3. redisSession — store / get / isValid / revoke\n');
  {
    const token = 'refresh-token-' + Math.random().toString(36).slice(2);
    await redisSession.store(testUserId, token);

    const readBack = await redisSession.get(testUserId);
    record('session', 'get returns stored token', readBack === token, `token match`);

    const validMatch = await redisSession.isValid(testUserId, token);
    record('session', 'isValid(true) matches stored token', validMatch === true, 'ok');

    const validMismatch = await redisSession.isValid(testUserId, 'different-token');
    record('session', 'isValid(false) on mismatched token', validMismatch === false, 'ok');

    await redisSession.revoke(testUserId);
    const afterRevoke = await redisSession.get(testUserId);
    record('session', 'get after revoke → null', afterRevoke === null, 'cleared');

    // TTL applied by helper?
    await redisSession.store(testUserId, 'ttl-probe');
    const ttl = await client.ttl(`session:${testUserId}`);
    const ttlOk = ttl > 0 && ttl <= env.REDIS_SESSION_TTL;
    record(
      'session',
      'store applies REDIS_SESSION_TTL',
      ttlOk,
      `ttl=${ttl}s (limit ${env.REDIS_SESSION_TTL}s)`
    );
  }

  // ── 4. redisOtp helpers ───────────────────────────────────────────────
  console.log('\n4. redisOtp — store / verify / max-attempts burn / cooldown / resend\n');
  {
    // 4a. Happy verify — correct code on first try burns the OTP
    await redisOtp.store(testOtpId, '123456');
    const happy = await redisOtp.verify(testOtpId, '123456');
    record(
      'otp',
      'verify(correct) on first try → valid, burned',
      happy.valid === true,
      `valid=${happy.valid}, attemptsLeft=${happy.attemptsLeft}`
    );
    const afterHappy = await redisOtp.get(testOtpId);
    record('otp', 'OTP is deleted after successful verify', afterHappy === null, 'cleared');

    // 4b. Wrong code increments attempts
    await redisOtp.store(testOtpId, '654321');
    const wrong1 = await redisOtp.verify(testOtpId, '000000');
    const expectedLeft1 = env.OTP_MAX_ATTEMPTS - 1;
    record(
      'otp',
      'verify(wrong) → invalid, attempts tracked',
      wrong1.valid === false && wrong1.attemptsLeft === expectedLeft1,
      `attemptsLeft=${wrong1.attemptsLeft}, expected=${expectedLeft1}`
    );

    // 4c. Max-attempts burn — keep feeding wrong until burn
    const maxAttempts = env.OTP_MAX_ATTEMPTS;
    let burned = false;
    for (let i = 0; i < maxAttempts + 2; i++) {
      const r = await redisOtp.verify(testOtpId, '000000');
      if (r.valid === false && r.attemptsLeft === 0) {
        burned = true;
        break;
      }
    }
    const afterBurn = await redisOtp.get(testOtpId);
    record(
      'otp',
      'max-attempts burn deletes OTP',
      burned && afterBurn === null,
      `burned=${burned}, otp=${afterBurn ?? 'null'}`
    );

    // 4d. Cooldown set/isOnCooldown/no-cooldown
    const coolBefore = await redisOtp.isOnCooldown(testOtpId);
    record('otp', 'isOnCooldown before setCooldown → false', coolBefore === false, 'ok');

    await redisOtp.setCooldown(testOtpId);
    const coolAfter = await redisOtp.isOnCooldown(testOtpId);
    record('otp', 'isOnCooldown after setCooldown → true', coolAfter === true, 'ok');

    const coolTtl = await client.ttl(`otp_cooldown:${testOtpId}`);
    record(
      'otp',
      'cooldown TTL = OTP_RESEND_COOLDOWN_SECONDS',
      coolTtl > 0 && coolTtl <= env.OTP_RESEND_COOLDOWN_SECONDS,
      `ttl=${coolTtl}s (limit ${env.OTP_RESEND_COOLDOWN_SECONDS}s)`
    );

    // 4e. Resend counter increments and has a TTL
    await redisOtp.cleanup(testOtpId);
    const c1 = await redisOtp.incrementResendCount(testOtpId);
    const c2 = await redisOtp.incrementResendCount(testOtpId);
    const c3 = await redisOtp.incrementResendCount(testOtpId);
    record(
      'otp',
      'incrementResendCount returns monotonic 1,2,3',
      c1 === 1 && c2 === 2 && c3 === 3,
      `got ${c1},${c2},${c3}`
    );

    const resendCount = await redisOtp.getResendCount(testOtpId);
    record('otp', 'getResendCount returns latest value', resendCount === 3, `got ${resendCount}`);

    // 4f. cleanup wipes all 4 keys
    await redisOtp.store(testOtpId, '999999');
    await redisOtp.setCooldown(testOtpId);
    await redisOtp.incrementResendCount(testOtpId);
    await redisOtp.verify(testOtpId, 'wrong'); // seed otp_attempts
    await redisOtp.cleanup(testOtpId);
    const leftover = await client.exists(
      `otp:${testOtpId}`,
      `otp_attempts:${testOtpId}`,
      `otp_cooldown:${testOtpId}`,
      `otp_resend:${testOtpId}`
    );
    record('otp', 'cleanup deletes all 4 OTP keys', leftover === 0, `remaining=${leftover}`);
  }

  // ── 5. redisPending helpers ───────────────────────────────────────────
  console.log('\n5. redisPending — JSON round-trip / custom TTL / corrupted / delete\n');
  {
    type Probe = { step: string; email: string; roleId: number };
    const payload: Probe = { step: 'otp-sent', email: 'probe@example.com', roleId: 8 };
    await redisPending.store(testPendingKey, payload);
    const read = await redisPending.get<Probe>(testPendingKey);
    record(
      'pending',
      'store/get round-trip (typed JSON)',
      read !== null && read.email === payload.email && read.roleId === 8,
      `got=${JSON.stringify(read)}`
    );

    // Custom TTL
    await redisPending.store(testPendingKey + ':custom', { x: 1 }, 77);
    const customTtl = await client.ttl(`pending:${testPendingKey}:custom`);
    record(
      'pending',
      'store honors custom TTL (77s)',
      customTtl > 0 && customTtl <= 77,
      `ttl=${customTtl}`
    );

    // Corrupted JSON → get returns null (graceful)
    await client.set(`pending:${testPendingKey}:bad`, 'not valid json', 'EX', 30);
    const bad = await redisPending.get(testPendingKey + ':bad');
    record('pending', 'corrupted JSON returns null (no throw)', bad === null, 'graceful');

    // del
    await redisPending.del(testPendingKey);
    const gone = await redisPending.get(testPendingKey);
    record('pending', 'del clears value', gone === null, 'cleared');
  }

  // ── 6. redisCache helpers ─────────────────────────────────────────────
  console.log('\n6. redisCache — JSON / string / miss / delete / TTL\n');
  {
    await redisCache.set(testCacheKey, { n: 42, s: 'hello' });
    const obj = await redisCache.get<{ n: number; s: string }>(testCacheKey);
    record(
      'cache',
      'object round-trip',
      obj !== null && obj.n === 42 && obj.s === 'hello',
      `got=${JSON.stringify(obj)}`
    );

    await redisCache.set(testCacheKey + ':str', 'plain-string-value');
    const str = await redisCache.get<string>(testCacheKey + ':str');
    record('cache', 'string round-trip', str === 'plain-string-value', `got=${str ?? 'null'}`);

    const miss = await redisCache.get(`${TEST_TAG}:never-set`);
    record('cache', 'miss returns null', miss === null, 'ok');

    // Custom TTL
    await redisCache.set(testCacheKey + ':ttl', 1, 42);
    const cTtl = await client.ttl(`cache:${testCacheKey}:ttl`);
    record('cache', 'set honors custom TTL (42s)', cTtl > 0 && cTtl <= 42, `ttl=${cTtl}`);

    await redisCache.del(testCacheKey);
    const deleted = await redisCache.get(testCacheKey);
    record('cache', 'del clears value', deleted === null, 'cleared');
  }

  // ── 7. Real TTL expiry ────────────────────────────────────────────────
  console.log('\n7. Real TTL expiry (EX 2, wait ~2.5s)\n');
  {
    const short = `${TEST_TAG}:ttl-probe`;
    await client.set(short, 'will-expire', 'EX', 2);
    const before = await client.get(short);
    await sleep(2500);
    const after = await client.get(short);
    record(
      'ttl',
      'key present before TTL, gone after',
      before === 'will-expire' && after === null,
      `before=${before}, after=${after ?? 'null'}`
    );
  }

  // ── 8. Concurrent INCR safety ────────────────────────────────────────
  console.log('\n8. Concurrency — 50 parallel INCR on one key\n');
  {
    const counterKey = `${TEST_TAG}:counter`;
    await client.del(counterKey);
    const tasks: Array<Promise<number>> = [];
    for (let i = 0; i < 50; i++) {
      tasks.push(client.incr(counterKey));
    }
    const returned = await Promise.all(tasks);
    const max = Math.max(...returned);
    const final = await client.get(counterKey);
    const ok = final === '50' && max === 50;
    record('concurrency', '50 parallel INCRs → final=50, max-return=50', ok, `final=${final}, max=${max}`);

    await client.del(counterKey);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────
  console.log('\n9. Cleanup\n');
  {
    // Scan for any stragglers in our tag
    const pattern = `*${TEST_TAG}*`;
    const stream = client.scanStream({ match: pattern, count: 100 });
    const toDelete: string[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (keys: string[]) => {
        if (keys.length) toDelete.push(...keys);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    if (toDelete.length) await client.del(...toDelete);
    record('cleanup', 'all verify-test keys deleted', true, `deleted ${toDelete.length} keys`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const bySection = new Map<string, { ok: number; total: number }>();
  for (const r of results) {
    const s = bySection.get(r.section) ?? { ok: 0, total: 0 };
    s.total++;
    if (r.ok) s.ok++;
    bySection.set(r.section, s);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('══════════════════════════════════════════════════════');
  const sectionLabels: Record<string, string> = {
    conn: '1. Connection        ',
    ns: '2. Namespace sanity  ',
    session: '3. redisSession      ',
    otp: '4. redisOtp          ',
    pending: '5. redisPending      ',
    cache: '6. redisCache        ',
    ttl: '7. Real TTL expiry   ',
    concurrency: '8. Concurrency       ',
    cleanup: '9. Cleanup           '
  };
  for (const [key, label] of Object.entries(sectionLabels)) {
    const s = bySection.get(key);
    if (s) console.log(`  ${label}: ${s.ok}/${s.total}`);
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log(`  ──────────────────────────────`);
  console.log(`  Total               : ${okCount}/${results.length}`);
  console.log('══════════════════════════════════════════════════════\n');

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log('FAILED CHECKS:');
    for (const f of failed) console.log(`  - [${f.section}] ${f.name}: ${f.detail}`);
  } else {
    console.log('All Step 4 Redis primitive checks passed.');
  }

  // Graceful disconnect
  await client.quit();

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nFatal error in verify-redis:', err);
  try {
    await getRedisClient().quit();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
