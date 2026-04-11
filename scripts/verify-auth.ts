/* eslint-disable no-console */
/**
 * Step 7 — Auth module (live, end-to-end).
 *
 * Builds the real Express app and hits the /api/v1/auth/* routes
 * over a live ephemeral port, against the real Supabase database
 * and Upstash Redis. Nothing here is mocked — bugs surface.
 *
 * Sections:
 *   1. Register — happy path + dev OTP leak
 *   2. Register — validation (missing password, bad role, no contact)
 *   3. Register — duplicate email rejected
 *   4. Login    — happy path + JWT shape + jti=sessionId
 *   5. Login    — wrong password → 401
 *   6. /me      — authenticated profile + permission carry-over
 *   7. /me      — no token → 401
 *   8. Refresh  — rotates pair, preserves jti, revocation propagates
 *   9. Logout   — jti blocklisted, subsequent /me → 401 TOKEN_REVOKED
 *  10. Cleanup  — soft-delete the test user via udf_users_delete
 *
 * On the way out: close pool + redis so the process exits cleanly.
 */

import type { AddressInfo } from 'node:net';

import { buildApp } from '../src/app';
import { closePool, getPool } from '../src/database/pg-pool';
import { closeRedis, getRedisClient, redisRevoked } from '../src/database/redis';
import { verifyAccessToken } from '../src/core/auth/jwt';

// ─────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────

type Check = { section: string; name: string; ok: boolean; detail: string };
const results: Check[] = [];
const record = (section: string, name: string, ok: boolean, detail: string): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(60)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;
const TEST_EMAIL = `verify+${RUN_ID}@test.growupmore.local`;
const TEST_PASSWORD = 'VerifyPass123';
const TEST_FIRST = 'Verify';
const TEST_LAST = `Run${process.pid}`;

// populated as the run proceeds
let createdUserId: number | null = null;
let accessToken = '';
let refreshToken = '';
let firstJti = '';
let firstAti = '';

// ─────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────

interface HttpResult<T = unknown> {
  status: number;
  body: T;
}

const mkClient = (baseUrl: string) => {
  return async <T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; token?: string } = {}
  ): Promise<HttpResult<T>> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
    const status = res.status;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status, body: body as T };
  };
};

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Step 7 · Auth module (live) ━━');
  console.log(`  test email: ${TEST_EMAIL}`);

  // Boot the real app on an ephemeral port
  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  try {
    // ─── 1. Register — happy path ─────────────────────────
    header('1. Register — happy path');
    {
      const r = await http<{
        success: boolean;
        data?: { userId: number; devEmailOtp: string | null };
      }>('POST', '/api/v1/auth/register', {
        body: {
          firstName: TEST_FIRST,
          lastName: TEST_LAST,
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          roleCode: 'student'
        }
      });

      record(
        '1',
        'POST /register returns 201',
        r.status === 201,
        `got ${r.status}`
      );
      record(
        '1',
        'envelope.success === true',
        r.body?.success === true,
        JSON.stringify(r.body).slice(0, 100)
      );
      const uid = r.body?.data?.userId;
      record('1', 'data.userId is numeric', typeof uid === 'number' && uid > 0, `uid=${uid}`);
      if (typeof uid === 'number') createdUserId = uid;
      record(
        '1',
        'dev OTP surfaced in response',
        typeof r.body?.data?.devEmailOtp === 'string' && /^\d{4,8}$/.test(r.body!.data!.devEmailOtp!),
        `otp=${r.body?.data?.devEmailOtp ?? 'null'}`
      );

      // The login UDF (step 7/8) requires BOTH is_email_verified AND
      // is_mobile_verified to be true, even for users registered with
      // only one channel. That's enforced by the DB UDF, not our API
      // layer — so in the harness we short-circuit verification by
      // calling the verify UDFs directly. This is NOT how a real
      // client flows; the real flow is register → receive OTP → POST
      // /auth/verify-email, which is deferred to a later step.
      if (createdUserId) {
        await getPool().query('SELECT udf_auth_verify_email($1)', [createdUserId]);
        await getPool().query('SELECT udf_auth_verify_mobile($1)', [createdUserId]);
        record('1', 'test user marked as verified (harness only)', true, `uid=${createdUserId}`);
      }
    }

    // ─── 2. Register — validation ─────────────────────────
    header('2. Register — validation');
    {
      // Missing password
      const r1 = await http('POST', '/api/v1/auth/register', {
        body: { firstName: 'X', lastName: 'Y', email: `v2a+${RUN_ID}@test.local` }
      });
      record('2', 'missing password → 400', r1.status === 400, `got ${r1.status}`);

      // Bad role (not student/instructor)
      const r2 = await http('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'X',
          lastName: 'Y',
          email: `v2b+${RUN_ID}@test.local`,
          password: TEST_PASSWORD,
          roleCode: 'admin'
        }
      });
      record('2', 'bad roleCode → 400', r2.status === 400, `got ${r2.status}`);

      // Neither email nor mobile
      const r3 = await http('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'X',
          lastName: 'Y',
          password: TEST_PASSWORD
        }
      });
      record('2', 'no email/mobile → 400', r3.status === 400, `got ${r3.status}`);
    }

    // ─── 3. Register — duplicate email ────────────────────
    header('3. Register — duplicate email');
    {
      const r = await http<{ message: string; code: string }>(
        'POST',
        '/api/v1/auth/register',
        {
          body: {
            firstName: 'Dup',
            lastName: 'Licate',
            email: TEST_EMAIL,
            password: TEST_PASSWORD
          }
        }
      );
      record('3', 'duplicate email → 409', r.status === 409, `got ${r.status}`);
      record(
        '3',
        'code is DUPLICATE_ENTRY',
        r.body?.code === 'DUPLICATE_ENTRY',
        `code=${r.body?.code}`
      );
    }

    // ─── 4. Login — happy path ────────────────────────────
    header('4. Login — happy path');
    {
      const r = await http<{
        success: boolean;
        data?: {
          accessToken: string;
          refreshToken: string;
          sessionId: number;
          user: { id: number; email: string; roles: string[]; permissions: string[] };
        };
      }>('POST', '/api/v1/auth/login', {
        body: { identifier: TEST_EMAIL, password: TEST_PASSWORD }
      });

      record('4', 'POST /login returns 200', r.status === 200, `got ${r.status}`);
      record(
        '4',
        'response carries both tokens',
        typeof r.body?.data?.accessToken === 'string' &&
          typeof r.body?.data?.refreshToken === 'string',
        ''
      );
      record(
        '4',
        'user.id matches registered user',
        r.body?.data?.user?.id === createdUserId,
        `user.id=${r.body?.data?.user?.id} vs ${createdUserId}`
      );
      record(
        '4',
        'user.roles contains "student"',
        Array.isArray(r.body?.data?.user?.roles) && r.body!.data!.user.roles.includes('student'),
        `roles=${JSON.stringify(r.body?.data?.user?.roles)}`
      );
      record(
        '4',
        'permissions is an array',
        Array.isArray(r.body?.data?.user?.permissions),
        `count=${r.body?.data?.user?.permissions?.length ?? 0}`
      );

      if (r.body?.data) {
        accessToken = r.body.data.accessToken;
        refreshToken = r.body.data.refreshToken;
        const payload = verifyAccessToken(accessToken);
        firstJti = payload.jti ?? '';
        firstAti = payload.ati ?? '';
        record(
          '4',
          'jti === String(sessionId)',
          payload.jti === String(r.body.data.sessionId),
          `jti=${payload.jti} sid=${r.body.data.sessionId}`
        );
        record(
          '4',
          'payload.sub matches createdUserId',
          payload.sub === createdUserId,
          `sub=${payload.sub}`
        );
        record(
          '4',
          'access token carries ati (per-issuance id)',
          typeof payload.ati === 'string' && payload.ati.length > 0,
          `ati=${payload.ati}`
        );
      }
    }

    // ─── 5. Login — wrong password ────────────────────────
    header('5. Login — wrong password');
    {
      const r = await http<{ code: string }>('POST', '/api/v1/auth/login', {
        body: { identifier: TEST_EMAIL, password: 'WrongPassword999' }
      });
      record('5', 'wrong password → 401', r.status === 401, `got ${r.status}`);
      record(
        '5',
        'error code is INVALID_CREDENTIALS',
        r.body?.code === 'INVALID_CREDENTIALS',
        `code=${r.body?.code}`
      );
    }

    // ─── 6. /me — authenticated ───────────────────────────
    header('6. /me — authenticated');
    {
      const r = await http<{
        data: {
          id: number;
          email: string | null;
          firstName: string | null;
          roles: string[];
          permissions: string[];
        };
      }>('GET', '/api/v1/auth/me', { token: accessToken });
      record('6', 'GET /me returns 200', r.status === 200, `got ${r.status}`);
      record(
        '6',
        'data.id matches createdUserId',
        r.body?.data?.id === createdUserId,
        `id=${r.body?.data?.id}`
      );
      record(
        '6',
        'data.email matches test email',
        r.body?.data?.email?.toLowerCase() === TEST_EMAIL.toLowerCase(),
        `email=${r.body?.data?.email}`
      );
      record(
        '6',
        'data.firstName matches payload',
        r.body?.data?.firstName === TEST_FIRST,
        `firstName=${r.body?.data?.firstName}`
      );
    }

    // ─── 7. /me — no token ────────────────────────────────
    header('7. /me — no token');
    {
      const r = await http<{ code: string }>('GET', '/api/v1/auth/me');
      record('7', 'no auth → 401', r.status === 401, `got ${r.status}`);
      record(
        '7',
        'code is UNAUTHORIZED-ish',
        typeof r.body?.code === 'string' && /UNAUTH|INVALID/.test(r.body.code),
        `code=${r.body?.code}`
      );
    }

    // ─── 8. Refresh — rotates ati, preserves jti ──────────
    //
    // Commercial contract:
    //   • jti (session id) MUST be preserved across refresh so
    //     session-level revocation remains one-operation.
    //   • ati (access-token id) MUST be freshly minted on every
    //     refresh so each issuance is uniquely identifiable in audit
    //     logs, even when refresh fires inside the same clock second
    //     as the previous issuance. This is what guarantees
    //     `newAccess !== accessToken` in the byte-diff sense: without
    //     a per-issuance nonce, two JWTs signed with identical
    //     payloads within the same clock second are byte-for-byte
    //     identical (see RFC 6819 §5.2.2 for the rationale).
    //   • The rotated token MUST work against /me without a re-login.
    header('8. Refresh — rotates ati, preserves jti');
    {
      const r = await http<{
        data?: { accessToken: string; refreshToken: string; user: { id: number } };
      }>('POST', '/api/v1/auth/refresh', { body: { refreshToken } });
      record('8', 'POST /refresh returns 200', r.status === 200, `got ${r.status}`);
      const newAccess = r.body?.data?.accessToken ?? '';
      record('8', 'new accessToken returned', newAccess.length > 20, '');
      record(
        '8',
        'new accessToken != old (byte-diff)',
        newAccess !== accessToken,
        'guaranteed by per-issuance ati'
      );
      if (newAccess) {
        const payload = verifyAccessToken(newAccess);
        record(
          '8',
          'jti preserved across refresh',
          payload.jti === firstJti,
          `new jti=${payload.jti} old jti=${firstJti}`
        );
        record(
          '8',
          'ati rotated across refresh',
          typeof payload.ati === 'string' &&
            payload.ati.length > 0 &&
            payload.ati !== firstAti,
          `new ati=${payload.ati} old ati=${firstAti}`
        );
        // Use the new token for subsequent /me
        accessToken = newAccess;
        refreshToken = r.body!.data!.refreshToken;
      }
      // /me still works with rotated token
      const me = await http('GET', '/api/v1/auth/me', { token: accessToken });
      record('8', '/me works with rotated access token', me.status === 200, `got ${me.status}`);
    }

    // ─── 9. Logout — blocklist + subsequent rejection ─────
    header('9. Logout — blocklist + subsequent rejection');
    {
      const r = await http('POST', '/api/v1/auth/logout', { token: accessToken });
      record('9', 'POST /logout returns 200', r.status === 200, `got ${r.status}`);

      // jti should now be on the blocklist
      const revoked = await redisRevoked.isRevoked(firstJti);
      record('9', 'redisRevoked.isRevoked(jti) === true', revoked === true, `jti=${firstJti}`);

      // Subsequent /me must 401 with TOKEN_REVOKED
      const me = await http<{ code: string }>('GET', '/api/v1/auth/me', {
        token: accessToken
      });
      record('9', '/me after logout → 401', me.status === 401, `got ${me.status}`);
      record(
        '9',
        'code is TOKEN_REVOKED',
        me.body?.code === 'TOKEN_REVOKED',
        `code=${me.body?.code}`
      );

      // Refresh with the same jti should also fail now
      const rr = await http<{ code: string }>('POST', '/api/v1/auth/refresh', {
        body: { refreshToken }
      });
      record('9', '/refresh after logout → 401', rr.status === 401, `got ${rr.status}`);
      record(
        '9',
        'refresh code is TOKEN_REVOKED',
        rr.body?.code === 'TOKEN_REVOKED',
        `code=${rr.body?.code}`
      );
    }

    // ─── 10. Cleanup — soft-delete the test user ──────────
    header('10. Cleanup');
    {
      // udf_users_delete is admin-gated via hierarchy check. The
      // verification harness doesn't have an authenticated admin
      // context, so we apply the soft-delete directly. This is the
      // one place in the codebase where a "naked" UPDATE is OK —
      // test cleanup on a test row we just created ourselves.
      if (createdUserId) {
        try {
          const res = await getPool().query(
            `UPDATE users
               SET is_deleted = TRUE,
                   is_active  = FALSE,
                   deleted_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [createdUserId]
          );
          record(
            '10',
            'test user soft-deleted',
            res.rowCount === 1,
            `rowCount=${res.rowCount}`
          );
        } catch (err) {
          record('10', 'test user soft-deleted', false, (err as Error).message);
        }
      } else {
        record('10', 'no user to clean up', true, 'skipped');
      }

      // Wipe any stray revocation key we left behind
      if (firstJti) {
        await redisRevoked.remove(firstJti);
        record('10', 'redisRevoked entry removed', true, `jti=${firstJti}`);
      }

      // Double-check Redis namespace has no leftover test keys
      const redis = getRedisClient();
      const keys: string[] = [];
      const stream = redis.scanStream({ match: `revoked:${firstJti}*`, count: 50 });
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (batch: string[]) => keys.push(...batch));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      record('10', 'no leftover blocklist keys', keys.length === 0, `found=${keys.length}`);
    }
  } finally {
    // Stop the server regardless of success
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool();
    await closeRedis();
  }

  // ─── Summary ─────────────────────────────────────────────
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  console.log(`\n━━ Summary ━━`);
  console.log(`  passed: ${passed}/${total}`);
  if (failed > 0) {
    console.log(`\n  Failures:`);
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`    - [${r.section}] ${r.name} — ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('  Step 7 verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  // best-effort cleanup
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
