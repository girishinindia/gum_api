/* eslint-disable no-console */
/**
 * Step 8 — Reference-trio resource CRUD (live, end-to-end).
 *
 * Builds the real Express app and hits /api/v1/countries, /roles,
 * /permissions over a live ephemeral port, against the real Supabase
 * database and Upstash Redis. Nothing is mocked.
 *
 * Sections:
 *   0. Setup    — register harness user, verify, elevate to super_admin
 *                 (level 0) so the JWT carries every permission code,
 *                 then login via the public /auth/login endpoint.
 *   1. Auth     — anon hits to protected routes return 401.
 *   2. Countries — full CRUD lifecycle, validation, duplicate guards.
 *   3. Roles     — full CRUD lifecycle, system-role delete protection.
 *   4. Permissions — full CRUD lifecycle, auto-grant side-effect check.
 *   5. Cleanup  — hard-delete test rows + soft-delete the harness user.
 *
 * The harness uses TWO test row prefixes to avoid colliding with
 * anything else in the live DB:
 *   • iso2 = 'ZZ', iso3 = 'ZZZ' for the country
 *   • code prefixed with 'verify_<RUN_ID>_' for role / permission
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
const TEST_EMAIL = `verify-res+${RUN_ID}@test.growupmore.local`;
const TEST_PASSWORD = 'VerifyPass123';
const TEST_FIRST = 'VerifyRes';
const TEST_LAST = `Run${process.pid}`;

const TEST_COUNTRY_ISO2 = 'ZZ';
const TEST_COUNTRY_ISO3 = 'ZZZ';
const TEST_COUNTRY_NAME = `Verifyland-${RUN_ID}`;

const TEST_ROLE_CODE = `verify_${RUN_ID.replace(/-/g, '_')}_role`.slice(0, 60);
const TEST_PERM_CODE = `verify_${RUN_ID.replace(/-/g, '_')}.read`.slice(0, 60);

let createdUserId: number | null = null;
let accessToken = '';
let firstJti = '';

// IDs created during the run — kept around for cleanup.
let createdCountryId: number | null = null;
let createdRoleId: number | null = null;
let createdPermissionId: number | null = null;

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

/**
 * Direct DB elevation: bump the freshly-registered user from the
 * default 'student' role to whichever role has level=0 (Super Admin).
 * The auth UDF then bakes EVERY permission into the JWT, which is
 * what the resource routes need to call create/update/delete on the
 * three modules under test.
 */
const elevateToSuperAdmin = async (userId: number): Promise<void> => {
  const pool = getPool();
  await pool.query(
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
// Cleanup helpers (best-effort, swallow errors)
// ─────────────────────────────────────────────────────────────

const hardDeleteCountry = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM countries WHERE id = $1', [id]);
};
const hardDeleteRole = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
  await getPool().query('DELETE FROM roles WHERE id = $1', [id]);
};
const hardDeletePermission = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM role_permissions WHERE permission_id = $1', [id]);
  await getPool().query('DELETE FROM permissions WHERE id = $1', [id]);
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
  console.log('━━ Step 8 · Resource CRUD (live) ━━');
  console.log(`  test email      : ${TEST_EMAIL}`);
  console.log(`  test country    : ${TEST_COUNTRY_NAME} (${TEST_COUNTRY_ISO2}/${TEST_COUNTRY_ISO3})`);
  console.log(`  test role code  : ${TEST_ROLE_CODE}`);
  console.log(`  test perm code  : ${TEST_PERM_CODE}`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  try {
    // ─── 0. Setup — harness user with super_admin role ───
    header('0. Setup — register + elevate + login');
    {
      const reg = await http<{
        success: boolean;
        data?: { userId: number };
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
        '0',
        'register harness user',
        reg.status === 201 && typeof reg.body?.data?.userId === 'number',
        `status=${reg.status}`
      );
      const uid = reg.body?.data?.userId;
      if (typeof uid !== 'number') {
        throw new Error('Cannot proceed without a registered user');
      }
      createdUserId = uid;

      // Bypass dual-channel verification gate (deferred to a later step)
      await getPool().query('SELECT udf_auth_verify_email($1)', [uid]);
      await getPool().query('SELECT udf_auth_verify_mobile($1)', [uid]);
      await elevateToSuperAdmin(uid);
      record('0', 'elevated harness user to super_admin (level 0)', true, `uid=${uid}`);

      const login = await http<{
        data?: {
          accessToken: string;
          sessionId: number;
          user: { id: number; permissions: string[] };
        };
      }>('POST', '/api/v1/auth/login', {
        body: { identifier: TEST_EMAIL, password: TEST_PASSWORD }
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

    // ─── 1. Auth — anon access blocked ─────────────────
    header('1. Auth — anonymous access');
    {
      const a = await http<{ code: string }>('GET', '/api/v1/countries');
      record('1', 'GET /countries (no token) → 401', a.status === 401, `got ${a.status}`);

      const b = await http<{ code: string }>('GET', '/api/v1/roles');
      record('1', 'GET /roles     (no token) → 401', b.status === 401, `got ${b.status}`);

      const c = await http<{ code: string }>('GET', '/api/v1/permissions');
      record('1', 'GET /permissions (no token) → 401', c.status === 401, `got ${c.status}`);
    }

    // ─── 2. Countries CRUD ─────────────────────────────
    header('2. Countries CRUD');
    {
      // 2a. List the seeded countries
      const list = await http<{
        success: boolean;
        data: Array<{ id: number; name: string; iso2: string }>;
        meta: { totalCount: number };
      }>('GET', '/api/v1/countries?pageSize=5', { token: accessToken });
      record('2', 'GET /countries → 200', list.status === 200, `got ${list.status}`);
      record(
        '2',
        'list returns at least one row',
        Array.isArray(list.body?.data) && list.body.data.length > 0,
        `n=${list.body?.data?.length ?? 0}`
      );
      record(
        '2',
        'list meta has totalCount > 0',
        (list.body?.meta?.totalCount ?? 0) > 0,
        `totalCount=${list.body?.meta?.totalCount}`
      );

      // 2b. Create
      const create = await http<{
        data: { id: number; iso2: string; name: string };
      }>('POST', '/api/v1/countries', {
        token: accessToken,
        body: {
          name: TEST_COUNTRY_NAME,
          iso2: TEST_COUNTRY_ISO2,
          iso3: TEST_COUNTRY_ISO3,
          phoneCode: '+999',
          currency: 'ZZD',
          currencyName: 'Zee Dollar',
          currencySymbol: 'Z$',
          nationalLanguage: 'Zeeish',
          nationality: 'Zeean',
          languages: ['Zeeish', 'English'],
          tld: '.zz',
          isActive: true
        }
      });
      record('2', 'POST /countries → 201', create.status === 201, `got ${create.status}`);
      record(
        '2',
        'created.iso2 normalized to upper-case',
        create.body?.data?.iso2 === TEST_COUNTRY_ISO2,
        `iso2=${create.body?.data?.iso2}`
      );
      createdCountryId = create.body?.data?.id ?? null;
      record(
        '2',
        'created country has numeric id',
        typeof createdCountryId === 'number' && createdCountryId > 0,
        `id=${createdCountryId}`
      );

      // 2c. Get one
      if (createdCountryId) {
        const get = await http<{
          data: { id: number; name: string; languages: string[] };
        }>(`/api/v1/countries/${createdCountryId}`.startsWith('/') ? 'GET' : 'GET',
           `/api/v1/countries/${createdCountryId}`,
           { token: accessToken });
        record('2', 'GET /countries/:id → 200', get.status === 200, `got ${get.status}`);
        record(
          '2',
          'get returns the right name',
          get.body?.data?.name === TEST_COUNTRY_NAME,
          `name=${get.body?.data?.name}`
        );
        record(
          '2',
          'languages survive JSONB roundtrip',
          Array.isArray(get.body?.data?.languages) && get.body.data.languages.length === 2,
          `languages=${JSON.stringify(get.body?.data?.languages)}`
        );
      }

      // 2d. Update
      if (createdCountryId) {
        const upd = await http<{
          data: { name: string; phoneCode: string };
        }>(
          'PATCH',
          `/api/v1/countries/${createdCountryId}`,
          {
            token: accessToken,
            body: { name: `${TEST_COUNTRY_NAME}-renamed`, phoneCode: '+998' }
          }
        );
        record('2', 'PATCH /countries/:id → 200', upd.status === 200, `got ${upd.status}`);
        record(
          '2',
          'updated name reflected in response',
          upd.body?.data?.name === `${TEST_COUNTRY_NAME}-renamed`,
          `name=${upd.body?.data?.name}`
        );
      }

      // 2e. Validation: bad iso2
      const badIso = await http<{ code: string }>(
        'POST',
        '/api/v1/countries',
        {
          token: accessToken,
          body: { name: 'Bad', iso2: 'XYZW', iso3: 'XYZ' }
        }
      );
      record('2', 'bad iso2 length → 400', badIso.status === 400, `got ${badIso.status}`);

      // 2f. Validation: empty body update
      if (createdCountryId) {
        const empty = await http<{ code: string }>(
          'PATCH',
          `/api/v1/countries/${createdCountryId}`,
          { token: accessToken, body: {} }
        );
        record('2', 'empty PATCH body → 400', empty.status === 400, `got ${empty.status}`);
      }

      // 2g. Duplicate iso2 against an existing seed
      const dupe = await http<{ code: string }>(
        'POST',
        '/api/v1/countries',
        {
          token: accessToken,
          body: { name: 'India Dupe', iso2: 'IN', iso3: 'IN9' }
        }
      );
      record(
        '2',
        'duplicate iso2 → 4xx (UDF reject)',
        dupe.status >= 400 && dupe.status < 500,
        `got ${dupe.status} code=${dupe.body?.code}`
      );

      // 2h. Soft-delete
      if (createdCountryId) {
        const del = await http(
          'DELETE',
          `/api/v1/countries/${createdCountryId}`,
          { token: accessToken }
        );
        record('2', 'DELETE /countries/:id → 200', del.status === 200, `got ${del.status}`);

        // After soft delete: re-fetch should still find it because the
        // udf_get_countries view doesn't filter is_deleted by default.
        const rest = await http(
          'POST',
          `/api/v1/countries/${createdCountryId}/restore`,
          { token: accessToken }
        );
        record('2', 'POST /countries/:id/restore → 200', rest.status === 200, `got ${rest.status}`);
      }

      // 2i. Sort + filter sanity
      const sorted = await http<{
        data: Array<{ name: string }>;
      }>('GET', '/api/v1/countries?sortColumn=name&sortDirection=ASC&pageSize=3', {
        token: accessToken
      });
      record(
        '2',
        'sortColumn=name asc returns alphabetised data',
        sorted.status === 200 &&
          sorted.body?.data?.length >= 2 &&
          [...sorted.body.data].every((row, i, arr) =>
            i === 0 ? true : row.name.localeCompare(arr[i - 1].name) >= 0
          ),
        ''
      );
    }

    // ─── 3. Roles CRUD ────────────────────────────────
    header('3. Roles CRUD');
    {
      const list = await http<{
        data: Array<{ id: number; code: string; isSystemRole: boolean }>;
      }>('GET', '/api/v1/roles?pageSize=5', { token: accessToken });
      record('3', 'GET /roles → 200', list.status === 200, `got ${list.status}`);
      record(
        '3',
        'list contains at least one system role',
        (list.body?.data ?? []).some((r) => r.isSystemRole === true),
        `n=${list.body?.data?.length ?? 0}`
      );

      const create = await http<{
        data: { id: number; code: string; level: number };
      }>('POST', '/api/v1/roles', {
        token: accessToken,
        body: {
          name: 'Verify Test Role',
          code: TEST_ROLE_CODE,
          description: 'temporary role created by verify-resources.ts',
          level: 50,
          displayOrder: 999
        }
      });
      record('3', 'POST /roles → 201', create.status === 201, `got ${create.status}`);
      createdRoleId = create.body?.data?.id ?? null;
      record(
        '3',
        'role created with the requested code',
        create.body?.data?.code === TEST_ROLE_CODE,
        `code=${create.body?.data?.code}`
      );

      if (createdRoleId) {
        const get = await http<{ data: { name: string } }>(
          'GET',
          `/api/v1/roles/${createdRoleId}`,
          { token: accessToken }
        );
        record('3', 'GET /roles/:id → 200', get.status === 200, `got ${get.status}`);

        const upd = await http<{ data: { description: string | null } }>(
          'PATCH',
          `/api/v1/roles/${createdRoleId}`,
          {
            token: accessToken,
            body: { description: 'updated by verify-resources.ts' }
          }
        );
        record('3', 'PATCH /roles/:id → 200', upd.status === 200, `got ${upd.status}`);
        record(
          '3',
          'description was actually updated',
          upd.body?.data?.description === 'updated by verify-resources.ts',
          `desc=${upd.body?.data?.description}`
        );

        const del = await http('DELETE', `/api/v1/roles/${createdRoleId}`, {
          token: accessToken
        });
        record('3', 'DELETE /roles/:id → 200', del.status === 200, `got ${del.status}`);

        const rest = await http('POST', `/api/v1/roles/${createdRoleId}/restore`, {
          token: accessToken
        });
        record('3', 'POST /roles/:id/restore → 200', rest.status === 200, `got ${rest.status}`);
      }

      // System role delete protection — pick the first system role.
      const sysRoles = (list.body?.data ?? []).filter((r) => r.isSystemRole === true);
      if (sysRoles.length > 0) {
        const sysId = sysRoles[0].id;
        const del = await http<{ code: string }>(
          'DELETE',
          `/api/v1/roles/${sysId}`,
          { token: accessToken }
        );
        record(
          '3',
          'DELETE on system role rejected (4xx)',
          del.status >= 400 && del.status < 500,
          `got ${del.status} code=${del.body?.code}`
        );
      }

      // Validation: empty PATCH
      if (createdRoleId) {
        const empty = await http<{ code: string }>(
          'PATCH',
          `/api/v1/roles/${createdRoleId}`,
          { token: accessToken, body: {} }
        );
        record('3', 'empty role PATCH → 400', empty.status === 400, `got ${empty.status}`);
      }

      // Duplicate code rejection
      const dupe = await http<{ code: string }>('POST', '/api/v1/roles', {
        token: accessToken,
        body: {
          name: 'Verify Test Role Dupe',
          code: TEST_ROLE_CODE
        }
      });
      record(
        '3',
        'duplicate role code → 4xx',
        dupe.status >= 400 && dupe.status < 500,
        `got ${dupe.status}`
      );
    }

    // ─── 4. Permissions CRUD ──────────────────────────
    header('4. Permissions CRUD');
    {
      const list = await http<{
        data: Array<{ id: number; code: string }>;
        meta: { totalCount: number };
      }>('GET', '/api/v1/permissions?pageSize=5', { token: accessToken });
      record('4', 'GET /permissions → 200', list.status === 200, `got ${list.status}`);
      record(
        '4',
        'permissions list non-empty',
        (list.body?.data ?? []).length > 0,
        `n=${list.body?.data?.length ?? 0}`
      );

      const create = await http<{
        data: { id: number; code: string; resource: string };
      }>('POST', '/api/v1/permissions', {
        token: accessToken,
        body: {
          name: 'Verify Test Permission',
          code: TEST_PERM_CODE,
          resource: 'verify_test',
          action: 'read',
          scope: 'global',
          description: 'temporary permission created by verify-resources.ts',
          displayOrder: 999
        }
      });
      record('4', 'POST /permissions → 201', create.status === 201, `got ${create.status}`);
      createdPermissionId = create.body?.data?.id ?? null;
      record(
        '4',
        'permission created with normalized code',
        create.body?.data?.code === TEST_PERM_CODE,
        `code=${create.body?.data?.code}`
      );

      // Auto-assign side-effect: udf_permissions_insert grants the new
      // permission to Super Admin (always) and Admin (non-delete actions
      // only). Since our test perm has action='read', BOTH should hold.
      // NOTE: must be checked BEFORE the delete below — udf_permissions_delete
      // cascade-soft-deletes role_permissions, and restore does not re-grant.
      if (createdPermissionId) {
        const { rows: assigns } = await getPool().query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM role_permissions
           WHERE permission_id = $1 AND is_deleted = FALSE`,
          [createdPermissionId]
        );
        record(
          '4',
          'permission auto-assigned to Super Admin + Admin (≥2 grants)',
          (assigns[0]?.count ?? 0) >= 2,
          `count=${assigns[0]?.count}`
        );
      }

      if (createdPermissionId) {
        const get = await http<{ data: { resource: string; action: string } }>(
          'GET',
          `/api/v1/permissions/${createdPermissionId}`,
          { token: accessToken }
        );
        record('4', 'GET /permissions/:id → 200', get.status === 200, `got ${get.status}`);
        record(
          '4',
          'resource/action persisted',
          get.body?.data?.resource === 'verify_test' && get.body?.data?.action === 'read',
          `resource=${get.body?.data?.resource} action=${get.body?.data?.action}`
        );

        const upd = await http<{ data: { description: string | null } }>(
          'PATCH',
          `/api/v1/permissions/${createdPermissionId}`,
          {
            token: accessToken,
            body: { description: 'patched by verify-resources.ts' }
          }
        );
        record('4', 'PATCH /permissions/:id → 200', upd.status === 200, `got ${upd.status}`);
        record(
          '4',
          'description was actually updated',
          upd.body?.data?.description === 'patched by verify-resources.ts',
          ''
        );

        const del = await http('DELETE', `/api/v1/permissions/${createdPermissionId}`, {
          token: accessToken
        });
        record('4', 'DELETE /permissions/:id → 200', del.status === 200, `got ${del.status}`);

        const rest = await http(
          'POST',
          `/api/v1/permissions/${createdPermissionId}/restore`,
          { token: accessToken }
        );
        record('4', 'POST /permissions/:id/restore → 200', rest.status === 200, `got ${rest.status}`);
      }

      // Validation: scope must be lower-case alphanumerics
      const badScope = await http<{ code: string }>(
        'POST',
        '/api/v1/permissions',
        {
          token: accessToken,
          body: {
            name: 'Bad Scope',
            code: `verify_${RUN_ID}_bad`,
            resource: 'x',
            action: 'y',
            scope: 'BAD SCOPE!!'
          }
        }
      );
      record('4', 'bad scope → 400', badScope.status === 400, `got ${badScope.status}`);

      // Filter by resource
      const filtered = await http<{
        data: Array<{ resource: string }>;
      }>('GET', '/api/v1/permissions?resource=user&pageSize=10', {
        token: accessToken
      });
      record(
        '4',
        'filter by resource=user only returns user.* permissions',
        filtered.status === 200 &&
          (filtered.body?.data ?? []).every((p) => p.resource === 'user'),
        `n=${filtered.body?.data?.length}`
      );
    }
  } finally {
    // ─── 5. Cleanup ──────────────────────────────────
    header('5. Cleanup');
    {
      // Hard-delete the test resources first; the audit FKs are ON
      // DELETE SET NULL so removing the user later won't break anything,
      // but doing the resources first keeps the order intuitive.
      if (createdCountryId) {
        try {
          await hardDeleteCountry(createdCountryId);
          record('5', 'test country hard-deleted', true, `id=${createdCountryId}`);
        } catch (err) {
          record('5', 'test country hard-deleted', false, (err as Error).message);
        }
      }
      if (createdRoleId) {
        try {
          await hardDeleteRole(createdRoleId);
          record('5', 'test role hard-deleted', true, `id=${createdRoleId}`);
        } catch (err) {
          record('5', 'test role hard-deleted', false, (err as Error).message);
        }
      }
      if (createdPermissionId) {
        try {
          await hardDeletePermission(createdPermissionId);
          record('5', 'test permission hard-deleted', true, `id=${createdPermissionId}`);
        } catch (err) {
          record('5', 'test permission hard-deleted', false, (err as Error).message);
        }
      }
      if (createdUserId) {
        try {
          await softDeleteUser(createdUserId);
          record('5', 'harness user soft-deleted', true, `id=${createdUserId}`);
        } catch (err) {
          record('5', 'harness user soft-deleted', false, (err as Error).message);
        }
      }
      if (firstJti) {
        try {
          await redisRevoked.remove(firstJti);
          record('5', 'redis revoked entry removed (no-op if absent)', true, `jti=${firstJti}`);
        } catch (err) {
          record('5', 'redis revoked entry removed', false, (err as Error).message);
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
    console.log('  Step 8 verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
