/* eslint-disable no-console */
/**
 * Phase-04 user_projects — live end-to-end verification.
 *
 * Exercises every published route on:
 *
 *   /api/v1/user-projects
 *
 * Coverage:
 *   • Super Admin — GET / list, POST /, GET /:id, PATCH /:id, DELETE /:id
 *   • Admin       — list / read / update / create a user's row; admin is
 *                   blocked on global DELETE but CAN call restore
 *   • Student     — /me full lifecycle (student can set isFeatured +
 *                   isPublished — unlike user_documents these are NOT gated)
 *                   — read-other / write-other blocked
 *   • Soft-delete — row hidden after DELETE
 *   • Restore     — POST /:id/restore (admin+ only; student 403)
 *
 * Also exercises the cross-field refinements:
 *   - endDate < startDate → 400
 *   - isOngoing=true with endDate set → 400
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
  console.log(`  ${mark}  ${name.padEnd(74)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;

const SA_EMAIL = `verify-uproj-sa+${RUN_ID}@test.growupmore.local`;
const ADMIN_EMAIL = `verify-uproj-admin+${RUN_ID}@test.growupmore.local`;
const STUDENT_EMAIL = `verify-uproj-student+${RUN_ID}@test.growupmore.local`;
const STUDENT_B_EMAIL = `verify-uproj-student-b+${RUN_ID}@test.growupmore.local`;
const PASSWORD = 'VerifyUserProject123';

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

// Row IDs created during the test
let saCreatedUprojId: number | null = null; // SA creates for studentUser
let studentSelfUprojId: number | null = null; // student /me POST
let studentBMeUprojId: number | null = null; // studentB /me POST (used for ownership check)

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

const hardDeleteUprojById = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM user_projects WHERE id = $1', [id]);
};
const hardDeleteUprojByUserId = async (userId: number): Promise<void> => {
  await getPool().query('DELETE FROM user_projects WHERE user_id = $1', [userId]);
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
interface UprojResponse {
  data?: {
    id: number;
    userId: number;
    projectTitle: string;
    projectType: string | null;
    projectStatus: string | null;
    organizationName: string | null;
    industry: string | null;
    startDate: string | null;
    endDate: string | null;
    isOngoing: boolean | null;
    isFeatured: boolean | null;
    isPublished: boolean | null;
    displayOrder: number | null;
    isActive: boolean;
    isDeleted: boolean;
    user?: { firstName: string; lastName: string };
  };
}
interface ListResponse {
  data?: Array<{
    id: number;
    userId: number;
    projectTitle: string;
    isDeleted: boolean;
  }>;
  meta?: { totalCount: number; page: number; limit: number; totalPages: number };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Phase 4 · User projects verify (live) ━━');
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
    header('0. Setup — users + tokens');
    {
      // SA
      const regSa = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUproj',
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
        'sa JWT has user_project.{read,create,update,delete,read.own,update.own,delete.own,restore}',
        saPerms.includes('user_project.read') &&
          saPerms.includes('user_project.create') &&
          saPerms.includes('user_project.update') &&
          saPerms.includes('user_project.delete') &&
          saPerms.includes('user_project.read.own') &&
          saPerms.includes('user_project.update.own') &&
          saPerms.includes('user_project.delete.own') &&
          saPerms.includes('user_project.restore'),
        `perms=${saPerms.filter((p) => p.startsWith('user_project.')).length}`
      );
      saJti = saToken ? verifyAccessToken(saToken).jti ?? '' : '';

      // Admin
      const regAdmin = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUproj',
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
        'admin has user_project.{read,create,update,restore} but NOT global delete',
        adminPerms.includes('user_project.read') &&
          adminPerms.includes('user_project.create') &&
          adminPerms.includes('user_project.update') &&
          adminPerms.includes('user_project.restore') &&
          !adminPerms.includes('user_project.delete'),
        `admin user_project.* = ${adminPerms.filter((p) => p.startsWith('user_project.')).length}`
      );
      record(
        '0',
        'admin still has user_project.delete.own (for own rows)',
        adminPerms.includes('user_project.delete.own'),
        ''
      );
      adminJti = adminToken ? verifyAccessToken(adminToken).jti ?? '' : '';

      // Student
      const regStudent = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUproj',
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
        'student has user_project.{read.own,update.own,delete.own} only',
        studentPerms.includes('user_project.read.own') &&
          studentPerms.includes('user_project.update.own') &&
          studentPerms.includes('user_project.delete.own') &&
          !studentPerms.includes('user_project.read') &&
          !studentPerms.includes('user_project.create') &&
          !studentPerms.includes('user_project.delete') &&
          !studentPerms.includes('user_project.restore'),
        `student user_project.* = ${studentPerms.filter((p) => p.startsWith('user_project.')).length}`
      );
      studentJti = studentToken ? verifyAccessToken(studentToken).jti ?? '' : '';

      // Student B
      const regStudentB = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUproj',
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
      const a = await http('GET', '/api/v1/user-projects');
      record('1', 'GET /user-projects (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('GET', '/api/v1/user-projects/me');
      record('1', 'GET /user-projects/me (no token) → 401', b.status === 401, `got ${b.status}`);
      const c = await http('POST', '/api/v1/user-projects/me', {
        body: { projectTitle: 'Anon Project' }
      });
      record('1', 'POST /user-projects/me (no token) → 401', c.status === 401, `got ${c.status}`);
    }

    // ─── 2. Super Admin CRUD ─────────────────────────────
    header('2. Super Admin — POST / GET / list / PATCH on another user');
    {
      // 2.a SA POST /
      const create = await http<UprojResponse>('POST', '/api/v1/user-projects', {
        token: saToken,
        body: {
          userId: studentUserId,
          projectTitle: `Verify Project Alpha ${RUN_ID}`,
          projectType: 'academic',
          projectStatus: 'in_progress',
          description: 'A verify harness project.',
          roleInProject: 'Lead',
          organizationName: 'Verify Org',
          industry: 'Education',
          technologiesUsed: 'TypeScript, Postgres',
          startDate: '2024-06-01',
          isOngoing: true
        }
      });
      record(
        '2',
        'POST /user-projects (sa) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      saCreatedUprojId = create.body?.data?.id ?? null;
      if (saCreatedUprojId == null) {
        throw new Error(`sa create failed; body=${JSON.stringify(create.body)}`);
      }
      record(
        '2',
        'POST response reflects enum (projectType=academic, projectStatus=in_progress)',
        create.body?.data?.projectType === 'academic' &&
          create.body?.data?.projectStatus === 'in_progress',
        `type=${create.body?.data?.projectType} status=${create.body?.data?.projectStatus}`
      );

      // 2.b zod reject — invalid projectType
      const zodType = await http('POST', '/api/v1/user-projects', {
        token: saToken,
        body: {
          userId: studentUserId,
          projectTitle: 'Bad Type Project',
          projectType: 'alien_technology'
        }
      });
      record('2', 'POST bad projectType → 400', zodType.status === 400, `got ${zodType.status}`);

      // 2.c zod reject — endDate before startDate
      const zodDates = await http('POST', '/api/v1/user-projects', {
        token: saToken,
        body: {
          userId: studentUserId,
          projectTitle: 'Backwards Dates Project',
          startDate: '2024-06-01',
          endDate: '2023-06-01'
        }
      });
      record(
        '2',
        'POST endDate<startDate → 400',
        zodDates.status === 400,
        `got ${zodDates.status}`
      );

      // 2.d zod reject — isOngoing=true + endDate set
      const zodOngoing = await http('POST', '/api/v1/user-projects', {
        token: saToken,
        body: {
          userId: studentUserId,
          projectTitle: 'Ongoing With End Project',
          isOngoing: true,
          endDate: '2025-01-01'
        }
      });
      record(
        '2',
        'POST isOngoing=true + endDate → 400',
        zodOngoing.status === 400,
        `got ${zodOngoing.status}`
      );

      // 2.e zod reject — missing required projectTitle
      const zodMissing = await http('POST', '/api/v1/user-projects', {
        token: saToken,
        body: { userId: studentUserId, projectType: 'personal' }
      });
      record(
        '2',
        'POST missing projectTitle → 400',
        zodMissing.status === 400,
        `got ${zodMissing.status}`
      );

      // 2.f UDF reject — non-existent userId
      const fkUser = await http('POST', '/api/v1/user-projects', {
        token: saToken,
        body: { userId: 999999999, projectTitle: 'Ghost Project' }
      });
      record(
        '2',
        'POST non-existent userId → 4xx',
        fkUser.status >= 400 && fkUser.status < 500,
        `got ${fkUser.status}`
      );

      // 2.g SA list filter to studentUserId
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-projects?userId=${studentUserId}&pageSize=10`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-projects?userId=... (sa) → 200',
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
        (list.body?.data ?? []).some((r) => r.id === saCreatedUprojId),
        `ids=${(list.body?.data ?? []).map((r) => r.id).join(',')}`
      );

      // 2.h SA GET /:id with nested user
      const getOne = await http<UprojResponse>(
        'GET',
        `/api/v1/user-projects/${saCreatedUprojId}`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-projects/:id (sa) → 200 with nested user',
        getOne.status === 200 &&
          getOne.body?.data?.id === saCreatedUprojId &&
          getOne.body?.data?.userId === studentUserId &&
          typeof getOne.body?.data?.user?.firstName === 'string',
        `user=${getOne.body?.data?.user?.firstName ?? 'null'}`
      );

      // 2.i SA PATCH — complete the project
      const patchOk = await http('PATCH', `/api/v1/user-projects/${saCreatedUprojId}`, {
        token: saToken,
        body: {
          projectStatus: 'completed',
          isOngoing: false,
          endDate: '2025-12-01',
          impactSummary: 'Shipped successfully.'
        }
      });
      record('2', 'PATCH /user-projects/:id (sa) → 200', patchOk.status === 200, `got ${patchOk.status}`);

      // 2.j PATCH validation — endDate < startDate in update
      const patchDates = await http('PATCH', `/api/v1/user-projects/${saCreatedUprojId}`, {
        token: saToken,
        body: { startDate: '2025-06-01', endDate: '2024-01-01' }
      });
      record(
        '2',
        'PATCH endDate<startDate → 400',
        patchDates.status === 400,
        `got ${patchDates.status}`
      );

      // 2.k PATCH validation — isOngoing=true + endDate in update
      const patchOngoing = await http('PATCH', `/api/v1/user-projects/${saCreatedUprojId}`, {
        token: saToken,
        body: { isOngoing: true, endDate: '2027-01-01' }
      });
      record(
        '2',
        'PATCH isOngoing=true + endDate → 400',
        patchOngoing.status === 400,
        `got ${patchOngoing.status}`
      );

      // 2.l PATCH validation — empty body
      const patchEmpty = await http('PATCH', `/api/v1/user-projects/${saCreatedUprojId}`, {
        token: saToken,
        body: {}
      });
      record(
        '2',
        'PATCH empty body → 400',
        patchEmpty.status === 400,
        `got ${patchEmpty.status}`
      );

      // 2.m Verify PATCH applied
      const verify = await http<UprojResponse>(
        'GET',
        `/api/v1/user-projects/${saCreatedUprojId}`,
        { token: saToken }
      );
      record(
        '2',
        'PATCH persisted — projectStatus=completed, isOngoing=false',
        verify.body?.data?.projectStatus === 'completed' &&
          verify.body?.data?.isOngoing === false,
        `status=${verify.body?.data?.projectStatus} ongoing=${verify.body?.data?.isOngoing}`
      );
    }

    // ─── 3. Admin — global read/create/update, global delete blocked ───
    header('3. Admin — global read/create/update OK, global DELETE → 403');
    {
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-projects?userId=${studentUserId}&pageSize=5`,
        { token: adminToken }
      );
      record('3', 'GET /user-projects (admin) → 200', list.status === 200, `got ${list.status}`);

      if (saCreatedUprojId != null) {
        const getOne = await http(
          'GET',
          `/api/v1/user-projects/${saCreatedUprojId}`,
          { token: adminToken }
        );
        record(
          '3',
          'GET /user-projects/:id (admin) → 200',
          getOne.status === 200,
          `got ${getOne.status}`
        );
      }

      if (saCreatedUprojId != null) {
        const patch = await http('PATCH', `/api/v1/user-projects/${saCreatedUprojId}`, {
          token: adminToken,
          body: { industry: 'EdTech' }
        });
        record(
          '3',
          'PATCH /user-projects/:id (admin) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      if (saCreatedUprojId != null) {
        const del = await http('DELETE', `/api/v1/user-projects/${saCreatedUprojId}`, {
          token: adminToken
        });
        record(
          '3',
          'DELETE /user-projects/:id (admin, other user) → 403',
          del.status === 403,
          `got ${del.status}`
        );
      }
    }

    // ─── 4. Student — read-other / write-other / list blocked ──
    header('4. Student — list + read-other + write-other → 403');
    {
      const listS = await http('GET', '/api/v1/user-projects', { token: studentToken });
      record(
        '4',
        'GET /user-projects (student, no global) → 403',
        listS.status === 403,
        `got ${listS.status}`
      );

      const adminRow = await http<UprojResponse>('POST', '/api/v1/user-projects', {
        token: saToken,
        body: {
          userId: adminUserId,
          projectTitle: `Verify Admin Project ${RUN_ID}`,
          projectType: 'professional',
          projectStatus: 'completed'
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
        const getOther = await http(
          'GET',
          `/api/v1/user-projects/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          "GET /user-projects/:id (student → admin's row) → 403",
          getOther.status === 403,
          `got ${getOther.status}`
        );

        const patchOther = await http(
          'PATCH',
          `/api/v1/user-projects/${adminRowId}`,
          { token: studentToken, body: { industry: 'Hacked' } }
        );
        record(
          '4',
          'PATCH /user-projects/:id (student → other) → 403',
          patchOther.status === 403,
          `got ${patchOther.status}`
        );

        const delOtherMe = await http(
          'DELETE',
          `/api/v1/user-projects/me/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-projects/me/:id (student → other) → 403',
          delOtherMe.status === 403,
          `got ${delOtherMe.status}`
        );

        const delOther = await http(
          'DELETE',
          `/api/v1/user-projects/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-projects/:id (student → other) → 403',
          delOther.status === 403,
          `got ${delOther.status}`
        );

        // Cleanup: sa deletes the admin row
        await http('DELETE', `/api/v1/user-projects/${adminRowId}`, { token: saToken });
      }

      const postS = await http('POST', '/api/v1/user-projects', {
        token: studentToken,
        body: { userId: studentUserId, projectTitle: 'Should 403' }
      });
      record(
        '4',
        'POST /user-projects (student, global) → 403',
        postS.status === 403,
        `got ${postS.status}`
      );
    }

    // ─── 5. Student /me lifecycle ────────────────────────
    header('5. Student — /me lifecycle + isFeatured/isPublished self-settable');
    {
      const me0 = await http<ListResponse>('GET', '/api/v1/user-projects/me', {
        token: studentToken
      });
      record(
        '5',
        'GET /me (student) → 200 with SA-seeded row',
        me0.status === 200 && (me0.body?.data ?? []).some((r) => r.id === saCreatedUprojId),
        `count=${(me0.body?.data ?? []).length}`
      );

      const meOverride = await http<ListResponse>(
        'GET',
        `/api/v1/user-projects/me?userId=${adminUserId}`,
        { token: studentToken }
      );
      record(
        '5',
        'GET /me?userId=<admin> — server overrides query userId',
        meOverride.status === 200 &&
          (meOverride.body?.data ?? []).every((r) => r.userId === studentUserId),
        `userIds=${(meOverride.body?.data ?? []).map((r) => r.userId).join(',')}`
      );

      // Student creates own project via /me with isFeatured+isPublished
      const create = await http<UprojResponse>('POST', '/api/v1/user-projects/me', {
        token: studentToken,
        body: {
          projectTitle: `Verify Student Project ${RUN_ID}`,
          projectType: 'personal',
          projectStatus: 'in_progress',
          isFeatured: true,
          isPublished: true,
          startDate: '2025-01-01',
          isOngoing: true
        }
      });
      record(
        '5',
        'POST /me (student) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      studentSelfUprojId = create.body?.data?.id ?? null;
      record(
        '5',
        'POST /me row owned by caller (userId matches)',
        create.body?.data?.userId === studentUserId,
        `userId=${create.body?.data?.userId}`
      );
      record(
        '5',
        'POST /me row has isFeatured=true + isPublished=true (student-settable)',
        create.body?.data?.isFeatured === true && create.body?.data?.isPublished === true,
        `featured=${create.body?.data?.isFeatured} published=${create.body?.data?.isPublished}`
      );

      // /me cross-field — ongoing + endDate → 400
      const meOngoing = await http('POST', '/api/v1/user-projects/me', {
        token: studentToken,
        body: {
          projectTitle: 'Smuggle Ongoing',
          isOngoing: true,
          endDate: '2030-01-01'
        }
      });
      record(
        '5',
        'POST /me isOngoing=true + endDate → 400',
        meOngoing.status === 400,
        `got ${meOngoing.status}`
      );

      if (studentSelfUprojId != null) {
        const getSelf = await http(
          'GET',
          `/api/v1/user-projects/${studentSelfUprojId}`,
          { token: studentToken }
        );
        record(
          '5',
          'GET /user-projects/:id (student → own row) → 200',
          getSelf.status === 200,
          `got ${getSelf.status}`
        );
      }

      if (studentSelfUprojId != null) {
        const patch = await http('PATCH', `/api/v1/user-projects/me/${studentSelfUprojId}`, {
          token: studentToken,
          body: { impactSummary: 'Self-patched.', isFeatured: false }
        });
        record(
          '5',
          'PATCH /me/:id (student → own row) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      // Student-B creates own row → student A cannot touch it
      const bCreate = await http<UprojResponse>('POST', '/api/v1/user-projects/me', {
        token: studentBToken,
        body: {
          projectTitle: `Verify Student-B Project ${RUN_ID}`,
          projectType: 'hackathon'
        }
      });
      studentBMeUprojId = bCreate.body?.data?.id ?? null;
      record(
        '5',
        'POST /me (student-b) → 201',
        bCreate.status === 201 && studentBMeUprojId != null,
        `id=${studentBMeUprojId}`
      );

      if (studentBMeUprojId != null) {
        const patchB = await http('PATCH', `/api/v1/user-projects/me/${studentBMeUprojId}`, {
          token: studentToken,
          body: { projectStatus: 'cancelled' }
        });
        record(
          '5',
          "PATCH /me/:id (student A → student B's row) → 403",
          patchB.status === 403,
          `got ${patchB.status}`
        );

        const delB = await http('DELETE', `/api/v1/user-projects/me/${studentBMeUprojId}`, {
          token: studentToken
        });
        record(
          '5',
          "DELETE /me/:id (student A → student B's row) → 403",
          delB.status === 403,
          `got ${delB.status}`
        );
      }

      if (studentSelfUprojId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-projects/me/${studentSelfUprojId}`,
          { token: studentToken }
        );
        record(
          '5',
          'DELETE /me/:id (student → own row) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        const gone = await http(
          'GET',
          `/api/v1/user-projects/${studentSelfUprojId}`,
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
      if (saCreatedUprojId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-projects/${saCreatedUprojId}`,
          { token: saToken }
        );
        record(
          '6',
          'DELETE /user-projects/:id (sa) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        const after = await http(
          'GET',
          `/api/v1/user-projects/${saCreatedUprojId}`,
          { token: saToken }
        );
        record(
          '6',
          'GET /user-projects/:id after sa soft-delete → 404',
          after.status === 404,
          `got ${after.status}`
        );

        const row = await getPool().query<{ is_deleted: boolean; is_active: boolean }>(
          'SELECT is_deleted, is_active FROM user_projects WHERE id = $1',
          [saCreatedUprojId]
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
      if (saCreatedUprojId != null) {
        const studentRestore = await http(
          'POST',
          `/api/v1/user-projects/${saCreatedUprojId}/restore`,
          { token: studentToken }
        );
        record(
          '6.5',
          'POST /:id/restore (student) → 403',
          studentRestore.status === 403,
          `got ${studentRestore.status}`
        );

        const saRestore = await http<{
          data?: { id: number; isDeleted: boolean; isActive: boolean };
        }>(
          'POST',
          `/api/v1/user-projects/${saCreatedUprojId}/restore`,
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

        const afterRestore = await http(
          'GET',
          `/api/v1/user-projects/${saCreatedUprojId}`,
          { token: saToken }
        );
        record(
          '6.5',
          'GET /:id after sa restore → 200 (row visible)',
          afterRestore.status === 200,
          `got ${afterRestore.status}`
        );

        const restoreAgain = await http(
          'POST',
          `/api/v1/user-projects/${saCreatedUprojId}/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore on non-deleted row (sa) → 400',
          restoreAgain.status === 400,
          `got ${restoreAgain.status}`
        );

        const restoreMissing = await http(
          'POST',
          `/api/v1/user-projects/999999999/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore on non-existent id → 404',
          restoreMissing.status === 404,
          `got ${restoreMissing.status}`
        );

        const delAgain = await http(
          'DELETE',
          `/api/v1/user-projects/${saCreatedUprojId}`,
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
          `/api/v1/user-projects/${saCreatedUprojId}/restore`,
          { token: adminToken }
        );
        record(
          '6.5',
          'POST /:id/restore (admin) → 200',
          adminRestore.status === 200 &&
            adminRestore.body?.data?.isDeleted === false,
          `status=${adminRestore.status} isDeleted=${adminRestore.body?.data?.isDeleted}`
        );

        const finalRow = await getPool().query<{
          is_deleted: boolean;
          is_active: boolean;
        }>(
          'SELECT is_deleted, is_active FROM user_projects WHERE id = $1',
          [saCreatedUprojId]
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
      for (const id of [saCreatedUprojId, studentSelfUprojId, studentBMeUprojId]) {
        if (id == null) continue;
        try {
          await hardDeleteUprojById(id);
          record('7', `row hard-deleted`, true, `id=${id}`);
        } catch (err) {
          record('7', `row hard-delete failed`, false, (err as Error).message);
        }
      }
      for (const uid of [saUserId, adminUserId, studentUserId, studentBUserId]) {
        if (uid == null) continue;
        try {
          await hardDeleteUprojByUserId(uid);
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
    console.log('  Phase 4 user_projects verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
