/* eslint-disable no-console */
/**
 * Phase-04 user_experience — live end-to-end verification.
 *
 * Exercises every published route on:
 *
 *   /api/v1/user-experience
 *
 * Coverage:
 *   • Super Admin — GET / list, POST /, GET /:id, PATCH /:id, DELETE /:id
 *   • Admin       — global read/create/update OK, global delete blocked
 *   • Student     — read.own + update.own + delete.own only; no global access
 *   • /me routes  — GET/POST/PATCH/DELETE full self-service lifecycle
 *   • Soft-delete — row hidden after DELETE (no restore endpoint by design)
 *   • Cross-ownership — student A cannot touch student B's rows
 *   • Zod refines — endDate < startDate, isCurrentJob + endDate contradiction
 *   • UDF merged-value — PATCH isCurrentJob=true while existing endDate set → 4xx
 *
 * Bypasses the global rate limiter via SKIP_GLOBAL_RATE_LIMIT. The env flag
 * must be set BEFORE any src/* import so the config module reads it.
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
  console.log(`  ${mark}  ${name.padEnd(70)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;

const SA_EMAIL = `verify-ux-sa+${RUN_ID}@test.growupmore.local`;
const ADMIN_EMAIL = `verify-ux-admin+${RUN_ID}@test.growupmore.local`;
const STUDENT_EMAIL = `verify-ux-student+${RUN_ID}@test.growupmore.local`;
const STUDENT_B_EMAIL = `verify-ux-student-b+${RUN_ID}@test.growupmore.local`;
const PASSWORD = 'VerifyUserExperience123';

// ─── Mutable state ───────────────────────────────────────────

let saUserId: number | null = null;
let adminUserId: number | null = null;
let studentUserId: number | null = null;
let studentBUserId: number | null = null;

let saToken = '';
let adminToken = '';
let studentToken = '';
let studentBToken = '';

let saJti = '';
let adminJti = '';
let studentJti = '';
let studentBJti = '';

// Optional FK: designation (nullable on the table — we'll use it if present)
let designationId: number | null = null;

// Row IDs created during the test
let saCreatedExpId: number | null = null; // SA creates for studentUser
let studentSelfExpId: number | null = null; // student /me POST
let studentBMeExpId: number | null = null; // studentB /me POST

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

const pickDesignation = async (): Promise<number | null> => {
  const r = await getPool().query<{ id: string }>(
    `SELECT id::text AS id
       FROM designations
      WHERE is_deleted = FALSE AND is_active = TRUE
      ORDER BY level ASC
      LIMIT 1`
  );
  return r.rows[0] ? Number(r.rows[0].id) : null;
};

// ─────────────────────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteExperienceById = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM user_experience WHERE id = $1', [id]);
};
const hardDeleteExperienceByUserId = async (userId: number): Promise<void> => {
  await getPool().query('DELETE FROM user_experience WHERE user_id = $1', [userId]);
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
// Response types
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
interface ExpResponse {
  data?: {
    id: number;
    userId: number;
    designationId: number | null;
    companyName: string;
    jobTitle: string;
    employmentType: string;
    startDate: string | null;
    endDate: string | null;
    isCurrentJob: boolean;
    isDeleted: boolean;
    designation?: { id: number | null; name: string | null };
    user?: { firstName: string; lastName: string };
  };
}
interface ListResponse {
  data?: Array<{
    id: number;
    userId: number;
    isCurrentJob: boolean;
    isDeleted: boolean;
  }>;
  meta?: { totalCount: number; page: number; limit: number; totalPages: number };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Phase 4 · User experience verify (live) ━━');
  console.log(`  sa email        : ${SA_EMAIL}`);
  console.log(`  admin email     : ${ADMIN_EMAIL}`);
  console.log(`  student email   : ${STUDENT_EMAIL}`);
  console.log(`  student-b email : ${STUDENT_B_EMAIL}`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  try {
    // ─── 0. Setup ────────────────────────────────────────
    header('0. Setup — designation + users + tokens');
    {
      designationId = await pickDesignation();
      record(
        '0',
        'seeded designation picked (optional FK)',
        true,
        designationId == null ? 'none available — will run without it' : `id=${designationId}`
      );

      // SA
      const regSa = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUX',
          lastName: `Sa${process.pid}`,
          email: SA_EMAIL,
          password: PASSWORD,
          roleCode: 'student'
        }
      });
      record(
        '0',
        'register sa harness user',
        regSa.status === 201 && typeof regSa.body?.data?.userId === 'number',
        `status=${regSa.status}`
      );
      saUserId = regSa.body?.data?.userId ?? null;
      if (saUserId == null) throw new Error('sa register failed');
      await verifyChannels(saUserId);
      await elevateToSuperAdmin(saUserId);
      const loginSa = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: SA_EMAIL, password: PASSWORD }
      });
      saToken = loginSa.body?.data?.accessToken ?? '';
      record(
        '0',
        'sa login returns 200 + accessToken',
        loginSa.status === 200 && saToken.length > 0,
        `status=${loginSa.status}`
      );
      const saPerms = loginSa.body?.data?.user?.permissions ?? [];
      record(
        '0',
        'sa JWT has user_experience.{read,create,update,delete,read.own,update.own,delete.own}',
        saPerms.includes('user_experience.read') &&
          saPerms.includes('user_experience.create') &&
          saPerms.includes('user_experience.update') &&
          saPerms.includes('user_experience.delete') &&
          saPerms.includes('user_experience.read.own') &&
          saPerms.includes('user_experience.update.own') &&
          saPerms.includes('user_experience.delete.own'),
        `sa user_experience.* = ${saPerms.filter((p) => p.startsWith('user_experience.')).length}`
      );
      saJti = saToken ? verifyAccessToken(saToken).jti ?? '' : '';

      // Admin
      const regAdmin = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUX',
          lastName: `Admin${process.pid}`,
          email: ADMIN_EMAIL,
          password: PASSWORD,
          roleCode: 'student'
        }
      });
      adminUserId = regAdmin.body?.data?.userId ?? null;
      record(
        '0',
        'register admin harness user',
        regAdmin.status === 201 && adminUserId != null,
        `status=${regAdmin.status}`
      );
      if (adminUserId == null) throw new Error('admin register failed');
      await verifyChannels(adminUserId);
      await elevateToAdmin(adminUserId);
      const loginAdmin = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: ADMIN_EMAIL, password: PASSWORD }
      });
      adminToken = loginAdmin.body?.data?.accessToken ?? '';
      record(
        '0',
        'admin login returns 200 + accessToken',
        loginAdmin.status === 200 && adminToken.length > 0,
        `status=${loginAdmin.status}`
      );
      const adminPerms = loginAdmin.body?.data?.user?.permissions ?? [];
      record(
        '0',
        'admin has user_experience.{read,create,update} but NOT global delete',
        adminPerms.includes('user_experience.read') &&
          adminPerms.includes('user_experience.create') &&
          adminPerms.includes('user_experience.update') &&
          !adminPerms.includes('user_experience.delete'),
        `admin user_experience.* = ${adminPerms.filter((p) => p.startsWith('user_experience.')).length}`
      );
      record(
        '0',
        'admin still has user_experience.delete.own (for own rows)',
        adminPerms.includes('user_experience.delete.own'),
        ''
      );
      adminJti = adminToken ? verifyAccessToken(adminToken).jti ?? '' : '';

      // Student
      const regStudent = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUX',
          lastName: `Student${process.pid}`,
          email: STUDENT_EMAIL,
          password: PASSWORD,
          roleCode: 'student'
        }
      });
      studentUserId = regStudent.body?.data?.userId ?? null;
      record(
        '0',
        'register student harness user',
        regStudent.status === 201 && studentUserId != null,
        `status=${regStudent.status}`
      );
      if (studentUserId == null) throw new Error('student register failed');
      await verifyChannels(studentUserId);
      const loginStudent = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: STUDENT_EMAIL, password: PASSWORD }
      });
      studentToken = loginStudent.body?.data?.accessToken ?? '';
      record(
        '0',
        'student login returns 200 + accessToken',
        loginStudent.status === 200 && studentToken.length > 0,
        `status=${loginStudent.status}`
      );
      const studentPerms = loginStudent.body?.data?.user?.permissions ?? [];
      record(
        '0',
        'student has user_experience.{read.own,update.own,delete.own} and NOT global',
        studentPerms.includes('user_experience.read.own') &&
          studentPerms.includes('user_experience.update.own') &&
          studentPerms.includes('user_experience.delete.own') &&
          !studentPerms.includes('user_experience.read') &&
          !studentPerms.includes('user_experience.create') &&
          !studentPerms.includes('user_experience.delete'),
        `student user_experience.* = ${studentPerms.filter((p) => p.startsWith('user_experience.')).length}`
      );
      studentJti = studentToken ? verifyAccessToken(studentToken).jti ?? '' : '';

      // Student B
      const regStudentB = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUX',
          lastName: `StudentB${process.pid}`,
          email: STUDENT_B_EMAIL,
          password: PASSWORD,
          roleCode: 'student'
        }
      });
      studentBUserId = regStudentB.body?.data?.userId ?? null;
      record(
        '0',
        'register student-b harness user',
        regStudentB.status === 201 && studentBUserId != null,
        `status=${regStudentB.status}`
      );
      if (studentBUserId == null) throw new Error('student-b register failed');
      await verifyChannels(studentBUserId);
      const loginStudentB = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: STUDENT_B_EMAIL, password: PASSWORD }
      });
      studentBToken = loginStudentB.body?.data?.accessToken ?? '';
      record(
        '0',
        'student-b login returns 200',
        loginStudentB.status === 200 && studentBToken.length > 0,
        `status=${loginStudentB.status}`
      );
      studentBJti = studentBToken ? verifyAccessToken(studentBToken).jti ?? '' : '';
    }

    if (!saToken || !adminToken || !studentToken || !studentBToken) {
      throw new Error('missing token — bailing');
    }

    // ─── 1. Anonymous → 401 ──────────────────────────────
    header('1. Auth — anonymous → 401');
    {
      const a = await http('GET', '/api/v1/user-experience');
      record('1', 'GET /user-experience (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('GET', '/api/v1/user-experience/me');
      record('1', 'GET /user-experience/me (no token) → 401', b.status === 401, `got ${b.status}`);
      const c = await http('POST', '/api/v1/user-experience/me', {
        body: { companyName: 'X', jobTitle: 'Y', startDate: '2020-01-01' }
      });
      record('1', 'POST /user-experience/me (no token) → 401', c.status === 401, `got ${c.status}`);
    }

    // ─── 2. Super Admin CRUD ─────────────────────────────
    header('2. Super Admin — POST / GET / list / PATCH on another user');
    {
      // 2.a SA POST / (targets studentUserId)
      const body: Record<string, unknown> = {
        userId: studentUserId,
        companyName: `Acme Corp ${RUN_ID}`,
        jobTitle: 'Software Engineer',
        employmentType: 'full_time',
        department: 'Engineering',
        location: 'Bengaluru',
        workMode: 'hybrid',
        startDate: '2020-01-01',
        endDate: '2022-06-30',
        isCurrentJob: false,
        description: 'seeded by verify-phase-04-experience',
        keyAchievements: 'Shipped phase-04',
        skillsUsed: 'TypeScript, PostgreSQL'
      };
      if (designationId != null) body.designationId = designationId;

      const create = await http<ExpResponse>('POST', '/api/v1/user-experience', {
        token: saToken,
        body
      });
      record(
        '2',
        'POST /user-experience (sa) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      saCreatedExpId = create.body?.data?.id ?? null;
      if (saCreatedExpId == null) {
        throw new Error(`sa create failed; body=${JSON.stringify(create.body)}`);
      }

      // 2.b zod reject — missing required companyName
      const zodMiss = await http('POST', '/api/v1/user-experience', {
        token: saToken,
        body: {
          userId: studentUserId,
          jobTitle: 'X',
          startDate: '2020-01-01'
        }
      });
      record('2', 'POST missing companyName → 400', zodMiss.status === 400, `got ${zodMiss.status}`);

      // 2.c zod reject — bad date format
      const zodDate = await http('POST', '/api/v1/user-experience', {
        token: saToken,
        body: {
          userId: studentUserId,
          companyName: 'X',
          jobTitle: 'Y',
          startDate: '01-01-2020'
        }
      });
      record('2', 'POST bad startDate format → 400', zodDate.status === 400, `got ${zodDate.status}`);

      // 2.d zod refine — endDate < startDate
      const zodRange = await http('POST', '/api/v1/user-experience', {
        token: saToken,
        body: {
          userId: studentUserId,
          companyName: 'X',
          jobTitle: 'Y',
          startDate: '2020-01-01',
          endDate: '2019-12-31'
        }
      });
      record('2', 'POST endDate < startDate → 400', zodRange.status === 400, `got ${zodRange.status}`);

      // 2.e zod refine — isCurrentJob=true + endDate
      const zodCur = await http('POST', '/api/v1/user-experience', {
        token: saToken,
        body: {
          userId: studentUserId,
          companyName: 'X',
          jobTitle: 'Y',
          startDate: '2020-01-01',
          endDate: '2022-01-01',
          isCurrentJob: true
        }
      });
      record(
        '2',
        'POST isCurrentJob=true + endDate → 400',
        zodCur.status === 400,
        `got ${zodCur.status}`
      );

      // 2.f zod reject — invalid employmentType
      const zodEnum = await http('POST', '/api/v1/user-experience', {
        token: saToken,
        body: {
          userId: studentUserId,
          companyName: 'X',
          jobTitle: 'Y',
          startDate: '2020-01-01',
          employmentType: 'rocket-surgeon'
        }
      });
      record(
        '2',
        'POST invalid employmentType → 400',
        zodEnum.status === 400,
        `got ${zodEnum.status}`
      );

      // 2.g SA list (filter to studentUserId — should see 1 row)
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-experience?userId=${studentUserId}&pageSize=10`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-experience?userId=... (sa) → 200',
        list.status === 200,
        `status=${list.status}`
      );
      record(
        '2',
        'list response has data[] + meta shape',
        Array.isArray(list.body?.data) &&
          typeof list.body?.meta?.totalCount === 'number',
        `totalCount=${list.body?.meta?.totalCount}`
      );
      record(
        '2',
        'newly created row visible in list',
        (list.body?.data ?? []).some((r) => r.id === saCreatedExpId),
        `ids=${(list.body?.data ?? []).map((r) => r.id).join(',')}`
      );

      // 2.h SA GET /:id — nested user + designation
      const getOne = await http<ExpResponse>(
        'GET',
        `/api/v1/user-experience/${saCreatedExpId}`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-experience/:id (sa) → 200 with nested user',
        getOne.status === 200 &&
          getOne.body?.data?.id === saCreatedExpId &&
          getOne.body?.data?.userId === studentUserId &&
          typeof getOne.body?.data?.user?.firstName === 'string',
        `companyName=${getOne.body?.data?.companyName ?? 'null'}`
      );

      // 2.i SA PATCH — partial update
      const patchOk = await http('PATCH', `/api/v1/user-experience/${saCreatedExpId}`, {
        token: saToken,
        body: {
          department: 'Platform Engineering',
          location: 'Hyderabad',
          description: `sa patched ${RUN_ID}`
        }
      });
      record('2', 'PATCH /user-experience/:id (sa) → 200', patchOk.status === 200, `got ${patchOk.status}`);

      // 2.j SA PATCH — merged-value validation: flip isCurrentJob=true while endDate exists
      const patchMerged = await http('PATCH', `/api/v1/user-experience/${saCreatedExpId}`, {
        token: saToken,
        body: { isCurrentJob: true }
      });
      record(
        '2',
        'PATCH merged isCurrentJob=true vs existing endDate → 4xx',
        patchMerged.status >= 400 && patchMerged.status < 500,
        `got ${patchMerged.status}`
      );

      // Verify PATCH didn't persist
      const verify = await http<ExpResponse>(
        'GET',
        `/api/v1/user-experience/${saCreatedExpId}`,
        { token: saToken }
      );
      record(
        '2',
        'merged-value PATCH did not persist isCurrentJob',
        verify.body?.data?.isCurrentJob === false,
        `isCurrentJob=${verify.body?.data?.isCurrentJob}`
      );
    }

    // ─── 3. Admin — global read/create/update OK, global delete blocked ─
    header('3. Admin — global read/create/update OK, global DELETE → 403');
    {
      // 3.a Admin can list
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-experience?userId=${studentUserId}&pageSize=5`,
        { token: adminToken }
      );
      record('3', 'GET /user-experience (admin) → 200', list.status === 200, `got ${list.status}`);

      // 3.b Admin can GET /:id
      if (saCreatedExpId != null) {
        const getOne = await http(
          'GET',
          `/api/v1/user-experience/${saCreatedExpId}`,
          { token: adminToken }
        );
        record(
          '3',
          'GET /user-experience/:id (admin) → 200',
          getOne.status === 200,
          `got ${getOne.status}`
        );
      }

      // 3.c Admin can PATCH
      if (saCreatedExpId != null) {
        const patch = await http('PATCH', `/api/v1/user-experience/${saCreatedExpId}`, {
          token: adminToken,
          body: { description: `admin patched ${RUN_ID}` }
        });
        record(
          '3',
          'PATCH /user-experience/:id (admin) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      // 3.d Admin BLOCKED on global DELETE /:id (no user_experience.delete)
      if (saCreatedExpId != null) {
        const del = await http('DELETE', `/api/v1/user-experience/${saCreatedExpId}`, {
          token: adminToken
        });
        record(
          '3',
          'DELETE /user-experience/:id (admin, other user) → 403',
          del.status === 403,
          `got ${del.status}`
        );
      }
    }

    // ─── 4. Student — list/read-other/write-other → 403 ──
    header('4. Student — list + read-other + write-other → 403');
    {
      // Student has no user_experience.read → listing is 403
      const listS = await http('GET', '/api/v1/user-experience', { token: studentToken });
      record(
        '4',
        'GET /user-experience (student, no global) → 403',
        listS.status === 403,
        `got ${listS.status}`
      );

      // Create an admin-owned row via SA for read-other checks
      const adminRow = await http<ExpResponse>('POST', '/api/v1/user-experience', {
        token: saToken,
        body: {
          userId: adminUserId,
          companyName: `Admin Corp ${RUN_ID}`,
          jobTitle: 'CEO',
          employmentType: 'full_time',
          startDate: '2010-01-01',
          endDate: '2019-12-31'
        }
      });
      const adminRowId = adminRow.body?.data?.id;
      record(
        '4',
        'fixture: sa created admin-owned row',
        adminRow.status === 201 && typeof adminRowId === 'number',
        `id=${adminRowId}`
      );

      if (typeof adminRowId === 'number') {
        // Student reads SOMEONE ELSE'S row → 403
        const getOther = await http(
          'GET',
          `/api/v1/user-experience/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          "GET /user-experience/:id (student → admin's row) → 403",
          getOther.status === 403,
          `got ${getOther.status}`
        );

        // Student PATCH someone else's row → 403
        const patchOther = await http(
          'PATCH',
          `/api/v1/user-experience/${adminRowId}`,
          { token: studentToken, body: { description: 'nope' } }
        );
        record(
          '4',
          'PATCH /user-experience/:id (student → other) → 403',
          patchOther.status === 403,
          `got ${patchOther.status}`
        );

        // Student DELETE someone else's row via /me/:id → 403 (manual ownership check)
        const delOtherMe = await http(
          'DELETE',
          `/api/v1/user-experience/me/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-experience/me/:id (student → other) → 403',
          delOtherMe.status === 403,
          `got ${delOtherMe.status}`
        );

        // Student DELETE via global /:id → 403 (no global perm + not self)
        const delOther = await http(
          'DELETE',
          `/api/v1/user-experience/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-experience/:id (student → other) → 403',
          delOther.status === 403,
          `got ${delOther.status}`
        );

        // Cleanup: sa deletes the admin row
        await http('DELETE', `/api/v1/user-experience/${adminRowId}`, { token: saToken });
      }

      // Student cannot POST / (admin-scoped)
      const postS = await http('POST', '/api/v1/user-experience', {
        token: studentToken,
        body: {
          userId: studentUserId,
          companyName: 'X',
          jobTitle: 'Y',
          startDate: '2020-01-01'
        }
      });
      record('4', 'POST /user-experience (student) → 403', postS.status === 403, `got ${postS.status}`);
    }

    // ─── 5. Student /me lifecycle ────────────────────────
    header('5. Student — /me full lifecycle + ownership enforcement');
    {
      // 5.a GET /me — should list the SA-created row for this student
      const me0 = await http<ListResponse>('GET', '/api/v1/user-experience/me', {
        token: studentToken
      });
      record(
        '5',
        'GET /me (student) → 200 with SA-seeded row',
        me0.status === 200 && (me0.body?.data ?? []).some((r) => r.id === saCreatedExpId),
        `count=${(me0.body?.data ?? []).length}`
      );

      // 5.b GET /me with a foreign userId — server-side override
      const meOverride = await http<ListResponse>(
        'GET',
        `/api/v1/user-experience/me?userId=${adminUserId}`,
        { token: studentToken }
      );
      record(
        '5',
        'GET /me?userId=<admin> — server overrides query userId',
        meOverride.status === 200 &&
          (meOverride.body?.data ?? []).every((r) => r.userId === studentUserId),
        `userIds=${(meOverride.body?.data ?? []).map((r) => r.userId).join(',')}`
      );

      // 5.c POST /me — student self-creates (current job)
      const create = await http<ExpResponse>('POST', '/api/v1/user-experience/me', {
        token: studentToken,
        body: {
          companyName: `Student Ventures ${RUN_ID}`,
          jobTitle: 'Founder',
          employmentType: 'self_employed',
          workMode: 'remote',
          startDate: '2024-01-01',
          isCurrentJob: true,
          description: 'self-service create'
        }
      });
      record(
        '5',
        'POST /me (student, current job) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      studentSelfExpId = create.body?.data?.id ?? null;
      record(
        '5',
        'POST /me row owned by caller (userId matches)',
        create.body?.data?.userId === studentUserId,
        `userId=${create.body?.data?.userId}`
      );

      // 5.d Student GET /:id on own row via self-or
      if (studentSelfExpId != null) {
        const getSelf = await http(
          'GET',
          `/api/v1/user-experience/${studentSelfExpId}`,
          { token: studentToken }
        );
        record(
          '5',
          'GET /user-experience/:id (student → own row) → 200',
          getSelf.status === 200,
          `got ${getSelf.status}`
        );
      }

      // 5.e PATCH /me/:id — student's OWN sa-seeded row
      if (saCreatedExpId != null) {
        const patch = await http('PATCH', `/api/v1/user-experience/me/${saCreatedExpId}`, {
          token: studentToken,
          body: { location: 'Remote', description: `student self-updated ${RUN_ID}` }
        });
        record(
          '5',
          'PATCH /me/:id (student → own sa-seeded row) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      // 5.f Student-B creates own row → student A cannot touch it
      const bCreate = await http<ExpResponse>('POST', '/api/v1/user-experience/me', {
        token: studentBToken,
        body: {
          companyName: `Student B Inc ${RUN_ID}`,
          jobTitle: 'Engineer',
          startDate: '2022-01-01',
          endDate: '2023-12-31'
        }
      });
      studentBMeExpId = bCreate.body?.data?.id ?? null;
      record(
        '5',
        'POST /me (student-b) → 201',
        bCreate.status === 201 && studentBMeExpId != null,
        `id=${studentBMeExpId}`
      );

      if (studentBMeExpId != null) {
        const patchB = await http('PATCH', `/api/v1/user-experience/me/${studentBMeExpId}`, {
          token: studentToken,
          body: { description: 'evil' }
        });
        record(
          '5',
          "PATCH /me/:id (student A → student B's row) → 403",
          patchB.status === 403,
          `got ${patchB.status}`
        );

        const delB = await http('DELETE', `/api/v1/user-experience/me/${studentBMeExpId}`, {
          token: studentToken
        });
        record(
          '5',
          "DELETE /me/:id (student A → student B's row) → 403",
          delB.status === 403,
          `got ${delB.status}`
        );
      }

      // 5.g Student self-deletes own row via /me/:id → 200 + row disappears
      if (studentSelfExpId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-experience/me/${studentSelfExpId}`,
          { token: studentToken }
        );
        record(
          '5',
          'DELETE /me/:id (student → own row) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        // Row is soft-deleted and hidden. For a student (own-scope only)
        // authorizeSelfOr cannot resolve the target owner because the row
        // is hidden, so it returns 403 before the handler runs. Correct —
        // SA with global read will see 404 (section 6).
        const gone = await http(
          'GET',
          `/api/v1/user-experience/${studentSelfExpId}`,
          { token: studentToken }
        );
        record(
          '5',
          'GET /:id after own soft-delete → 403 (own-scope cannot resolve hidden row)',
          gone.status === 403,
          `got ${gone.status}`
        );
      }
    }

    // ─── 6. Soft-delete via global DELETE (sa) ───────────
    header('6. Super Admin — DELETE /:id → soft delete + hidden');
    {
      if (saCreatedExpId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-experience/${saCreatedExpId}`,
          { token: saToken }
        );
        record(
          '6',
          'DELETE /user-experience/:id (sa) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        const after = await http(
          'GET',
          `/api/v1/user-experience/${saCreatedExpId}`,
          { token: saToken }
        );
        record(
          '6',
          'GET /user-experience/:id after sa soft-delete → 404',
          after.status === 404,
          `got ${after.status}`
        );

        // Verify row still exists in DB with is_deleted = TRUE
        const row = await getPool().query<{ is_deleted: boolean; is_active: boolean }>(
          'SELECT is_deleted, is_active FROM user_experience WHERE id = $1',
          [saCreatedExpId]
        );
        record(
          '6',
          'DB row still present with is_deleted=TRUE, is_active=FALSE',
          row.rows[0]?.is_deleted === true && row.rows[0]?.is_active === false,
          `is_deleted=${row.rows[0]?.is_deleted} is_active=${row.rows[0]?.is_active}`
        );
      }
    }

    // ─── 6.5 Restore lifecycle (admin+ only) ─────────────
    header('6.5 Restore — POST /:id/restore (admin+ only)');
    {
      if (saCreatedExpId != null) {
        // Student has no user_experience.restore permission → 403
        const studentRestore = await http(
          'POST',
          `/api/v1/user-experience/${saCreatedExpId}/restore`,
          { token: studentToken }
        );
        record(
          '6.5',
          'POST /:id/restore (student) → 403',
          studentRestore.status === 403,
          `got ${studentRestore.status}`
        );

        // SA restores the row → 200 + row is visible again
        const saRestore = await http<{
          data?: { id: number; isDeleted: boolean; isActive: boolean };
        }>(
          'POST',
          `/api/v1/user-experience/${saCreatedExpId}/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore (sa) → 200',
          saRestore.status === 200 &&
            saRestore.body?.data?.isDeleted === false &&
            saRestore.body?.data?.isActive === true,
          `status=${saRestore.status} isDeleted=${saRestore.body?.data?.isDeleted} isActive=${saRestore.body?.data?.isActive}`
        );

        // GET /:id should now succeed (row visible again)
        const afterRestore = await http(
          'GET',
          `/api/v1/user-experience/${saCreatedExpId}`,
          { token: saToken }
        );
        record(
          '6.5',
          'GET /:id after sa restore → 200 (row visible)',
          afterRestore.status === 200,
          `got ${afterRestore.status}`
        );

        // Restoring an already-active row → 400 (not deleted)
        const restoreAgain = await http(
          'POST',
          `/api/v1/user-experience/${saCreatedExpId}/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore on non-deleted row (sa) → 400',
          restoreAgain.status === 400,
          `got ${restoreAgain.status}`
        );

        // Restoring a non-existent id → 404
        const restoreMissing = await http(
          'POST',
          `/api/v1/user-experience/999999999/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore on non-existent id → 404',
          restoreMissing.status === 404,
          `got ${restoreMissing.status}`
        );

        // Admin also has user_experience.restore — delete & let admin restore
        const delAgain = await http(
          'DELETE',
          `/api/v1/user-experience/${saCreatedExpId}`,
          { token: saToken }
        );
        record(
          '6.5',
          'DELETE (sa, pre-admin-restore) → 200',
          delAgain.status === 200,
          `got ${delAgain.status}`
        );

        const adminRestore = await http<{
          data?: { id: number; isDeleted: boolean; isActive: boolean };
        }>(
          'POST',
          `/api/v1/user-experience/${saCreatedExpId}/restore`,
          { token: adminToken }
        );
        record(
          '6.5',
          'POST /:id/restore (admin) → 200',
          adminRestore.status === 200 &&
            adminRestore.body?.data?.isDeleted === false,
          `status=${adminRestore.status} isDeleted=${adminRestore.body?.data?.isDeleted}`
        );

        // Final state: DB row should be visible + active after the
        // admin restore.
        const finalRow = await getPool().query<{
          is_deleted: boolean;
          is_active: boolean;
        }>(
          'SELECT is_deleted, is_active FROM user_experience WHERE id = $1',
          [saCreatedExpId]
        );
        record(
          '6.5',
          'DB row after admin restore: is_deleted=FALSE, is_active=TRUE',
          finalRow.rows[0]?.is_deleted === false &&
            finalRow.rows[0]?.is_active === true,
          `is_deleted=${finalRow.rows[0]?.is_deleted} is_active=${finalRow.rows[0]?.is_active}`
        );
      }
    }
  } finally {
    // ─── 7. Cleanup ──────────────────────────────────────
    header('7. Cleanup');
    {
      for (const id of [saCreatedExpId, studentSelfExpId, studentBMeExpId]) {
        if (id == null) continue;
        try {
          await hardDeleteExperienceById(id);
          record('7', `row hard-deleted`, true, `id=${id}`);
        } catch (err) {
          record('7', `row hard-delete failed`, false, (err as Error).message);
        }
      }
      for (const uid of [saUserId, adminUserId, studentUserId, studentBUserId]) {
        if (uid == null) continue;
        try {
          await hardDeleteExperienceByUserId(uid);
        } catch {
          /* no-op */
        }
        try {
          await softDeleteUser(uid);
          record('7', `user soft-deleted`, true, `uid=${uid}`);
        } catch (err) {
          record('7', `user soft-delete failed`, false, (err as Error).message);
        }
      }
      for (const jti of [saJti, adminJti, studentJti, studentBJti].filter(Boolean)) {
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
    console.log('  Phase 4 user_experience verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
