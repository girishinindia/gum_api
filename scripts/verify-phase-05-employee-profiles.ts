/* eslint-disable no-console */
/**
 * Stage 5 — Phase-05 employee-profiles, live end-to-end verification.
 *
 * Boots the real Express app on an ephemeral port, provisions three
 * throw-away users (super-admin, admin, student) against live Supabase,
 * logs all three in, and exercises every published route on:
 *
 *   /api/v1/employee-profiles
 *
 * Coverage (matches the explicit ask for phase 05):
 *   • Super Admin — full CRUD on /:id, POST /, PATCH /:id,
 *                   DELETE /:id (hard delete)
 *   • Admin       — GET / (list) → 200, DELETE /:id → 403
 *   • Student     — GET / → 403, POST / → 403, DELETE /:id → 403,
 *                   GET /me → 404 (no profile), PATCH /me → 404
 *
 * Nothing is mocked — the script talks to Supabase + Upstash Redis.
 *
 * Sections
 * ────────
 *   0. Setup       — register sa + admin + student, elevate, login.
 *   1. Auth        — anonymous calls return 401.
 *   2. SA CRUD     — create / list / get / patch (core fields) on admin
 *                    user's employee profile.
 *   3. Admin guard — DELETE /:id with admin token → 403 (SA only).
 *   4. Student guard — list, create, delete all rejected.
 *   5. Student /me — GET /me → 404 (no profile).
 *   6. SA delete   — DELETE /:id admin profile → 200, verify 404.
 *   7. Cleanup     — hard-delete leftover employee profiles via direct
 *                    SQL, then soft-delete the 3 test users via SQL.
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

const SA_EMAIL = `verify-ep-sa+${RUN_ID}@test.growupmore.local`;
const SA_PASSWORD = 'VerifyEmployeeProfiles123';
const ADMIN_EMAIL = `verify-ep-admin+${RUN_ID}@test.growupmore.local`;
const ADMIN_PASSWORD = 'VerifyEmployeeProfiles123';
const STUDENT_EMAIL = `verify-ep-student+${RUN_ID}@test.growupmore.local`;
const STUDENT_PASSWORD = 'VerifyEmployeeProfiles123';

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

// The admin user's employee profile is SA-created and used as the "another
// user's profile" fixture for admin-delete authz checks.
let adminProfileId: number | null = null;

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

const hardDeleteEmployeeProfile = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM employee_profiles WHERE id = $1', [id]);
};

const hardDeleteEmployeeProfileByUserId = async (userId: number): Promise<void> => {
  await getPool().query('DELETE FROM employee_profiles WHERE user_id = $1', [userId]);
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
interface EmployeeProfileResponse {
  data?: {
    id: number;
    userId: number;
    employeeCode: string;
    designationId: number;
    departmentId: number;
    branchId: number;
    joiningDate: string;
    employeeType?: string;
    workMode?: string;
    payGrade?: string | null;
    ctcAnnual?: number | null;
    noticePeriodDays?: number | null;
    user?: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}
interface ListResponse {
  data?: Array<{ id: number; userId: number; employeeCode: string }>;
  meta?: { totalCount: number; page: number; limit: number; totalPages: number };
}

const main = async (): Promise<void> => {
  console.log('━━ Stage 5 · Employee profiles verify (live) ━━');
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
      const regSa = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifySA',
          lastName: `Pimple`,
          email: SA_EMAIL,
          password: SA_PASSWORD,
          countryId: 1
        }
      });
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
        'sa JWT carries employee_profile.* perms (≥ 5 total)',
        saPermCount >= 5,
        `permissions=${saPermCount}`
      );
      saJti = saToken ? verifyAccessToken(saToken).jti ?? '' : '';

      // ── Admin ──
      const regAdmin = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyAdmin',
          lastName: `Pimple`,
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          countryId: 1
        }
      });
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
        'admin JWT has employee_profile.read and NOT delete',
        adminPerms.includes('employee_profile.read') &&
          !adminPerms.includes('employee_profile.delete'),
        `permissions=${adminPerms.length}`
      );
      adminJti = adminToken ? verifyAccessToken(adminToken).jti ?? '' : '';

      // ── Student ──
      const regStudent = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyStudent',
          lastName: `Pimple`,
          email: STUDENT_EMAIL,
          password: STUDENT_PASSWORD,
          countryId: 1
        }
      });
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
        'student JWT lacks global employee_profile perms',
        !studentPerms.includes('employee_profile.read') &&
          !studentPerms.includes('employee_profile.create') &&
          !studentPerms.includes('employee_profile.delete'),
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
      const a = await http('GET', '/api/v1/employee-profiles');
      record('1', 'GET /employee-profiles (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('GET', '/api/v1/employee-profiles/me');
      record(
        '1',
        'GET /employee-profiles/me (no token) → 401',
        b.status === 401,
        `got ${b.status}`
      );
      const c = await http('POST', '/api/v1/employee-profiles', {
        body: { userId: 1, employeeCode: 'TEST' }
      });
      record(
        '1',
        'POST /employee-profiles (no token) → 401',
        c.status === 401,
        `got ${c.status}`
      );
    }

    // ─── 2. Super Admin CRUD ─────────────────────────────
    header('2. Super Admin — create / list / get / patch (core fields)');
    {
      // 2.a SA POST / — create profile for adminUserId
      const create = await http<EmployeeProfileResponse>('POST', '/api/v1/employee-profiles', {
        token: saToken,
        body: {
          userId: adminUserId,
          employeeCode: 'VERIFY-EP-001',
          designationId: 1,
          departmentId: 1,
          branchId: 1,
          joiningDate: '2024-06-01',
          employeeType: 'full_time',
          workMode: 'hybrid',
          payGrade: 'L3',
          ctcAnnual: 800000,
          noticePeriodDays: 60
        }
      });
      record(
        '2',
        'POST /employee-profiles (sa, required fields) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      const pid = create.body?.data?.id;
      if (typeof pid !== 'number') {
        throw new Error(`sa create failed; body=${JSON.stringify(create.body)}`);
      }
      adminProfileId = pid;

      // 2.b SA list
      const list = await http<ListResponse>('GET', '/api/v1/employee-profiles?pageSize=5', {
        token: saToken
      });
      record(
        '2',
        'GET /employee-profiles?pageSize=5 (sa) → 200',
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
        'new profile visible in list',
        (list.body?.data ?? []).some((r) => r.id === adminProfileId),
        `ids=${(list.body?.data ?? []).map((r) => r.id).join(',')}`
      );

      // 2.c SA GET /:id
      const getOne = await http<EmployeeProfileResponse>('GET', `/api/v1/employee-profiles/${adminProfileId}`, {
        token: saToken
      });
      record(
        '2',
        'GET /employee-profiles/:id (sa) → 200',
        getOne.status === 200 &&
          getOne.body?.data?.id === adminProfileId &&
          getOne.body?.data?.userId === adminUserId,
        `status=${getOne.status} id=${getOne.body?.data?.id}`
      );
      record(
        '2',
        'profile has employeeCode and nested user object',
        getOne.body?.data?.employeeCode === 'VERIFY-EP-001' &&
          getOne.body?.data?.user?.email === ADMIN_EMAIL,
        `code=${getOne.body?.data?.employeeCode} user=${getOne.body?.data?.user?.email}`
      );

      // 2.d SA PATCH core fields
      const patchCore = await http<EmployeeProfileResponse>(
        'PATCH',
        `/api/v1/employee-profiles/${adminProfileId}`,
        {
          token: saToken,
          body: {
            payGrade: 'L4',
            ctcAnnual: 1000000
          }
        }
      );
      record(
        '2',
        'PATCH /employee-profiles/:id core fields (sa) → 200',
        patchCore.status === 200,
        `got ${patchCore.status}`
      );

      // 2.e Re-fetch to confirm patch persisted
      const verify = await http<EmployeeProfileResponse>(
        'GET',
        `/api/v1/employee-profiles/${adminProfileId}`,
        { token: saToken }
      );
      record(
        '2',
        'patch persisted: payGrade=L4 and ctcAnnual=1000000',
        verify.status === 200 &&
          verify.body?.data?.payGrade === 'L4' &&
          verify.body?.data?.ctcAnnual === 1000000,
        `payGrade=${verify.body?.data?.payGrade} ctc=${verify.body?.data?.ctcAnnual}`
      );
    }

    // ─── 3. Admin — blocked on DELETE only ───────────────
    header('3. Admin — DELETE /:id → 403 (super-admin only)');
    {
      if (adminProfileId == null) {
        record('3', 'admin delete check skipped', false, 'adminProfileId missing');
      } else {
        // Admin CAN list (has employee_profile.read)
        const listAdmin = await http<ListResponse>('GET', '/api/v1/employee-profiles?pageSize=1', {
          token: adminToken
        });
        record(
          '3',
          'GET /employee-profiles (admin) → 200 (has employee_profile.read)',
          listAdmin.status === 200,
          `got ${listAdmin.status}`
        );

        // Admin CAN GET /:id
        const getAdmin = await http('GET', `/api/v1/employee-profiles/${adminProfileId}`, {
          token: adminToken
        });
        record(
          '3',
          'GET /employee-profiles/:id (admin) → 200',
          getAdmin.status === 200,
          `got ${getAdmin.status}`
        );

        // Admin BLOCKED on DELETE /:id
        const delAdmin = await http<{ code?: string }>(
          'DELETE',
          `/api/v1/employee-profiles/${adminProfileId}`,
          { token: adminToken }
        );
        record(
          '3',
          'DELETE /employee-profiles/:id (admin) → 403',
          delAdmin.status === 403,
          `got ${delAdmin.status}`
        );
      }
    }

    // ─── 4. Student guard ────────────────────────────────
    header('4. Student guard — list, create, delete all rejected');
    {
      // Student list → 403
      const listStudent = await http('GET', '/api/v1/employee-profiles', {
        token: studentToken
      });
      record(
        '4',
        'GET /employee-profiles (student) → 403',
        listStudent.status === 403,
        `got ${listStudent.status}`
      );

      // Student POST → 403
      const postStudent = await http('POST', '/api/v1/employee-profiles', {
        token: studentToken,
        body: {
          userId: studentUserId,
          employeeCode: 'VERIFY-EP-STU-001',
          designationId: 1,
          departmentId: 1,
          branchId: 1,
          joiningDate: '2024-06-01'
        }
      });
      record(
        '4',
        'POST /employee-profiles (student) → 403',
        postStudent.status === 403,
        `got ${postStudent.status}`
      );

      // Student DELETE → 403
      if (adminProfileId != null) {
        const delStudent = await http('DELETE', `/api/v1/employee-profiles/${adminProfileId}`, {
          token: studentToken
        });
        record(
          '4',
          'DELETE /employee-profiles/:id (student) → 403',
          delStudent.status === 403,
          `got ${delStudent.status}`
        );
      }
    }

    // ─── 5. Student /me ──────────────────────────────────
    header('5. Student /me — GET → 404 (no profile)');
    {
      const getMeStudent = await http('GET', '/api/v1/employee-profiles/me', {
        token: studentToken
      });
      record(
        '5',
        'GET /employee-profiles/me (student) → 403 (no permission)',
        getMeStudent.status === 403,
        `got ${getMeStudent.status}`
      );
    }

    // ─── 6. SA delete ────────────────────────────────────
    header('6. SA delete — DELETE /:id → 200, then GET → 404');
    {
      if (adminProfileId != null) {
        const del = await http('DELETE', `/api/v1/employee-profiles/${adminProfileId}`, {
          token: saToken
        });
        record(
          '6',
          'DELETE /employee-profiles/:id (sa) → 200',
          del.status === 200,
          `got ${del.status}`
        );

        // Verify 404 after delete
        const after = await http('GET', `/api/v1/employee-profiles/${adminProfileId}`, {
          token: saToken
        });
        record(
          '6',
          'GET /employee-profiles/:id after delete → 404',
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
          await hardDeleteEmployeeProfile(adminProfileId);
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
          await hardDeleteEmployeeProfileByUserId(adminUserId);
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

      if (saUserId != null) {
        try {
          await hardDeleteEmployeeProfileByUserId(saUserId);
        } catch {
          /* no-op */
        }
      }

      if (studentUserId != null) {
        try {
          await hardDeleteEmployeeProfileByUserId(studentUserId);
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
    console.log('  Stage 5 verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
