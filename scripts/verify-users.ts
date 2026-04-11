/* eslint-disable no-console */
/**
 * Step 10 — Users CRUD endpoints (live, end-to-end).
 *
 * Drives /api/v1/users against the real Express app bound to an
 * ephemeral port, talking to the live Supabase database and Upstash
 * Redis. Nothing is mocked.
 *
 * Sections:
 *   0. Setup     — register harness user, verify e-mail/mobile, elevate
 *                  to super_admin, log in. (Caller for all subsequent
 *                  hierarchy-protected actions.)
 *   1. Auth      — anonymous calls return 401.
 *   2. List      — GET /users surfaces seeded data, pagination,
 *                  filtering by role, country, and search term.
 *   3. Create    — POST /users with email-only payload, then GET /:id;
 *                  validates that the response NEVER contains the
 *                  password column or hash.
 *   4. Update    — PATCH /:id field-by-field, plus 400s for empty bodies
 *                  and disallowed fields.
 *   5. Delete    — DELETE /:id (hierarchy protected) → soft delete.
 *   6. Restore   — POST /:id/restore — flips is_deleted back to false.
 *   7. Validation — bad bodies, 404s, blocked fields, primary super
 *                   admin protection.
 *   8. Cleanup   — hard-delete the throw-away target user, soft-delete
 *                  the harness user, drop redis revoked entry.
 */

import type { AddressInfo } from 'node:net';

import { buildApp } from '../src/app';
import { closePool, getPool } from '../src/database/pg-pool';
import { closeRedis, redisRevoked } from '../src/database/redis';
import { verifyAccessToken } from '../src/core/auth/jwt';

// ─────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────

type Check = { section: string; name: string; ok: boolean; detail: string };
const results: Check[] = [];
const record = (
  section: string,
  name: string,
  ok: boolean,
  detail: string
): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(64)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;
const HARNESS_EMAIL = `verify-users+${RUN_ID}@test.growupmore.local`;
const HARNESS_PASSWORD = 'VerifyUsers123';
const HARNESS_FIRST = 'VerifyUsers';
const HARNESS_LAST = `Run${process.pid}`;

const TARGET_EMAIL = `verify-users-target+${RUN_ID}@test.growupmore.local`;
const TARGET_PASSWORD = 'TargetUser123';
const TARGET_FIRST = 'Target';
const TARGET_LAST = `Subject${process.pid}`;

let harnessUserId: number | null = null;
let targetUserId: number | null = null;
let accessToken = '';
let firstJti = '';

// ─────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────

interface HttpResult<T = unknown> {
  status: number;
  body: T;
}

const mkClient = (baseUrl: string) => {
  return async <T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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
// Setup helpers
// ─────────────────────────────────────────────────────────────

const elevateToSuperAdmin = async (userId: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET role_id = (
              SELECT id FROM roles
              WHERE level = 0 AND is_deleted = FALSE AND is_active = TRUE
              LIMIT 1
            ),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [userId]
  );
};

// ─────────────────────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteUser = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM user_permissions WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM user_otps WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM password_history WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM login_attempts WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM user_contact_change_requests WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM users WHERE id = $1', [id]);
};

const softDeleteUser = async (id: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET is_deleted = TRUE,
            is_active  = FALSE,
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id]
  );
};

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

interface UserDtoLike {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  isActive: boolean;
  isDeleted: boolean;
  isEmailVerified: boolean;
  isMobileVerified: boolean;
  roleId: number;
  countryId: number;
  role: { id: number; code: string; name: string; level: number };
  country: { id: number; iso2: string; name: string };
}

const main = async (): Promise<void> => {
  console.log('━━ Step 10 · Users CRUD (live) ━━');
  console.log(`  harness email   : ${HARNESS_EMAIL}`);
  console.log(`  target  email   : ${TARGET_EMAIL}`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  try {
    // ─── 0. Setup ───────────────────────────────────────
    header('0. Setup — register + elevate + login');
    {
      const reg = await http<{ data?: { userId: number } }>(
        'POST',
        '/api/v1/auth/register',
        {
          body: {
            firstName: HARNESS_FIRST,
            lastName: HARNESS_LAST,
            email: HARNESS_EMAIL,
            password: HARNESS_PASSWORD,
            roleCode: 'student'
          }
        }
      );
      record(
        '0',
        'register harness user',
        reg.status === 201 && typeof reg.body?.data?.userId === 'number',
        `status=${reg.status}`
      );
      const uid = reg.body?.data?.userId;
      if (typeof uid !== 'number') {
        throw new Error('Cannot proceed without a registered harness user');
      }
      harnessUserId = uid;

      await getPool().query('SELECT udf_auth_verify_email($1)', [uid]);
      await getPool().query('SELECT udf_auth_verify_mobile($1)', [uid]);
      await elevateToSuperAdmin(uid);
      record(
        '0',
        'elevated harness user to super_admin (level 0)',
        true,
        `uid=${uid}`
      );

      const login = await http<{
        data?: {
          accessToken: string;
          user: { id: number; permissions: string[] };
        };
      }>('POST', '/api/v1/auth/login', {
        body: { identifier: HARNESS_EMAIL, password: HARNESS_PASSWORD }
      });
      record(
        '0',
        'login returns 200 with accessToken',
        login.status === 200 && typeof login.body?.data?.accessToken === 'string',
        `status=${login.status}`
      );
      accessToken = login.body?.data?.accessToken ?? '';
      const permCount = login.body?.data?.user?.permissions?.length ?? 0;
      record(
        '0',
        'JWT carries the full super_admin permission set',
        permCount > 20,
        `permissions=${permCount}`
      );
      const payload = verifyAccessToken(accessToken);
      firstJti = payload.jti ?? '';
    }

    // ─── 1. Auth — anon hits ────────────────────────────
    header('1. Auth — anonymous access');
    {
      const a = await http('GET', '/api/v1/users');
      record('1', 'GET /users (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('POST', '/api/v1/users', {
        body: {
          firstName: 'X',
          lastName: 'Y',
          email: 'x@y.com',
          password: 'Test1234'
        }
      });
      record('1', 'POST /users (no token) → 401', b.status === 401, `got ${b.status}`);
    }

    // ─── 2. List + filters ──────────────────────────────
    header('2. List, filter, search, paginate');
    {
      const list = await http<{
        data: UserDtoLike[];
        meta: { totalCount: number };
      }>('GET', '/api/v1/users?pageSize=5', { token: accessToken });
      record('2', 'GET /users → 200', list.status === 200, `got ${list.status}`);
      record(
        '2',
        'list returns seeded users',
        (list.body?.data ?? []).length > 0 && (list.body?.meta?.totalCount ?? 0) > 0,
        `n=${list.body?.data?.length ?? 0} total=${list.body?.meta?.totalCount ?? 0}`
      );
      const sample = list.body?.data?.[0];
      record(
        '2',
        'DTO carries nested role + country',
        !!sample?.role?.code && !!sample?.country?.iso2,
        `role=${sample?.role?.code} country=${sample?.country?.iso2}`
      );
      // Password discipline — DTO must NEVER contain a password key
      record(
        '2',
        'DTO does NOT carry a password column',
        sample
          ? !Object.prototype.hasOwnProperty.call(sample, 'password') &&
            !Object.prototype.hasOwnProperty.call(sample, 'passwordHash')
          : false,
        sample ? 'no password key' : 'no sample'
      );

      // Filter by role code (student)
      const students = await http<{ data: UserDtoLike[] }>(
        'GET',
        '/api/v1/users?roleCode=student&pageSize=5',
        { token: accessToken }
      );
      record(
        '2',
        'filter by roleCode=student → only students',
        students.status === 200 &&
          (students.body?.data ?? []).every((u) => u.role?.code === 'student'),
        `n=${students.body?.data?.length ?? 0}`
      );

      // Filter by countryIso2=IN
      const indians = await http<{ data: UserDtoLike[] }>(
        'GET',
        '/api/v1/users?countryIso2=IN&pageSize=5',
        { token: accessToken }
      );
      record(
        '2',
        'filter by countryIso2=IN → only Indian users',
        indians.status === 200 &&
          (indians.body?.data ?? []).every((u) => u.country?.iso2 === 'IN'),
        `n=${indians.body?.data?.length ?? 0}`
      );

      // Search by harness first name
      const search = await http<{ data: UserDtoLike[] }>(
        'GET',
        `/api/v1/users?searchTerm=${HARNESS_FIRST}&pageSize=5`,
        { token: accessToken }
      );
      record(
        '2',
        'search by first name finds harness user',
        search.status === 200 &&
          (search.body?.data ?? []).some((u) => u.id === harnessUserId),
        `n=${search.body?.data?.length ?? 0}`
      );

      // Pagination clamp — pageSize=200 → 400
      const oversized = await http('GET', '/api/v1/users?pageSize=200', {
        token: accessToken
      });
      record(
        '2',
        'pageSize=200 (over the cap) → 400',
        oversized.status === 400,
        `got ${oversized.status}`
      );

      // Bad sort column → 400
      const badSort = await http('GET', '/api/v1/users?sortColumn=password', {
        token: accessToken
      });
      record(
        '2',
        'sortColumn=password (not allowlisted) → 400',
        badSort.status === 400,
        `got ${badSort.status}`
      );
    }

    // ─── 3. Create + read ───────────────────────────────
    header('3. Create + read by id');
    {
      const create = await http<{ data: UserDtoLike }>('POST', '/api/v1/users', {
        token: accessToken,
        body: {
          firstName: TARGET_FIRST,
          lastName: TARGET_LAST,
          email: TARGET_EMAIL,
          password: TARGET_PASSWORD,
          roleId: 8, // student
          countryId: 1, // india
          isActive: true
        }
      });
      record('3', 'POST /users → 201', create.status === 201, `got ${create.status}`);
      record(
        '3',
        'response carries fully-hydrated user DTO',
        typeof create.body?.data?.id === 'number' &&
          create.body?.data?.email === TARGET_EMAIL.toLowerCase() &&
          create.body?.data?.role?.code === 'student' &&
          create.body?.data?.country?.iso2 === 'IN',
        `id=${create.body?.data?.id} email=${create.body?.data?.email}`
      );
      // Password discipline on the create response
      record(
        '3',
        'create response does NOT echo password',
        create.body?.data
          ? !Object.prototype.hasOwnProperty.call(create.body.data, 'password') &&
            !Object.prototype.hasOwnProperty.call(create.body.data, 'passwordHash')
          : false,
        'no password key'
      );
      targetUserId = create.body?.data?.id ?? null;

      // The DB row really has a non-empty bcrypt hash (even though
      // the API never reveals it).
      if (targetUserId) {
        const { rows } = await getPool().query<{ password: string }>(
          'SELECT password FROM users WHERE id = $1',
          [targetUserId]
        );
        const hash = rows[0]?.password ?? '';
        record(
          '3',
          'DB row has bcrypt hash ($2 prefix)',
          hash.startsWith('$2'),
          `len=${hash.length} prefix=${hash.slice(0, 4)}`
        );
      }

      // GET /:id round-trips the same user
      if (targetUserId) {
        const get = await http<{ data: UserDtoLike }>(
          'GET',
          `/api/v1/users/${targetUserId}`,
          { token: accessToken }
        );
        record('3', 'GET /users/:id → 200', get.status === 200, `got ${get.status}`);
        record(
          '3',
          'GET /:id returns the same user',
          get.body?.data?.id === targetUserId &&
            get.body?.data?.email === TARGET_EMAIL.toLowerCase(),
          `id=${get.body?.data?.id}`
        );
      }
    }

    // ─── 4. Update ──────────────────────────────────────
    header('4. Update');
    {
      if (!targetUserId) {
        record('4', 'skipping — no target user', false, 'create failed');
      } else {
        const upd = await http<{ data: UserDtoLike }>(
          'PATCH',
          `/api/v1/users/${targetUserId}`,
          {
            token: accessToken,
            body: { firstName: 'Renamed', isMobileVerified: true }
          }
        );
        record('4', 'PATCH /users/:id → 200', upd.status === 200, `got ${upd.status}`);
        record(
          '4',
          'firstName + isMobileVerified persisted',
          upd.body?.data?.firstName === 'Renamed' &&
            upd.body?.data?.isMobileVerified === true,
          `firstName=${upd.body?.data?.firstName} mob=${upd.body?.data?.isMobileVerified}`
        );

        // Empty body → 400
        const empty = await http('PATCH', `/api/v1/users/${targetUserId}`, {
          token: accessToken,
          body: {}
        });
        record(
          '4',
          'PATCH with empty body → 400',
          empty.status === 400,
          `got ${empty.status}`
        );

        // Disallowed field (email) → silently dropped by zod strict?
        // We use refine() with optional fields, so unknown extra keys
        // pass through zod but the service ignores them. Test that
        // a payload with email DOES NOT change the email.
        const sneaky = await http<{ data: UserDtoLike }>(
          'PATCH',
          `/api/v1/users/${targetUserId}`,
          {
            token: accessToken,
            body: {
              firstName: 'Renamed2',
              email: 'should-not-change@evil.com',
              password: 'NewBadPass1',
              roleId: 1
            }
          }
        );
        record(
          '4',
          'sneaky email/password/roleId silently ignored, firstName still updates',
          sneaky.status === 200 &&
            sneaky.body?.data?.firstName === 'Renamed2' &&
            sneaky.body?.data?.email === TARGET_EMAIL.toLowerCase() &&
            sneaky.body?.data?.role?.code === 'student',
          `email=${sneaky.body?.data?.email} role=${sneaky.body?.data?.role?.code}`
        );

        // Update on a non-existent id → 4xx (404 or wrapped UDF error)
        const ghost = await http('PATCH', '/api/v1/users/999999999', {
          token: accessToken,
          body: { firstName: 'Ghost' }
        });
        record(
          '4',
          'PATCH /users/:unknown → 4xx',
          ghost.status >= 400 && ghost.status < 500,
          `got ${ghost.status}`
        );
      }
    }

    // ─── 5. Delete ──────────────────────────────────────
    header('5. Delete (hierarchy protected)');
    {
      if (!targetUserId) {
        record('5', 'skipping — no target user', false, 'create failed');
      } else {
        const del = await http('DELETE', `/api/v1/users/${targetUserId}`, {
          token: accessToken
        });
        record('5', 'DELETE /users/:id → 200', del.status === 200, `got ${del.status}`);

        // Confirm at the DB layer
        const { rows } = await getPool().query<{
          is_deleted: boolean;
          is_active: boolean;
        }>(
          'SELECT is_deleted, is_active FROM users WHERE id = $1',
          [targetUserId]
        );
        record(
          '5',
          'DB row is now soft-deleted + inactive',
          rows[0]?.is_deleted === true && rows[0]?.is_active === false,
          `is_deleted=${rows[0]?.is_deleted} is_active=${rows[0]?.is_active}`
        );

        // udf_get_users default excludes the deleted row when filter
        // is_deleted is unset; can still be retrieved when explicitly
        // asking for is_deleted=true.
        const listDeleted = await http<{ data: UserDtoLike[] }>(
          'GET',
          `/api/v1/users?isDeleted=true&pageSize=20&searchTerm=${TARGET_FIRST}`,
          { token: accessToken }
        );
        record(
          '5',
          'isDeleted=true filter surfaces the soft-deleted target',
          listDeleted.status === 200 &&
            (listDeleted.body?.data ?? []).some((u) => u.id === targetUserId),
          `n=${listDeleted.body?.data?.length ?? 0}`
        );
      }
    }

    // ─── 6. Restore ─────────────────────────────────────
    header('6. Restore');
    {
      if (!targetUserId) {
        record('6', 'skipping — no target user', false, 'delete failed');
      } else {
        const rest = await http<{ data: UserDtoLike }>(
          'POST',
          `/api/v1/users/${targetUserId}/restore`,
          { token: accessToken }
        );
        record('6', 'POST /users/:id/restore → 200', rest.status === 200, `got ${rest.status}`);
        record(
          '6',
          'restored user has isDeleted=false + isActive=true',
          rest.body?.data?.isDeleted === false && rest.body?.data?.isActive === true,
          `isDeleted=${rest.body?.data?.isDeleted} isActive=${rest.body?.data?.isActive}`
        );
      }
    }

    // ─── 7. Validation ──────────────────────────────────
    header('7. Validation + protection');
    {
      // Bad password → 400
      const weakPwd = await http('POST', '/api/v1/users', {
        token: accessToken,
        body: {
          firstName: 'Weak',
          lastName: 'Pass',
          email: `weakpwd+${RUN_ID}@test.local`,
          password: 'short'
        }
      });
      record('7', 'weak password → 400', weakPwd.status === 400, `got ${weakPwd.status}`);

      // Missing email AND mobile → 400
      const noContact = await http('POST', '/api/v1/users', {
        token: accessToken,
        body: {
          firstName: 'NoLogin',
          lastName: 'Method',
          password: 'GoodEnough1'
        }
      });
      record(
        '7',
        'no email/mobile → 400',
        noContact.status === 400,
        `got ${noContact.status}`
      );

      // Bad email format → 400
      const badEmail = await http('POST', '/api/v1/users', {
        token: accessToken,
        body: {
          firstName: 'Bad',
          lastName: 'Email',
          email: 'not-an-email',
          password: 'GoodEnough1'
        }
      });
      record(
        '7',
        'malformed email → 400',
        badEmail.status === 400,
        `got ${badEmail.status}`
      );

      // GET /:unknown → 404
      const ghost = await http('GET', '/api/v1/users/999999999', {
        token: accessToken
      });
      record(
        '7',
        'GET /users/:unknown → 404',
        ghost.status === 404,
        `got ${ghost.status}`
      );

      // Primary super admin protection — can't delete user 1
      const protectPrimary = await http<{ code: string }>(
        'DELETE',
        '/api/v1/users/1',
        { token: accessToken }
      );
      record(
        '7',
        'DELETE /users/1 (primary super admin) → 4xx',
        protectPrimary.status >= 400 && protectPrimary.status < 500,
        `got ${protectPrimary.status}`
      );

      // Self-edit by harness user (super_admin editing own row)
      if (harnessUserId) {
        const selfEdit = await http<{ data: UserDtoLike }>(
          'PATCH',
          `/api/v1/users/${harnessUserId}`,
          {
            token: accessToken,
            body: { firstName: 'SelfEdit' }
          }
        );
        record(
          '7',
          'super_admin self-edit → 200',
          selfEdit.status === 200 && selfEdit.body?.data?.firstName === 'SelfEdit',
          `got ${selfEdit.status}`
        );
      }

      // Email uniqueness — duplicate registration via /users → 4xx
      if (targetUserId) {
        const dupEmail = await http<{ code: string }>('POST', '/api/v1/users', {
          token: accessToken,
          body: {
            firstName: 'Dup',
            lastName: 'Email',
            email: TARGET_EMAIL,
            password: 'GoodEnough1'
          }
        });
        record(
          '7',
          'duplicate email on POST /users → 4xx',
          dupEmail.status >= 400 && dupEmail.status < 500,
          `got ${dupEmail.status}`
        );
      }
    }
  } finally {
    // ─── 8. Cleanup ──────────────────────────────────
    header('8. Cleanup');
    {
      if (targetUserId) {
        try {
          await hardDeleteUser(targetUserId);
          record('8', 'target user hard-deleted', true, `id=${targetUserId}`);
        } catch (err) {
          record('8', 'target user hard-deleted', false, (err as Error).message);
        }
      }
      if (harnessUserId) {
        try {
          await softDeleteUser(harnessUserId);
          record('8', 'harness user soft-deleted', true, `id=${harnessUserId}`);
        } catch (err) {
          record('8', 'harness user soft-deleted', false, (err as Error).message);
        }
      }
      if (firstJti) {
        try {
          await redisRevoked.remove(firstJti);
          record('8', 'redis revoked entry removed (no-op if absent)', true, `jti=${firstJti}`);
        } catch (err) {
          record('8', 'redis revoked entry removed', false, (err as Error).message);
        }
      }
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool();
    await closeRedis();
  }

  // ─── Summary ─────────────────────────────────────────
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
    console.log('  Step 10 verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
