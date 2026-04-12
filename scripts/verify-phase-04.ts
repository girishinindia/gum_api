/* eslint-disable no-console */
/**
 * Stage 4 — Phase-04 user-profiles, live end-to-end verification.
 *
 * Boots the real Express app on an ephemeral port, provisions three
 * throw-away users (super-admin, admin, student) against live Supabase,
 * logs all three in, and exercises every published route on:
 *
 *   /api/v1/user-profiles
 *
 * Coverage (matches the explicit ask for phase 04):
 *   • Super Admin — full CRUD on /:id, POST /, PATCH /:id (core + KYC),
 *                   DELETE /:id
 *   • Admin       — blocked on DELETE /:id (role guard, not permission)
 *   • Student     — can NOT list, can NOT read another user's /:id
 *                   CAN GET/POST/PATCH /me
 *                   /me PATCH rejects sensitive fields via `.strict()`
 *                   CAN GET /:id on own profile (authorize-self-or)
 *
 * Nothing is mocked — the script talks to Supabase + Upstash Redis.
 *
 * Sections
 * ────────
 *   0. Setup       — register sa + admin + student, elevate, login.
 *   1. Auth        — anonymous calls return 401.
 *   2. SA CRUD     — list / create / get / patch (core + KYC) on admin
 *                    user's profile as target.
 *   3. Admin guard — DELETE /:id with admin token → 403 (super-admin only).
 *   4. Student authz — list, read-other, write-other all rejected.
 *   5. Student /me — full self-service lifecycle and strict-mode rejects.
 *   6. SA delete   — DELETE /:id admin profile → 200.
 *   7. Cleanup     — hard-delete leftover profiles + soft-delete users.
 *
 * Because this script fires ~50 requests in a few seconds it bypasses
 * the global rate limiter via SKIP_GLOBAL_RATE_LIMIT. The env flag must
 * be set BEFORE any src/* import so the config module reads it.
 */

process.env.SKIP_GLOBAL_RATE_LIMIT = '1';

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
const record = (section: string, name: string, ok: boolean, detail: string): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(66)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;

const SA_EMAIL = `verify-up-sa+${RUN_ID}@test.growupmore.local`;
const SA_PASSWORD = 'VerifyUserProfiles123';
const ADMIN_EMAIL = `verify-up-admin+${RUN_ID}@test.growupmore.local`;
const ADMIN_PASSWORD = 'VerifyUserProfiles123';
const STUDENT_EMAIL = `verify-up-student+${RUN_ID}@test.growupmore.local`;
const STUDENT_PASSWORD = 'VerifyUserProfiles123';

// ─── Mutable state ───────────────────────────────────────────

let saUserId: number | null = null;
let adminUserId: number | null = null;
let studentUserId: number | null = null;

let saToken = '';
let adminToken = '';
let studentToken = '';

let saJti = '';
let adminJti = '';
let studentJti = '';

// The admin user's profile is SA-created and used as the "another user's
// profile" fixture for student-read and admin-delete authz checks.
let adminProfileId: number | null = null;

// Student creates their own profile via POST /me.
let studentProfileId: number | null = null;

// ─────────────────────────────────────────────────────────────
// HTTP client
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

const elevateToAdmin = async (userId: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET role_id = (
              SELECT id FROM roles
              WHERE level = 1 AND is_deleted = FALSE AND is_active = TRUE
              LIMIT 1
            ),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [userId]
  );
};

const verifyChannels = async (userId: number): Promise<void> => {
  await getPool().query('SELECT udf_auth_verify_email($1)', [userId]);
  await getPool().query('SELECT udf_auth_verify_mobile($1)', [userId]);
};

// ─────────────────────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteProfile = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM user_profiles WHERE id = $1', [id]);
};
const hardDeleteProfileByUserId = async (userId: number): Promise<void> => {
  await getPool().query('DELETE FROM user_profiles WHERE user_id = $1', [userId]);
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

interface RegisterResponse {
  data?: { userId: number };
}
interface LoginResponse {
  data?: {
    accessToken: string;
    user: { id: number; permissions: string[]; roles?: string[] };
  };
}
interface ProfileResponse {
  data?: {
    id: number;
    userId: number;
    kyc?: { panNumber: string | null; aadharNumber: string | null };
    about?: string | null;
    headline?: string | null;
    nationality?: string | null;
    profileCompletion?: number;
  };
}
interface ListResponse {
  data?: Array<{ id: number; userId: number }>;
  meta?: { totalCount: number; page: number; limit: number; totalPages: number };
}

const main = async (): Promise<void> => {
  console.log('━━ Stage 4 · User profiles verify (live) ━━');
  console.log(`  sa email     : ${SA_EMAIL}`);
  console.log(`  admin email  : ${ADMIN_EMAIL}`);
  console.log(`  student email: ${STUDENT_EMAIL}`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  try {
    // ─── 0. Setup ────────────────────────────────────────
    header('0. Setup — register + elevate + login (sa, admin, student)');
    {
      // ── Super Admin ──
      const regSa = await http<RegisterResponse>(
        'POST',
        '/api/v1/auth/register',
        {
          body: {
            firstName: 'VerifyUP',
            lastName: `Sa${process.pid}`,
            email: SA_EMAIL,
            password: SA_PASSWORD,
            roleCode: 'student'
          }
        }
      );
      record(
        '0',
        'register sa harness user',
        regSa.status === 201 && typeof regSa.body?.data?.userId === 'number',
        `status=${regSa.status}`
      );
      const saId = regSa.body?.data?.userId;
      if (typeof saId !== 'number') throw new Error('sa register failed');
      saUserId = saId;
      await verifyChannels(saId);
      await elevateToSuperAdmin(saId);
      record('0', 'elevated sa to super_admin (role.level=0)', true, `uid=${saId}`);

      const loginSa = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: SA_EMAIL, password: SA_PASSWORD }
      });
      record(
        '0',
        'sa login returns 200 + accessToken',
        loginSa.status === 200 && typeof loginSa.body?.data?.accessToken === 'string',
        `status=${loginSa.status}`
      );
      saToken = loginSa.body?.data?.accessToken ?? '';
      const saPermCount = loginSa.body?.data?.user?.permissions?.length ?? 0;
      record(
        '0',
        'sa JWT carries user_profile.* perms (≥ 30 total)',
        saPermCount >= 30,
        `permissions=${saPermCount}`
      );
      saJti = saToken ? verifyAccessToken(saToken).jti ?? '' : '';

      // ── Admin ──
      const regAdmin = await http<RegisterResponse>(
        'POST',
        '/api/v1/auth/register',
        {
          body: {
            firstName: 'VerifyUP',
            lastName: `Admin${process.pid}`,
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            roleCode: 'student'
          }
        }
      );
      record(
        '0',
        'register admin harness user',
        regAdmin.status === 201 && typeof regAdmin.body?.data?.userId === 'number',
        `status=${regAdmin.status}`
      );
      const adminId = regAdmin.body?.data?.userId;
      if (typeof adminId !== 'number') throw new Error('admin register failed');
      adminUserId = adminId;
      await verifyChannels(adminId);
      await elevateToAdmin(adminId);
      record('0', 'elevated admin to admin (role.level=1)', true, `uid=${adminId}`);

      const loginAdmin = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD }
      });
      record(
        '0',
        'admin login returns 200 + accessToken',
        loginAdmin.status === 200 &&
          typeof loginAdmin.body?.data?.accessToken === 'string',
        `status=${loginAdmin.status}`
      );
      adminToken = loginAdmin.body?.data?.accessToken ?? '';
      const adminPerms = loginAdmin.body?.data?.user?.permissions ?? [];
      record(
        '0',
        'admin JWT has user_profile.{read,create,update} and NOT delete',
        adminPerms.includes('user_profile.read') &&
          adminPerms.includes('user_profile.create') &&
          adminPerms.includes('user_profile.update') &&
          !adminPerms.includes('user_profile.delete'),
        `permissions=${adminPerms.length}`
      );
      adminJti = adminToken ? verifyAccessToken(adminToken).jti ?? '' : '';

      // ── Student ──
      const regStudent = await http<RegisterResponse>(
        'POST',
        '/api/v1/auth/register',
        {
          body: {
            firstName: 'VerifyUP',
            lastName: `Student${process.pid}`,
            email: STUDENT_EMAIL,
            password: STUDENT_PASSWORD,
            roleCode: 'student'
          }
        }
      );
      record(
        '0',
        'register student harness user',
        regStudent.status === 201 && typeof regStudent.body?.data?.userId === 'number',
        `status=${regStudent.status}`
      );
      const stId = regStudent.body?.data?.userId;
      if (typeof stId !== 'number') throw new Error('student register failed');
      studentUserId = stId;
      await verifyChannels(stId);

      const loginStudent = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: STUDENT_EMAIL, password: STUDENT_PASSWORD }
      });
      record(
        '0',
        'student login returns 200 + accessToken',
        loginStudent.status === 200 &&
          typeof loginStudent.body?.data?.accessToken === 'string',
        `status=${loginStudent.status}`
      );
      studentToken = loginStudent.body?.data?.accessToken ?? '';
      const studentPerms = loginStudent.body?.data?.user?.permissions ?? [];
      record(
        '0',
        'student JWT has user_profile.{read.own,update.own} and NOT global read',
        studentPerms.includes('user_profile.read.own') &&
          studentPerms.includes('user_profile.update.own') &&
          !studentPerms.includes('user_profile.read') &&
          !studentPerms.includes('user_profile.delete'),
        `permissions=${studentPerms.length}`
      );
      studentJti = studentToken ? verifyAccessToken(studentToken).jti ?? '' : '';
    }

    if (!saToken) throw new Error('sa token missing — bailing');
    if (!adminToken) throw new Error('admin token missing — bailing');
    if (!studentToken) throw new Error('student token missing — bailing');

    // ─── 1. Anonymous ────────────────────────────────────
    header('1. Auth — anonymous → 401');
    {
      const a = await http('GET', '/api/v1/user-profiles');
      record('1', 'GET /user-profiles (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('GET', '/api/v1/user-profiles/me');
      record(
        '1',
        'GET /user-profiles/me (no token) → 401',
        b.status === 401,
        `got ${b.status}`
      );
      const c = await http('POST', '/api/v1/user-profiles/me', { body: { gender: 'male' } });
      record(
        '1',
        'POST /user-profiles/me (no token) → 401',
        c.status === 401,
        `got ${c.status}`
      );
    }

    // ─── 2. Super Admin CRUD ─────────────────────────────
    header('2. Super Admin — create / list / get / patch (core + KYC)');
    {
      // 2.a SA POST / — create profile for adminUserId
      const create = await http<ProfileResponse>('POST', '/api/v1/user-profiles', {
        token: saToken,
        body: {
          userId: adminUserId,
          gender: 'male',
          nationality: 'Indian',
          headline: `Verify UP admin target ${RUN_ID}`,
          about: `Fixture created by verify-phase-04 run ${RUN_ID}`,
          countryId: 1,
          stateId: 1,
          cityId: 1,
          preferredLanguageId: 1
        }
      });
      record(
        '2',
        'POST /user-profiles (sa) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      const pid = create.body?.data?.id;
      if (typeof pid !== 'number') {
        throw new Error(`sa create failed; body=${JSON.stringify(create.body)}`);
      }
      adminProfileId = pid;

      // 2.b SA POST / again for same user → should 4xx (1:1 unique)
      const dup = await http('POST', '/api/v1/user-profiles', {
        token: saToken,
        body: { userId: adminUserId, nationality: 'Indian' }
      });
      record(
        '2',
        'POST /user-profiles duplicate user_id → 4xx',
        dup.status >= 400 && dup.status < 500,
        `got ${dup.status}`
      );

      // 2.c SA list
      const list = await http<ListResponse>(
        'GET',
        '/api/v1/user-profiles?pageSize=5&sortColumn=profile_id&sortDirection=DESC',
        { token: saToken }
      );
      record(
        '2',
        'GET /user-profiles?pageSize=5 (sa) → 200',
        list.status === 200,
        `status=${list.status}`
      );
      record(
        '2',
        'list response has data[] + meta shape',
        Array.isArray(list.body?.data) &&
          typeof list.body?.meta?.totalCount === 'number' &&
          list.body?.meta?.limit === 5,
        `totalCount=${list.body?.meta?.totalCount} limit=${list.body?.meta?.limit}`
      );
      record(
        '2',
        'new profile visible in list (DESC by id)',
        (list.body?.data ?? []).some((r) => r.id === adminProfileId),
        `ids=${(list.body?.data ?? []).map((r) => r.id).join(',')}`
      );

      // 2.d SA GET /:id
      const getOne = await http<ProfileResponse>(
        'GET',
        `/api/v1/user-profiles/${adminProfileId}`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-profiles/:id (sa) → 200',
        getOne.status === 200 &&
          getOne.body?.data?.id === adminProfileId &&
          getOne.body?.data?.userId === adminUserId,
        `status=${getOne.status} id=${getOne.body?.data?.id}`
      );

      // 2.e Zod reject: invalid gender
      const bz1 = await http('POST', '/api/v1/user-profiles', {
        token: saToken,
        body: { userId: 999999999, gender: 'rocket-man' }
      });
      record('2', 'POST invalid gender → 400', bz1.status === 400, `got ${bz1.status}`);

      // 2.f Zod reject: invalid pan
      const bz2 = await http('PATCH', `/api/v1/user-profiles/${adminProfileId}`, {
        token: saToken,
        body: { panNumber: 'not-a-pan' }
      });
      record('2', 'PATCH invalid panNumber → 400', bz2.status === 400, `got ${bz2.status}`);

      // 2.g SA PATCH core fields
      const patchCore = await http('PATCH', `/api/v1/user-profiles/${adminProfileId}`, {
        token: saToken,
        body: {
          headline: `Verify UP admin headline updated ${RUN_ID}`,
          nationality: 'Indian'
        }
      });
      record(
        '2',
        'PATCH /user-profiles/:id core fields (sa) → 200',
        patchCore.status === 200,
        `got ${patchCore.status}`
      );

      // 2.h SA PATCH with sensitive KYC + bank (admin body allows)
      const patchKyc = await http<ProfileResponse>(
        'PATCH',
        `/api/v1/user-profiles/${adminProfileId}`,
        {
          token: saToken,
          body: {
            panNumber: 'ABCDE1234F',
            aadharNumber: 'XXXX-XXXX-1234',
            bankName: 'Verify Bank',
            bankAccountNumber: 'XXXX-XXXX-5678',
            bankIfscCode: 'SBIN0001234',
            profileCompletion: 75
          }
        }
      );
      record(
        '2',
        'PATCH /user-profiles/:id (sa, KYC+bank+completion) → 200',
        patchKyc.status === 200,
        `got ${patchKyc.status}`
      );

      // Re-fetch to confirm KYC persisted
      const verify = await http<ProfileResponse>(
        'GET',
        `/api/v1/user-profiles/${adminProfileId}`,
        { token: saToken }
      );
      record(
        '2',
        'KYC + completion persisted after sa PATCH',
        verify.status === 200 &&
          verify.body?.data?.kyc?.panNumber === 'ABCDE1234F' &&
          verify.body?.data?.profileCompletion === 75,
        `pan=${verify.body?.data?.kyc?.panNumber} completion=${verify.body?.data?.profileCompletion}`
      );
    }

    // ─── 3. Admin — blocked on DELETE only ───────────────
    header('3. Admin — DELETE /:id → 403 (super-admin only)');
    {
      if (adminProfileId == null) {
        record('3', 'admin delete check skipped', false, 'adminProfileId missing');
      } else {
        // Admin CAN list (has user_profile.read)
        const listAdmin = await http<ListResponse>('GET', '/api/v1/user-profiles?pageSize=1', {
          token: adminToken
        });
        record(
          '3',
          'GET /user-profiles (admin) → 200 (has user_profile.read)',
          listAdmin.status === 200,
          `got ${listAdmin.status}`
        );

        // Admin CAN GET /:id
        const getAdmin = await http(
          'GET',
          `/api/v1/user-profiles/${adminProfileId}`,
          { token: adminToken }
        );
        record(
          '3',
          'GET /user-profiles/:id (admin) → 200',
          getAdmin.status === 200,
          `got ${getAdmin.status}`
        );

        // Admin BLOCKED on DELETE /:id (requireSuperAdmin role guard)
        const delAdmin = await http<{ code?: string }>(
          'DELETE',
          `/api/v1/user-profiles/${adminProfileId}`,
          { token: adminToken }
        );
        record(
          '3',
          'DELETE /user-profiles/:id (admin) → 403',
          delAdmin.status === 403,
          `got ${delAdmin.status}`
        );
      }
    }

    // ─── 4. Student — list + read-other + write-other → 403
    header('4. Student — list + read-other + write-other → 403');
    {
      // Student has no user_profile.read → listing is 403
      const listS = await http('GET', '/api/v1/user-profiles', { token: studentToken });
      record(
        '4',
        'GET /user-profiles (student) → 403',
        listS.status === 403,
        `got ${listS.status}`
      );

      if (adminProfileId != null) {
        // authorize-self-or: student.read.own + (userId !== caller) → 403
        const getOther = await http(
          'GET',
          `/api/v1/user-profiles/${adminProfileId}`,
          { token: studentToken }
        );
        record(
          '4',
          "GET /user-profiles/:id (student → another user's profile) → 403",
          getOther.status === 403,
          `got ${getOther.status}`
        );

        // Student cannot PATCH another user's profile either
        const patchOther = await http(
          'PATCH',
          `/api/v1/user-profiles/${adminProfileId}`,
          {
            token: studentToken,
            body: { headline: 'student-should-not-touch' }
          }
        );
        record(
          '4',
          'PATCH /user-profiles/:id (student → other) → 403',
          patchOther.status === 403,
          `got ${patchOther.status}`
        );

        // Student cannot DELETE anything (no user_profile.delete perm)
        const delOther = await http(
          'DELETE',
          `/api/v1/user-profiles/${adminProfileId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-profiles/:id (student) → 403',
          delOther.status === 403,
          `got ${delOther.status}`
        );
      }

      // Student cannot POST / (admin-scoped)
      const postS = await http('POST', '/api/v1/user-profiles', {
        token: studentToken,
        body: { userId: studentUserId, gender: 'male' }
      });
      record(
        '4',
        'POST /user-profiles (student) → 403',
        postS.status === 403,
        `got ${postS.status}`
      );
    }

    // ─── 5. Student /me lifecycle ────────────────────────
    header('5. Student — /me lifecycle + strict-mode rejects');
    {
      // 5.a GET /me before create → 404
      const me0 = await http<{ code?: string }>('GET', '/api/v1/user-profiles/me', {
        token: studentToken
      });
      record(
        '5',
        'GET /me (student, no profile yet) → 404',
        me0.status === 404,
        `got ${me0.status}`
      );

      // 5.b POST /me (safe subset)
      const create = await http<ProfileResponse>('POST', '/api/v1/user-profiles/me', {
        token: studentToken,
        body: {
          gender: 'male',
          nationality: 'Indian',
          headline: `Student bootstrap ${RUN_ID}`,
          about: 'self-service create',
          countryId: 1,
          stateId: 1,
          cityId: 1,
          preferredLanguageId: 1
        }
      });
      record(
        '5',
        'POST /me (student) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      const spid = create.body?.data?.id;
      if (typeof spid === 'number') studentProfileId = spid;

      record(
        '5',
        'POST /me profile owned by caller (userId matches)',
        create.body?.data?.userId === studentUserId,
        `userId=${create.body?.data?.userId} expected=${studentUserId}`
      );

      // 5.c GET /me returns profile
      const me1 = await http<ProfileResponse>('GET', '/api/v1/user-profiles/me', {
        token: studentToken
      });
      record(
        '5',
        'GET /me (after create) → 200',
        me1.status === 200 && me1.body?.data?.id === studentProfileId,
        `status=${me1.status} id=${me1.body?.data?.id}`
      );

      // 5.d GET /:id on OWN profile via self-or → 200
      if (studentProfileId != null) {
        const selfGet = await http(
          'GET',
          `/api/v1/user-profiles/${studentProfileId}`,
          { token: studentToken }
        );
        record(
          '5',
          'GET /user-profiles/:id (student → own profile) → 200',
          selfGet.status === 200,
          `got ${selfGet.status}`
        );
      }

      // 5.e PATCH /me safe fields
      const patchOk = await http('PATCH', '/api/v1/user-profiles/me', {
        token: studentToken,
        body: {
          headline: `Student self-updated ${RUN_ID}`,
          about: 'self-service patch'
        }
      });
      record(
        '5',
        'PATCH /me safe fields → 200',
        patchOk.status === 200,
        `got ${patchOk.status}`
      );

      // 5.f PATCH /me with panNumber → strict mode 400
      const patchKyc = await http<{ code?: string }>('PATCH', '/api/v1/user-profiles/me', {
        token: studentToken,
        body: { panNumber: 'ABCDE1234F' }
      });
      record(
        '5',
        'PATCH /me with panNumber → 400 VALIDATION_ERROR (.strict())',
        patchKyc.status === 400,
        `got ${patchKyc.status} code=${patchKyc.body?.code ?? ''}`
      );

      // 5.g PATCH /me with bankAccountNumber → strict mode 400
      const patchBank = await http<{ code?: string }>('PATCH', '/api/v1/user-profiles/me', {
        token: studentToken,
        body: { bankAccountNumber: '1234567890' }
      });
      record(
        '5',
        'PATCH /me with bankAccountNumber → 400',
        patchBank.status === 400,
        `got ${patchBank.status}`
      );

      // 5.h PATCH /me with profileCompletion → strict mode 400
      const patchComp = await http<{ code?: string }>('PATCH', '/api/v1/user-profiles/me', {
        token: studentToken,
        body: { profileCompletion: 100 }
      });
      record(
        '5',
        'PATCH /me with profileCompletion → 400 (student cannot self-escalate)',
        patchComp.status === 400,
        `got ${patchComp.status}`
      );

      // 5.i PATCH /me with gstNumber → strict mode 400
      const patchGst = await http('PATCH', '/api/v1/user-profiles/me', {
        token: studentToken,
        body: { gstNumber: '27AAAPL1234C1ZV' }
      });
      record(
        '5',
        'PATCH /me with gstNumber → 400',
        patchGst.status === 400,
        `got ${patchGst.status}`
      );

      // 5.j POST /me again (already exists) → 4xx from UDF unique guard
      const dupMe = await http('POST', '/api/v1/user-profiles/me', {
        token: studentToken,
        body: { gender: 'male' }
      });
      record(
        '5',
        'POST /me duplicate → 4xx',
        dupMe.status >= 400 && dupMe.status < 500,
        `got ${dupMe.status}`
      );

      // 5.k GET /me confirms KYC NOT persisted through any of the above
      const verify = await http<ProfileResponse>('GET', '/api/v1/user-profiles/me', {
        token: studentToken
      });
      record(
        '5',
        'student KYC still null after strict-mode rejects',
        verify.status === 200 &&
          verify.body?.data?.kyc?.panNumber == null &&
          verify.body?.data?.kyc?.aadharNumber == null,
        `pan=${verify.body?.data?.kyc?.panNumber ?? 'null'}`
      );
    }

    // ─── 6. Super Admin — DELETE /:id ────────────────────
    header('6. Super Admin — DELETE /:id → 200');
    {
      if (adminProfileId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-profiles/${adminProfileId}`,
          { token: saToken }
        );
        record(
          '6',
          'DELETE /user-profiles/:id (sa) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status} deleted=${del.body?.data?.deleted}`
        );

        // Post-delete GET /:id → 404 (profile is hard-deleted)
        const after = await http(
          'GET',
          `/api/v1/user-profiles/${adminProfileId}`,
          { token: saToken }
        );
        record(
          '6',
          'GET /user-profiles/:id after delete → 404',
          after.status === 404,
          `got ${after.status}`
        );

        // Parent admin user row is still live (hard-delete is profile-only)
        const userAfter = await getPool().query(
          'SELECT id, is_deleted, is_active FROM users WHERE id = $1',
          [adminUserId]
        );
        const row = userAfter.rows[0];
        record(
          '6',
          'parent admin user row untouched by profile delete',
          row && row.is_deleted === false,
          `is_deleted=${row?.is_deleted} is_active=${row?.is_active}`
        );

        // Clear the fixture flag so cleanup does not double-delete.
        adminProfileId = null;
      }
    }
  } finally {
    // ─── 7. Cleanup ──────────────────────────────────────
    header('7. Cleanup');
    {
      // Hard-delete any profile left over from a bail-out path.
      if (adminProfileId != null) {
        try {
          await hardDeleteProfile(adminProfileId);
          record('7', 'leftover admin profile hard-deleted', true, `id=${adminProfileId}`);
        } catch (err) {
          record(
            '7',
            'leftover admin profile hard-deleted',
            false,
            (err as Error).message
          );
        }
      } else if (adminUserId != null) {
        // Belt-and-braces: clear anything under adminUserId just in case.
        try {
          await hardDeleteProfileByUserId(adminUserId);
          record('7', 'admin fixture profile clean (by user_id)', true, '');
        } catch (err) {
          record(
            '7',
            'admin fixture profile clean (by user_id)',
            false,
            (err as Error).message
          );
        }
      }

      if (studentProfileId != null) {
        try {
          await hardDeleteProfile(studentProfileId);
          record('7', 'student profile hard-deleted', true, `id=${studentProfileId}`);
        } catch (err) {
          record('7', 'student profile hard-deleted', false, (err as Error).message);
        }
      } else if (studentUserId != null) {
        try {
          await hardDeleteProfileByUserId(studentUserId);
          record('7', 'student fixture profile clean (by user_id)', true, '');
        } catch (err) {
          record(
            '7',
            'student fixture profile clean (by user_id)',
            false,
            (err as Error).message
          );
        }
      }

      // Also clean the sa harness user's profile if one was seeded earlier
      // by some other path — the sa user here is brand new so usually nothing
      // to delete, but make it idempotent.
      if (saUserId != null) {
        try {
          await hardDeleteProfileByUserId(saUserId);
        } catch {
          /* no-op */
        }
      }

      if (saUserId != null) {
        try {
          await softDeleteUser(saUserId);
          record('7', 'sa user soft-deleted', true, `id=${saUserId}`);
        } catch (err) {
          record('7', 'sa user soft-deleted', false, (err as Error).message);
        }
      }
      if (adminUserId != null) {
        try {
          await softDeleteUser(adminUserId);
          record('7', 'admin user soft-deleted', true, `id=${adminUserId}`);
        } catch (err) {
          record('7', 'admin user soft-deleted', false, (err as Error).message);
        }
      }
      if (studentUserId != null) {
        try {
          await softDeleteUser(studentUserId);
          record('7', 'student user soft-deleted', true, `id=${studentUserId}`);
        } catch (err) {
          record('7', 'student user soft-deleted', false, (err as Error).message);
        }
      }

      for (const jti of [saJti, adminJti, studentJti].filter(Boolean)) {
        try {
          await redisRevoked.remove(jti);
        } catch {
          /* no-op */
        }
      }
      record('7', 'redis revoked entries removed (no-op if absent)', true, '');
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
    console.log('  Stage 4 verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
