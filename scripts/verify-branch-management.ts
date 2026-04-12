/* eslint-disable no-console */
/**
 * Stage 3 — Phase-03 branch management, live end-to-end verification.
 *
 * Boots the real Express app on an ephemeral port, registers a
 * throw-away super_admin + a throw-away student, logs both in, and
 * exercises every published route on:
 *
 *   /api/v1/branches              (CRUD + soft-delete + restore)
 *   /api/v1/departments           (CRUD + hierarchy guards)
 *   /api/v1/branch-departments    (CRUD + unique guard + parent guards)
 *
 * Nothing is mocked — the script talks to Supabase + Upstash Redis.
 *
 * Sections
 * ────────
 *   0. Setup       — register super-admin + student, elevate, login.
 *   1. Auth        — anonymous calls return 401 on all three routers.
 *   2. Authz       — student (no *.read) hits 403 on all three routers.
 *   3. Branches    — list / get / create / update / filters / sort /
 *                    search / pagination / zod / UDF guards / restore.
 *   4. Departments — parent hierarchy, clearParent, cycle + child guards.
 *   5. BD junction — unique guard, branch-type filter, delete/restore,
 *                    cross-resource "branch with active BD" guard.
 *   6. Cleanup     — hard-delete everything this run produced and soft-
 *                    delete the harness users.
 *
 * Because the script fires ~90 requests in a few seconds, it bypasses
 * the global rate limiter via the SKIP_GLOBAL_RATE_LIMIT env flag (see
 * config/rate-limit.ts). This must be set BEFORE any src/* import or
 * the config module will read the wrong value.
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
const SLUG = RUN_ID.replace(/-/g, '_');

const ADMIN_EMAIL = `verify-brmgmt-admin+${RUN_ID}@test.growupmore.local`;
const ADMIN_PASSWORD = 'VerifyBrMgmt123';
const STUDENT_EMAIL = `verify-brmgmt-student+${RUN_ID}@test.growupmore.local`;
const STUDENT_PASSWORD = 'VerifyBrMgmt123';

// Uppercase for branch codes; DB unique-insensitive on them.
const BRANCH_CODE = `VB_${SLUG}`.slice(0, 30).toUpperCase();
const BRANCH_NAME = `Verify Branch ${RUN_ID}`;
const BRANCH_RENAMED = `Verify Branch ${RUN_ID} (renamed)`;

const DEPT_PARENT_CODE = `VDPAR_${SLUG}`.slice(0, 30).toUpperCase();
const DEPT_PARENT_NAME = `Verify Dept Parent ${RUN_ID}`;
const DEPT_CHILD_CODE = `VDCHD_${SLUG}`.slice(0, 30).toUpperCase();
const DEPT_CHILD_NAME = `Verify Dept Child ${RUN_ID}`;
const DEPT_LEAF_CODE = `VDLEAF_${SLUG}`.slice(0, 30).toUpperCase();
const DEPT_LEAF_NAME = `Verify Dept Leaf ${RUN_ID}`;

// ─── Mutable state ───────────────────────────────────────────

let adminUserId: number | null = null;
let studentUserId: number | null = null;
let adminToken = '';
let studentToken = '';
let adminJti = '';
let studentJti = '';

let branchId: number | null = null;
let deptParentId: number | null = null;
let deptChildId: number | null = null;
let deptLeafId: number | null = null;
let bdId: number | null = null;

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

const verifyChannels = async (userId: number): Promise<void> => {
  await getPool().query('SELECT udf_auth_verify_email($1)', [userId]);
  await getPool().query('SELECT udf_auth_verify_mobile($1)', [userId]);
};

// ─────────────────────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteBD = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM branch_departments WHERE id = $1', [id]);
};
const hardDeleteBranch = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM branch_departments WHERE branch_id = $1', [id]);
  await getPool().query('DELETE FROM branches WHERE id = $1', [id]);
};
const hardDeleteDepartment = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM branch_departments WHERE department_id = $1', [id]);
  await getPool().query('UPDATE departments SET parent_department_id = NULL WHERE parent_department_id = $1', [id]);
  await getPool().query('DELETE FROM departments WHERE id = $1', [id]);
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

const main = async (): Promise<void> => {
  console.log('━━ Stage 3 · Branch management verify (live) ━━');
  console.log(`  admin email  : ${ADMIN_EMAIL}`);
  console.log(`  student email: ${STUDENT_EMAIL}`);
  console.log(`  branch code  : ${BRANCH_CODE}`);
  console.log(`  dept codes   : ${DEPT_PARENT_CODE} / ${DEPT_CHILD_CODE} / ${DEPT_LEAF_CODE}`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  try {
    // ─── 0. Setup ────────────────────────────────────────
    header('0. Setup — register + elevate + login');
    {
      // Admin user
      const reg = await http<{ data?: { userId: number } }>(
        'POST',
        '/api/v1/auth/register',
        {
          body: {
            firstName: 'VerifyBrMgmt',
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
        reg.status === 201 && typeof reg.body?.data?.userId === 'number',
        `status=${reg.status}`
      );
      const uid = reg.body?.data?.userId;
      if (typeof uid !== 'number') throw new Error('admin register failed');
      adminUserId = uid;
      await verifyChannels(uid);
      await elevateToSuperAdmin(uid);
      record('0', 'elevated admin to super_admin (level 0)', true, `uid=${uid}`);

      const login = await http<{
        data?: {
          accessToken: string;
          user: { id: number; permissions: string[] };
        };
      }>('POST', '/api/v1/auth/login', {
        body: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD }
      });
      record(
        '0',
        'admin login returns 200 + accessToken',
        login.status === 200 && typeof login.body?.data?.accessToken === 'string',
        `status=${login.status}`
      );
      adminToken = login.body?.data?.accessToken ?? '';
      const permCount = login.body?.data?.user?.permissions?.length ?? 0;
      record(
        '0',
        'admin JWT carries branch/department/branch_department perms',
        permCount >= 15,
        `permissions=${permCount}`
      );
      adminJti = verifyAccessToken(adminToken).jti ?? '';

      // Student user (no branch-management perms)
      const regS = await http<{ data?: { userId: number } }>(
        'POST',
        '/api/v1/auth/register',
        {
          body: {
            firstName: 'VerifyBrMgmt',
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
        regS.status === 201 && typeof regS.body?.data?.userId === 'number',
        `status=${regS.status}`
      );
      const sid = regS.body?.data?.userId;
      if (typeof sid !== 'number') throw new Error('student register failed');
      studentUserId = sid;
      await verifyChannels(sid);

      const loginS = await http<{ data?: { accessToken: string } }>(
        'POST',
        '/api/v1/auth/login',
        { body: { identifier: STUDENT_EMAIL, password: STUDENT_PASSWORD } }
      );
      record(
        '0',
        'student login returns 200 + accessToken',
        loginS.status === 200 && typeof loginS.body?.data?.accessToken === 'string',
        `status=${loginS.status}`
      );
      studentToken = loginS.body?.data?.accessToken ?? '';
      studentJti = studentToken ? verifyAccessToken(studentToken).jti ?? '' : '';
    }

    if (!adminToken) throw new Error('admin token missing — bailing');

    // ─── 1. Auth — anonymous ─────────────────────────────
    header('1. Auth — anonymous access → 401');
    {
      const a = await http('GET', '/api/v1/branches');
      record('1', 'GET /branches (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('GET', '/api/v1/departments');
      record('1', 'GET /departments (no token) → 401', b.status === 401, `got ${b.status}`);
      const c = await http('GET', '/api/v1/branch-departments');
      record(
        '1',
        'GET /branch-departments (no token) → 401',
        c.status === 401,
        `got ${c.status}`
      );
    }

    // ─── 2. Authz — student lacks *.read ─────────────────
    header('2. Authz — student token → 403');
    {
      if (!studentToken) {
        record('2', 'student token available', false, 'skipped');
      } else {
        const a = await http('GET', '/api/v1/branches', { token: studentToken });
        record('2', 'GET /branches (student) → 403', a.status === 403, `got ${a.status}`);
        const b = await http('GET', '/api/v1/departments', { token: studentToken });
        record('2', 'GET /departments (student) → 403', b.status === 403, `got ${b.status}`);
        const c = await http('GET', '/api/v1/branch-departments', { token: studentToken });
        record(
          '2',
          'GET /branch-departments (student) → 403',
          c.status === 403,
          `got ${c.status}`
        );
        const d = await http('POST', '/api/v1/branches', {
          token: studentToken,
          body: {
            countryId: 1,
            stateId: 1,
            cityId: 1,
            name: 'student-should-not-create',
            code: 'STUDENT_DENY'
          }
        });
        record(
          '2',
          'POST /branches (student) → 403',
          d.status === 403,
          `got ${d.status}`
        );
      }
    }

    // ─── 3. Branches ─────────────────────────────────────
    header('3. Branches — CRUD + filters + guards');
    {
      // 3.a list + meta
      const list = await http<{
        data: unknown[];
        meta: { totalCount: number; page: number; limit: number; totalPages: number };
      }>('GET', '/api/v1/branches?pageSize=5', { token: adminToken });
      record(
        '3',
        'GET /branches?pageSize=5 → 200',
        list.status === 200,
        `status=${list.status}`
      );
      record(
        '3',
        'list response has data[] + meta shape',
        Array.isArray(list.body?.data) &&
          typeof list.body?.meta?.totalCount === 'number' &&
          list.body?.meta?.limit === 5,
        `meta.totalCount=${list.body?.meta?.totalCount} limit=${list.body?.meta?.limit}`
      );

      // 3.b zod rejects
      const bz1 = await http('POST', '/api/v1/branches', {
        token: adminToken,
        body: { stateId: 1, cityId: 1, name: 'missing countryId' }
      });
      record('3', 'POST missing countryId → 400', bz1.status === 400, `got ${bz1.status}`);
      const bz2 = await http('POST', '/api/v1/branches', {
        token: adminToken,
        body: {
          countryId: 1,
          stateId: 1,
          cityId: 1,
          name: BRANCH_NAME,
          branchType: 'rocket-ship'
        }
      });
      record('3', 'POST invalid branchType → 400', bz2.status === 400, `got ${bz2.status}`);
      const bz3 = await http('POST', '/api/v1/branches', {
        token: adminToken,
        body: {
          countryId: 1,
          stateId: 1,
          cityId: 1,
          name: BRANCH_NAME,
          email: 'not-an-email'
        }
      });
      record('3', 'POST invalid email → 400', bz3.status === 400, `got ${bz3.status}`);
      const bz4 = await http('POST', '/api/v1/branches', {
        token: adminToken,
        body: {
          countryId: 1,
          stateId: 1,
          cityId: 1,
          name: BRANCH_NAME,
          website: 'not a url'
        }
      });
      record('3', 'POST invalid website URL → 400', bz4.status === 400, `got ${bz4.status}`);
      const bz5 = await http('POST', '/api/v1/branches', {
        token: adminToken,
        // empty-string name → trimmed → fails nameSchema.min(1)
        body: { countryId: 1, stateId: 1, cityId: 1, name: '   ' }
      });
      record(
        '3',
        'POST name empty → 400 (zod name constraint)',
        bz5.status === 400,
        `got ${bz5.status}`
      );

      // 3.c happy-path create
      const cr = await http<{
        data: {
          id: number;
          name: string;
          code: string | null;
          branchType: string;
          city: { name: string };
          state: { name: string };
          country: { name: string; iso3: string };
        };
      }>('POST', '/api/v1/branches', {
        token: adminToken,
        body: {
          countryId: 1,
          stateId: 1,
          cityId: 1,
          name: BRANCH_NAME,
          code: BRANCH_CODE,
          branchType: 'office',
          phone: '+91-22-1234-5678',
          email: `ops+${SLUG}@test.local`,
          website: 'https://example.test',
          timezone: 'Asia/Kolkata',
          isActive: true
        }
      });
      record(
        '3',
        'POST /branches (valid) → 201',
        cr.status === 201 && typeof cr.body?.data?.id === 'number',
        `status=${cr.status} id=${cr.body?.data?.id}`
      );
      branchId = cr.body?.data?.id ?? null;
      record(
        '3',
        'created DTO carries joined city/state/country',
        typeof cr.body?.data?.city?.name === 'string' &&
          typeof cr.body?.data?.state?.name === 'string' &&
          typeof cr.body?.data?.country?.iso3 === 'string',
        `city=${cr.body?.data?.city?.name} iso3=${cr.body?.data?.country?.iso3}`
      );
      record(
        '3',
        'created code is upper-cased by zod transform',
        cr.body?.data?.code === BRANCH_CODE,
        `code=${cr.body?.data?.code}`
      );
      record(
        '3',
        'created branchType defaults / honors value',
        cr.body?.data?.branchType === 'office',
        `branchType=${cr.body?.data?.branchType}`
      );

      // 3.d duplicate-code conflict
      if (branchId) {
        const dup = await http<{ code: string }>('POST', '/api/v1/branches', {
          token: adminToken,
          body: {
            countryId: 1,
            stateId: 1,
            cityId: 1,
            name: `${BRANCH_NAME} dup`,
            code: BRANCH_CODE
          }
        });
        record(
          '3',
          'POST duplicate code → 4xx',
          dup.status >= 400 && dup.status < 500,
          `got ${dup.status} code=${dup.body?.code}`
        );
      }

      // 3.e non-existent FK
      const badFk = await http('POST', '/api/v1/branches', {
        token: adminToken,
        body: {
          countryId: 999999,
          stateId: 1,
          cityId: 1,
          name: `${BRANCH_NAME} badfk`
        }
      });
      record(
        '3',
        'POST non-existent countryId → 4xx (UDF guard)',
        badFk.status >= 400 && badFk.status < 500,
        `got ${badFk.status}`
      );

      // 3.f GET /:id
      if (branchId) {
        const get = await http<{
          data: { id: number; name: string; city: { id: number } };
        }>('GET', `/api/v1/branches/${branchId}`, { token: adminToken });
        record(
          '3',
          'GET /branches/:id → 200',
          get.status === 200 && get.body?.data?.id === branchId,
          `status=${get.status}`
        );
        record(
          '3',
          'GET /:id payload name matches',
          get.body?.data?.name === BRANCH_NAME,
          `name=${get.body?.data?.name}`
        );
      }
      const ghost = await http('GET', '/api/v1/branches/999999999', {
        token: adminToken
      });
      record(
        '3',
        'GET /branches/:unknown → 404',
        ghost.status === 404,
        `got ${ghost.status}`
      );

      // 3.g PATCH
      if (branchId) {
        const emptyPatch = await http('PATCH', `/api/v1/branches/${branchId}`, {
          token: adminToken,
          body: {}
        });
        record(
          '3',
          'PATCH with empty body → 400 (at-least-one-field)',
          emptyPatch.status === 400,
          `got ${emptyPatch.status}`
        );

        const rename = await http<{ data: { name: string } }>(
          'PATCH',
          `/api/v1/branches/${branchId}`,
          { token: adminToken, body: { name: BRANCH_RENAMED } }
        );
        record(
          '3',
          'PATCH /:id rename → 200',
          rename.status === 200,
          `got ${rename.status}`
        );
        record(
          '3',
          'PATCH echoes new name',
          rename.body?.data?.name === BRANCH_RENAMED,
          `name=${rename.body?.data?.name}`
        );

        const typeSwitch = await http<{ data: { branchType: string } }>(
          'PATCH',
          `/api/v1/branches/${branchId}`,
          { token: adminToken, body: { branchType: 'campus' } }
        );
        record(
          '3',
          'PATCH /:id branchType → 200',
          typeSwitch.status === 200 && typeSwitch.body?.data?.branchType === 'campus',
          `branchType=${typeSwitch.body?.data?.branchType}`
        );

        const badType = await http('PATCH', `/api/v1/branches/${branchId}`, {
          token: adminToken,
          body: { branchType: 'moonbase' }
        });
        record(
          '3',
          'PATCH invalid branchType → 400',
          badType.status === 400,
          `got ${badType.status}`
        );
      }

      // 3.h filters
      const byCountry = await http<{
        data: Array<{ country: { id: number } }>;
      }>('GET', '/api/v1/branches?countryId=1&pageSize=20', { token: adminToken });
      record(
        '3',
        'filter by countryId returns only that country',
        byCountry.status === 200 &&
          (byCountry.body?.data ?? []).every((r) => r.country.id === 1) &&
          (byCountry.body?.data ?? []).length >= 1,
        `n=${byCountry.body?.data?.length ?? 0}`
      );

      const byType = await http<{ data: Array<{ branchType: string }> }>(
        'GET',
        '/api/v1/branches?branchType=campus&pageSize=20',
        { token: adminToken }
      );
      record(
        '3',
        'filter by branchType=campus returns only campus rows',
        byType.status === 200 &&
          (byType.body?.data ?? []).every((r) => r.branchType === 'campus'),
        `n=${byType.body?.data?.length ?? 0}`
      );

      const bySearch = await http<{ data: Array<{ name: string }> }>(
        'GET',
        `/api/v1/branches?searchTerm=${encodeURIComponent(BRANCH_RENAMED)}&pageSize=5`,
        { token: adminToken }
      );
      record(
        '3',
        'search by unique renamed name returns our branch',
        bySearch.status === 200 &&
          (bySearch.body?.data ?? []).some((r) => r.name === BRANCH_RENAMED),
        `n=${bySearch.body?.data?.length ?? 0}`
      );

      // 3.i sort
      const sortCountry = await http('GET', '/api/v1/branches?sortTable=country&sortColumn=iso3&sortDirection=DESC&pageSize=5', {
        token: adminToken
      });
      record(
        '3',
        'sort by country.iso3 DESC → 200',
        sortCountry.status === 200,
        `got ${sortCountry.status}`
      );
      const sortBadCol = await http('GET', '/api/v1/branches?sortColumn=drop_table', {
        token: adminToken
      });
      record(
        '3',
        'sort by unknown column → 400 (schema whitelist)',
        sortBadCol.status === 400,
        `got ${sortBadCol.status}`
      );
      const sortBadTable = await http('GET', '/api/v1/branches?sortTable=planet', {
        token: adminToken
      });
      record(
        '3',
        'sort by unknown table → 400 (schema whitelist)',
        sortBadTable.status === 400,
        `got ${sortBadTable.status}`
      );

      // 3.j pagination metadata
      const pg = await http<{
        data: unknown[];
        meta: { page: number; limit: number; totalCount: number; totalPages: number };
      }>('GET', '/api/v1/branches?pageIndex=1&pageSize=2', { token: adminToken });
      record(
        '3',
        'pagination meta carries page/limit/totalPages',
        pg.status === 200 &&
          pg.body?.meta?.page === 1 &&
          pg.body?.meta?.limit === 2 &&
          typeof pg.body?.meta?.totalPages === 'number',
        `meta=${JSON.stringify(pg.body?.meta)}`
      );
    }

    // ─── 4. Departments ──────────────────────────────────
    header('4. Departments — CRUD + hierarchy guards');
    {
      const list = await http<{
        data: unknown[];
        meta: { totalCount: number };
      }>('GET', '/api/v1/departments?pageSize=5', { token: adminToken });
      record('4', 'GET /departments → 200', list.status === 200, `got ${list.status}`);
      record(
        '4',
        'list returns data[] + meta',
        Array.isArray(list.body?.data) && typeof list.body?.meta?.totalCount === 'number',
        `n=${list.body?.data?.length ?? 0}`
      );

      // 4.a zod
      const zMissing = await http('POST', '/api/v1/departments', {
        token: adminToken,
        body: { code: 'WHATEVER' }
      });
      record(
        '4',
        'POST missing name → 400',
        zMissing.status === 400,
        `got ${zMissing.status}`
      );
      const zBadCode = await http('POST', '/api/v1/departments', {
        token: adminToken,
        body: { name: 'Bad Code', code: '!!bad//' }
      });
      record('4', 'POST invalid code → 400', zBadCode.status === 400, `got ${zBadCode.status}`);

      // 4.b happy-path top-level parent
      const crParent = await http<{ data: { id: number; code: string | null; parentDepartmentId: number | null } }>(
        'POST',
        '/api/v1/departments',
        {
          token: adminToken,
          body: {
            name: DEPT_PARENT_NAME,
            code: DEPT_PARENT_CODE,
            description: 'Parent dept for verify-branch-management.ts',
            isActive: true
          }
        }
      );
      record(
        '4',
        'POST parent dept → 201',
        crParent.status === 201 && typeof crParent.body?.data?.id === 'number',
        `status=${crParent.status} id=${crParent.body?.data?.id}`
      );
      deptParentId = crParent.body?.data?.id ?? null;
      record(
        '4',
        'parent dept top-level (parentDepartmentId null)',
        crParent.body?.data?.parentDepartmentId === null,
        `parentId=${crParent.body?.data?.parentDepartmentId}`
      );

      // 4.c duplicate-code conflict
      if (deptParentId) {
        const dup = await http('POST', '/api/v1/departments', {
          token: adminToken,
          body: { name: `${DEPT_PARENT_NAME} dup`, code: DEPT_PARENT_CODE }
        });
        record(
          '4',
          'POST duplicate dept code → 4xx',
          dup.status >= 400 && dup.status < 500,
          `got ${dup.status}`
        );
      }

      // 4.d child dept with parentDepartmentId set
      if (deptParentId) {
        const crChild = await http<{
          data: { id: number; parentDepartmentId: number | null; parent: { code: string | null } | null };
        }>('POST', '/api/v1/departments', {
          token: adminToken,
          body: {
            name: DEPT_CHILD_NAME,
            code: DEPT_CHILD_CODE,
            parentDepartmentId: deptParentId,
            isActive: true
          }
        });
        record(
          '4',
          'POST child dept with parent → 201',
          crChild.status === 201 && typeof crChild.body?.data?.id === 'number',
          `status=${crChild.status}`
        );
        deptChildId = crChild.body?.data?.id ?? null;
        record(
          '4',
          'child has correct parentDepartmentId',
          crChild.body?.data?.parentDepartmentId === deptParentId,
          `parent=${crChild.body?.data?.parentDepartmentId}`
        );
        record(
          '4',
          'child.parent.code equals parent code',
          crChild.body?.data?.parent?.code === DEPT_PARENT_CODE,
          `parent.code=${crChild.body?.data?.parent?.code}`
        );
      }

      // 4.e leaf dept (top-level) for the BD junction fixture
      {
        const crLeaf = await http<{ data: { id: number } }>(
          'POST',
          '/api/v1/departments',
          {
            token: adminToken,
            body: {
              name: DEPT_LEAF_NAME,
              code: DEPT_LEAF_CODE,
              isActive: true
            }
          }
        );
        record(
          '4',
          'POST leaf dept (for BD fixture) → 201',
          crLeaf.status === 201 && typeof crLeaf.body?.data?.id === 'number',
          `status=${crLeaf.status}`
        );
        deptLeafId = crLeaf.body?.data?.id ?? null;
      }

      // 4.f empty PATCH
      if (deptLeafId) {
        const empty = await http('PATCH', `/api/v1/departments/${deptLeafId}`, {
          token: adminToken,
          body: {}
        });
        record(
          '4',
          'PATCH empty body → 400',
          empty.status === 400,
          `got ${empty.status}`
        );
      }

      // 4.g rename + description PATCH
      if (deptLeafId) {
        const patch = await http<{ data: { name: string; description: string | null } }>(
          'PATCH',
          `/api/v1/departments/${deptLeafId}`,
          {
            token: adminToken,
            body: {
              description: `Updated at run ${RUN_ID}`
            }
          }
        );
        record(
          '4',
          'PATCH description → 200',
          patch.status === 200 &&
            patch.body?.data?.description?.includes(RUN_ID) === true,
          `got ${patch.status}`
        );
      }

      // 4.h cycle guard via UPDATE: make parent's parent = child — should fail.
      if (deptParentId && deptChildId) {
        const cycle = await http('PATCH', `/api/v1/departments/${deptParentId}`, {
          token: adminToken,
          body: { parentDepartmentId: deptChildId }
        });
        record(
          '4',
          'PATCH parent→child (cycle) → 4xx (UDF cycle guard)',
          cycle.status >= 400 && cycle.status < 500,
          `got ${cycle.status}`
        );
      }

      // 4.i clearParent=true on the child
      if (deptChildId) {
        const clr = await http<{ data: { parentDepartmentId: number | null } }>(
          'PATCH',
          `/api/v1/departments/${deptChildId}`,
          { token: adminToken, body: { clearParent: true } }
        );
        record(
          '4',
          'PATCH clearParent=true → 200 + parent=null',
          clr.status === 200 && clr.body?.data?.parentDepartmentId === null,
          `parent=${clr.body?.data?.parentDepartmentId}`
        );
      }

      // 4.j filters
      if (deptParentId) {
        // Re-attach child for the parent-filter test (clearParent was the previous step).
        const reattach = await http(
          'PATCH',
          `/api/v1/departments/${deptChildId}`,
          {
            token: adminToken,
            body: { parentDepartmentId: deptParentId }
          }
        );
        record(
          '4',
          'PATCH re-attach child to parent → 200',
          reattach.status === 200,
          `got ${reattach.status}`
        );

        const byParent = await http<{
          data: Array<{ parentDepartmentId: number | null }>;
        }>(
          'GET',
          `/api/v1/departments?parentDepartmentId=${deptParentId}&pageSize=20`,
          { token: adminToken }
        );
        record(
          '4',
          'filter by parentDepartmentId returns only children of that parent',
          byParent.status === 200 &&
            (byParent.body?.data ?? []).every(
              (r) => r.parentDepartmentId === deptParentId
            ) &&
            (byParent.body?.data ?? []).some((r) => r.parentDepartmentId === deptParentId),
          `n=${byParent.body?.data?.length ?? 0}`
        );
      }

      const topLevel = await http<{
        data: Array<{ parentDepartmentId: number | null }>;
      }>('GET', '/api/v1/departments?topLevelOnly=true&pageSize=50', {
        token: adminToken
      });
      record(
        '4',
        'filter topLevelOnly=true returns only rows with parentDepartmentId=null',
        topLevel.status === 200 &&
          (topLevel.body?.data ?? []).every((r) => r.parentDepartmentId === null),
        `n=${topLevel.body?.data?.length ?? 0}`
      );

      const byCode = await http<{
        data: Array<{ code: string | null }>;
      }>('GET', `/api/v1/departments?code=${DEPT_PARENT_CODE}&pageSize=5`, {
        token: adminToken
      });
      record(
        '4',
        'filter by exact code returns the parent',
        byCode.status === 200 &&
          (byCode.body?.data ?? []).some((r) => r.code === DEPT_PARENT_CODE),
        `n=${byCode.body?.data?.length ?? 0}`
      );

      const search = await http<{
        data: Array<{ name: string }>;
      }>(
        'GET',
        `/api/v1/departments?searchTerm=${encodeURIComponent(DEPT_LEAF_NAME)}`,
        { token: adminToken }
      );
      record(
        '4',
        'search by leaf dept name returns our leaf',
        search.status === 200 &&
          (search.body?.data ?? []).some((r) => r.name === DEPT_LEAF_NAME),
        `n=${search.body?.data?.length ?? 0}`
      );

      // 4.k sort
      const sortName = await http('GET', '/api/v1/departments?sortColumn=name&sortDirection=DESC', {
        token: adminToken
      });
      record(
        '4',
        'sort by name DESC → 200',
        sortName.status === 200,
        `got ${sortName.status}`
      );
      const sortBad = await http('GET', '/api/v1/departments?sortColumn=password', {
        token: adminToken
      });
      record(
        '4',
        'sort by unknown column → 400 (schema whitelist)',
        sortBad.status === 400,
        `got ${sortBad.status}`
      );

      // 4.l DELETE guarded by active child
      if (deptParentId) {
        const blocked = await http('DELETE', `/api/v1/departments/${deptParentId}`, {
          token: adminToken
        });
        record(
          '4',
          'DELETE parent with active child → 4xx (UDF guard)',
          blocked.status >= 400 && blocked.status < 500,
          `got ${blocked.status}`
        );
      }

      // 4.m Delete leaf dept end-to-end (soft-delete → restore)
      if (deptLeafId) {
        const del = await http('DELETE', `/api/v1/departments/${deptLeafId}`, {
          token: adminToken
        });
        record('4', 'DELETE /departments/:id → 200', del.status === 200, `got ${del.status}`);

        const rest = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/departments/${deptLeafId}/restore`,
          { token: adminToken }
        );
        record(
          '4',
          'POST /departments/:id/restore → 200',
          rest.status === 200,
          `got ${rest.status}`
        );
        record(
          '4',
          'restored dept has isDeleted=false',
          rest.body?.data?.isDeleted === false,
          `isDeleted=${rest.body?.data?.isDeleted}`
        );
      }

      const notFound = await http('GET', '/api/v1/departments/999999999', {
        token: adminToken
      });
      record(
        '4',
        'GET /departments/:unknown → 404',
        notFound.status === 404,
        `got ${notFound.status}`
      );
    }

    // ─── 5. Branch-Departments ───────────────────────────
    header('5. Branch-Departments — junction CRUD + guards');
    {
      const list = await http<{ data: unknown[]; meta: { totalCount: number } }>(
        'GET',
        '/api/v1/branch-departments?pageSize=5',
        { token: adminToken }
      );
      record(
        '5',
        'GET /branch-departments → 200',
        list.status === 200 && Array.isArray(list.body?.data),
        `status=${list.status}`
      );

      // 5.a zod
      const zMissing = await http('POST', '/api/v1/branch-departments', {
        token: adminToken,
        body: { departmentId: deptLeafId }
      });
      record(
        '5',
        'POST missing branchId → 400',
        zMissing.status === 400,
        `got ${zMissing.status}`
      );
      const zNegCap = await http('POST', '/api/v1/branch-departments', {
        token: adminToken,
        body: {
          branchId,
          departmentId: deptLeafId,
          employeeCapacity: -5
        }
      });
      record(
        '5',
        'POST negative capacity → 400',
        zNegCap.status === 400,
        `got ${zNegCap.status}`
      );
      const zBadExt = await http('POST', '/api/v1/branch-departments', {
        token: adminToken,
        body: {
          branchId,
          departmentId: deptLeafId,
          extensionNumber: 'abc!!!'
        }
      });
      record(
        '5',
        'POST invalid extensionNumber → 400',
        zBadExt.status === 400,
        `got ${zBadExt.status}`
      );

      // 5.b non-existent FKs
      if (deptLeafId) {
        const badBr = await http('POST', '/api/v1/branch-departments', {
          token: adminToken,
          body: { branchId: 999999, departmentId: deptLeafId }
        });
        record(
          '5',
          'POST non-existent branchId → 4xx (UDF guard)',
          badBr.status >= 400 && badBr.status < 500,
          `got ${badBr.status}`
        );
      }
      if (branchId) {
        const badDp = await http('POST', '/api/v1/branch-departments', {
          token: adminToken,
          body: { branchId, departmentId: 999999 }
        });
        record(
          '5',
          'POST non-existent departmentId → 4xx (UDF guard)',
          badDp.status >= 400 && badDp.status < 500,
          `got ${badDp.status}`
        );
      }

      // 5.c happy path
      if (branchId && deptLeafId) {
        const cr = await http<{
          data: {
            id: number;
            branchId: number;
            departmentId: number;
            branch: { name: string; code: string | null };
            department: { name: string; code: string | null };
            location: { cityName: string | null; countryName: string | null };
            floorOrWing: string | null;
            extensionNumber: string | null;
          };
        }>('POST', '/api/v1/branch-departments', {
          token: adminToken,
          body: {
            branchId,
            departmentId: deptLeafId,
            floorOrWing: 'Verify Floor 3',
            extensionNumber: '303',
            employeeCapacity: 40,
            isActive: true
          }
        });
        record(
          '5',
          'POST /branch-departments (valid) → 201',
          cr.status === 201 && typeof cr.body?.data?.id === 'number',
          `status=${cr.status} id=${cr.body?.data?.id}`
        );
        bdId = cr.body?.data?.id ?? null;
        record(
          '5',
          'created DTO nests branch + department + location',
          typeof cr.body?.data?.branch?.name === 'string' &&
            typeof cr.body?.data?.department?.name === 'string' &&
            'cityName' in (cr.body?.data?.location ?? {}),
          `branch=${cr.body?.data?.branch?.name} dept=${cr.body?.data?.department?.name}`
        );
        record(
          '5',
          'created DTO carries floorOrWing + extensionNumber',
          cr.body?.data?.floorOrWing === 'Verify Floor 3' &&
            cr.body?.data?.extensionNumber === '303',
          `floor=${cr.body?.data?.floorOrWing} ext=${cr.body?.data?.extensionNumber}`
        );
      }

      // 5.d duplicate (branchId, departmentId)
      if (branchId && deptLeafId) {
        const dup = await http('POST', '/api/v1/branch-departments', {
          token: adminToken,
          body: { branchId, departmentId: deptLeafId }
        });
        record(
          '5',
          'POST duplicate (branchId, departmentId) → 4xx',
          dup.status >= 400 && dup.status < 500,
          `got ${dup.status}`
        );
      }

      // 5.e GET /:id + GET unknown
      if (bdId) {
        const get = await http<{ data: { id: number; branchId: number } }>(
          'GET',
          `/api/v1/branch-departments/${bdId}`,
          { token: adminToken }
        );
        record(
          '5',
          'GET /branch-departments/:id → 200',
          get.status === 200 && get.body?.data?.id === bdId,
          `got ${get.status}`
        );
        record(
          '5',
          'GET /:id payload.branchId matches',
          get.body?.data?.branchId === branchId,
          `branchId=${get.body?.data?.branchId}`
        );
      }
      const ghost = await http('GET', '/api/v1/branch-departments/999999999', {
        token: adminToken
      });
      record(
        '5',
        'GET /branch-departments/:unknown → 404',
        ghost.status === 404,
        `got ${ghost.status}`
      );

      // 5.f PATCH
      if (bdId) {
        const empty = await http('PATCH', `/api/v1/branch-departments/${bdId}`, {
          token: adminToken,
          body: {}
        });
        record(
          '5',
          'PATCH empty body → 400',
          empty.status === 400,
          `got ${empty.status}`
        );

        const patchFloor = await http<{ data: { floorOrWing: string | null } }>(
          'PATCH',
          `/api/v1/branch-departments/${bdId}`,
          { token: adminToken, body: { floorOrWing: 'Verify Floor 7' } }
        );
        record(
          '5',
          'PATCH floorOrWing → 200',
          patchFloor.status === 200 &&
            patchFloor.body?.data?.floorOrWing === 'Verify Floor 7',
          `floor=${patchFloor.body?.data?.floorOrWing}`
        );

        const clearHead = await http<{ data: { localHeadUserId: number | null } }>(
          'PATCH',
          `/api/v1/branch-departments/${bdId}`,
          { token: adminToken, body: { clearLocalHead: true } }
        );
        record(
          '5',
          'PATCH clearLocalHead=true → 200',
          clearHead.status === 200 &&
            clearHead.body?.data?.localHeadUserId === null,
          `localHead=${clearHead.body?.data?.localHeadUserId}`
        );

        const rejectSwap = await http('PATCH', `/api/v1/branch-departments/${bdId}`, {
          token: adminToken,
          body: { branchId: 999 } // not in the update schema — zod will strip and refine() will complain
        });
        record(
          '5',
          'PATCH with unknown field (branchId) → 400 after strip',
          rejectSwap.status === 400,
          `got ${rejectSwap.status}`
        );
      }

      // 5.g filters
      if (branchId) {
        const byBranch = await http<{
          data: Array<{ branchId: number }>;
        }>(
          'GET',
          `/api/v1/branch-departments?branchId=${branchId}&pageSize=20`,
          { token: adminToken }
        );
        record(
          '5',
          'filter by branchId returns only that branch',
          byBranch.status === 200 &&
            (byBranch.body?.data ?? []).every((r) => r.branchId === branchId) &&
            (byBranch.body?.data ?? []).length >= 1,
          `n=${byBranch.body?.data?.length ?? 0}`
        );
      }
      if (deptLeafId) {
        const byDept = await http<{
          data: Array<{ departmentId: number }>;
        }>(
          'GET',
          `/api/v1/branch-departments?departmentId=${deptLeafId}&pageSize=20`,
          { token: adminToken }
        );
        record(
          '5',
          'filter by departmentId returns only that department',
          byDept.status === 200 &&
            (byDept.body?.data ?? []).every((r) => r.departmentId === deptLeafId),
          `n=${byDept.body?.data?.length ?? 0}`
        );
      }

      const byType = await http<{
        data: Array<{ branch: { branchType: string } }>;
      }>(
        'GET',
        '/api/v1/branch-departments?branchType=campus&pageSize=20',
        { token: adminToken }
      );
      record(
        '5',
        'filter by branchType=campus returns only campus branches',
        byType.status === 200 &&
          (byType.body?.data ?? []).every((r) => r.branch.branchType === 'campus'),
        `n=${byType.body?.data?.length ?? 0}`
      );

      // 5.h sort (whitelist)
      const sortOk = await http(
        'GET',
        '/api/v1/branch-departments?sortTable=branch&sortColumn=name&sortDirection=ASC',
        { token: adminToken }
      );
      record(
        '5',
        'sort by sortTable=branch sortColumn=name ASC → 200',
        sortOk.status === 200,
        `got ${sortOk.status}`
      );
      const sortInjection = await http(
        'GET',
        "/api/v1/branch-departments?sortColumn=1;%20DROP%20TABLE%20users;--",
        { token: adminToken }
      );
      record(
        '5',
        'sort column injection attempt → 400 (schema whitelist)',
        sortInjection.status === 400,
        `got ${sortInjection.status}`
      );
      const sortBadTable = await http(
        'GET',
        '/api/v1/branch-departments?sortTable=moon',
        { token: adminToken }
      );
      record(
        '5',
        'sort table=moon → 400 (schema whitelist)',
        sortBadTable.status === 400,
        `got ${sortBadTable.status}`
      );

      // 5.i pagination
      const pg = await http<{
        meta: { page: number; limit: number };
      }>(
        'GET',
        '/api/v1/branch-departments?pageIndex=1&pageSize=3',
        { token: adminToken }
      );
      record(
        '5',
        'pagination pageSize=3 respected',
        pg.status === 200 &&
          pg.body?.meta?.page === 1 &&
          pg.body?.meta?.limit === 3,
        `meta=${JSON.stringify(pg.body?.meta)}`
      );

      // 5.j cross-resource guard: branch with active BD can't be deleted
      if (branchId) {
        const blocked = await http('DELETE', `/api/v1/branches/${branchId}`, {
          token: adminToken
        });
        record(
          '5',
          'DELETE branch with active BD → 4xx (cross-resource guard)',
          blocked.status >= 400 && blocked.status < 500,
          `got ${blocked.status}`
        );
      }

      // 5.k DELETE + RESTORE BD
      if (bdId) {
        const del = await http('DELETE', `/api/v1/branch-departments/${bdId}`, {
          token: adminToken
        });
        record(
          '5',
          'DELETE /branch-departments/:id → 200',
          del.status === 200,
          `got ${del.status}`
        );

        const rest = await http<{ data: { isDeleted: boolean; id: number } }>(
          'POST',
          `/api/v1/branch-departments/${bdId}/restore`,
          { token: adminToken }
        );
        record(
          '5',
          'POST /branch-departments/:id/restore → 200',
          rest.status === 200 && rest.body?.data?.isDeleted === false,
          `isDeleted=${rest.body?.data?.isDeleted}`
        );
      }
    }

    // ─── 5z. Branches restore path (needs BD soft-deleted first) ───
    header('5z. Branches — soft-delete + restore (after BD cleanup)');
    {
      if (bdId) {
        // Soft-delete BD so the branch delete is allowed.
        const delBd = await http('DELETE', `/api/v1/branch-departments/${bdId}`, {
          token: adminToken
        });
        record(
          '5z',
          'pre-delete: soft-delete BD junction → 200',
          delBd.status === 200,
          `got ${delBd.status}`
        );
      }

      if (branchId) {
        const del = await http('DELETE', `/api/v1/branches/${branchId}`, {
          token: adminToken
        });
        record(
          '5z',
          'DELETE /branches/:id (no active children) → 200',
          del.status === 200,
          `got ${del.status}`
        );

        const rest = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/branches/${branchId}/restore`,
          { token: adminToken }
        );
        record(
          '5z',
          'POST /branches/:id/restore → 200',
          rest.status === 200 && rest.body?.data?.isDeleted === false,
          `isDeleted=${rest.body?.data?.isDeleted}`
        );
      }
    }
  } finally {
    // ─── 6. Cleanup ──────────────────────────────────────
    header('6. Cleanup');
    {
      if (bdId != null) {
        try {
          await hardDeleteBD(bdId);
          record('6', 'bd fixture hard-deleted', true, `id=${bdId}`);
        } catch (err) {
          record('6', 'bd fixture hard-deleted', false, (err as Error).message);
        }
      }
      if (branchId != null) {
        try {
          await hardDeleteBranch(branchId);
          record('6', 'branch fixture hard-deleted', true, `id=${branchId}`);
        } catch (err) {
          record('6', 'branch fixture hard-deleted', false, (err as Error).message);
        }
      }
      if (deptChildId != null) {
        try {
          await hardDeleteDepartment(deptChildId);
          record('6', 'dept child hard-deleted', true, `id=${deptChildId}`);
        } catch (err) {
          record('6', 'dept child hard-deleted', false, (err as Error).message);
        }
      }
      if (deptLeafId != null) {
        try {
          await hardDeleteDepartment(deptLeafId);
          record('6', 'dept leaf hard-deleted', true, `id=${deptLeafId}`);
        } catch (err) {
          record('6', 'dept leaf hard-deleted', false, (err as Error).message);
        }
      }
      if (deptParentId != null) {
        try {
          await hardDeleteDepartment(deptParentId);
          record('6', 'dept parent hard-deleted', true, `id=${deptParentId}`);
        } catch (err) {
          record('6', 'dept parent hard-deleted', false, (err as Error).message);
        }
      }
      if (adminUserId != null) {
        try {
          await softDeleteUser(adminUserId);
          record('6', 'admin user soft-deleted', true, `id=${adminUserId}`);
        } catch (err) {
          record('6', 'admin user soft-deleted', false, (err as Error).message);
        }
      }
      if (studentUserId != null) {
        try {
          await softDeleteUser(studentUserId);
          record('6', 'student user soft-deleted', true, `id=${studentUserId}`);
        } catch (err) {
          record('6', 'student user soft-deleted', false, (err as Error).message);
        }
      }
      for (const jti of [adminJti, studentJti].filter(Boolean)) {
        try {
          await redisRevoked.remove(jti);
        } catch {
          /* no-op */
        }
      }
      record('6', 'redis revoked entries removed (no-op if absent)', true, '');
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
    console.log('  Stage 3 verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
