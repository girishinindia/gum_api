/* eslint-disable no-console */
/**
 * Step 9 — RBAC junction endpoints (live, end-to-end).
 *
 * Exercises /api/v1/role-permissions and /api/v1/user-permissions
 * against the real Express app bound to an ephemeral port, talking to
 * the live Supabase database and Upstash Redis. Nothing is mocked.
 *
 * Sections:
 *   0. Setup   — register harness user, verify, elevate to super_admin,
 *                log in, create a throw-away role + permission to use
 *                as the assignment targets.
 *   1. Auth    — anonymous calls to both routers return 401.
 *   2. Role-Permissions — list / assign / get / 409-dupe / revoke-pair /
 *                re-assign / delete-by-id / restore-by-id / filter by roleId.
 *   3. User-Permissions — list / assign(grant) / get / 409-dupe /
 *                revoke-pair / re-assign as deny / delete-by-id /
 *                restore-by-id / invalid grantType 400 / filter by userId.
 *   4. Cleanup — hard-delete the test role + permission (with junction
 *                fan-out) and the harness user-permission row, then soft
 *                delete the harness user; remove redis revoked entry.
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
  console.log(`  ${mark}  ${name.padEnd(62)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;
const TEST_EMAIL = `verify-jct+${RUN_ID}@test.growupmore.local`;
const TEST_PASSWORD = 'VerifyJct123';
const TEST_FIRST = 'VerifyJct';
const TEST_LAST = `Run${process.pid}`;

const SLUG = RUN_ID.replace(/-/g, '_');
const TEST_ROLE_CODE = `verify_jct_${SLUG}_role`.slice(0, 60);
const TEST_PERM_CODE = `verify_jct_${SLUG}.read`.slice(0, 60);

let createdUserId: number | null = null;
let accessToken = '';
let firstJti = '';

// Fixture IDs — created via the API, torn down in cleanup.
let fixtureRoleId: number | null = null;
let fixturePermissionId: number | null = null;

// Junction IDs — reused across the sections so we can exercise
// delete/restore on the exact rows we just created.
let rpAssignmentId: number | null = null;
let upAssignmentId: number | null = null;

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
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteRole = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
  await getPool().query('DELETE FROM roles WHERE id = $1', [id]);
};
const hardDeletePermission = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM role_permissions WHERE permission_id = $1', [id]);
  await getPool().query('DELETE FROM user_permissions WHERE permission_id = $1', [id]);
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
  console.log('━━ Step 9 · Junction endpoints (live) ━━');
  console.log(`  test email      : ${TEST_EMAIL}`);
  console.log(`  test role code  : ${TEST_ROLE_CODE}`);
  console.log(`  test perm code  : ${TEST_PERM_CODE}`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  try {
    // ─── 0. Setup ───────────────────────────────────────
    header('0. Setup — register + elevate + login + fixtures');
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

      // Create fixture role via the real /roles endpoint
      const roleRes = await http<{ data: { id: number; code: string } }>(
        'POST',
        '/api/v1/roles',
        {
          token: accessToken,
          body: {
            name: `Verify Jct Role ${RUN_ID}`,
            code: TEST_ROLE_CODE,
            level: 50,
            description: 'throw-away role for verify-junctions.ts',
            displayOrder: 999
          }
        }
      );
      record(
        '0',
        'fixture role created via POST /roles',
        roleRes.status === 201 && typeof roleRes.body?.data?.id === 'number',
        `status=${roleRes.status} code=${roleRes.body?.data?.code}`
      );
      fixtureRoleId = roleRes.body?.data?.id ?? null;

      // Create fixture permission via the real /permissions endpoint
      const permRes = await http<{ data: { id: number; code: string } }>(
        'POST',
        '/api/v1/permissions',
        {
          token: accessToken,
          body: {
            name: `Verify Jct Permission ${RUN_ID}`,
            code: TEST_PERM_CODE,
            resource: `verify_jct_${SLUG}`.slice(0, 30),
            action: 'read',
            scope: 'global',
            description: 'throw-away permission for verify-junctions.ts',
            displayOrder: 999
          }
        }
      );
      record(
        '0',
        'fixture permission created via POST /permissions',
        permRes.status === 201 && typeof permRes.body?.data?.id === 'number',
        `status=${permRes.status} code=${permRes.body?.data?.code}`
      );
      fixturePermissionId = permRes.body?.data?.id ?? null;
    }

    if (!fixtureRoleId || !fixturePermissionId || !createdUserId) {
      throw new Error('Fixture setup failed — bailing before the real tests.');
    }

    // ─── 1. Auth — anon hits ────────────────────────────
    header('1. Auth — anonymous access');
    {
      const rp = await http('GET', '/api/v1/role-permissions');
      record('1', 'GET /role-permissions (no token) → 401', rp.status === 401, `got ${rp.status}`);
      const up = await http('GET', '/api/v1/user-permissions');
      record('1', 'GET /user-permissions (no token) → 401', up.status === 401, `got ${up.status}`);
    }

    // ─── 2. Role-Permissions ────────────────────────────
    header('2. Role-Permissions CRUD');
    {
      const list = await http<{
        data: Array<{ id: number }>;
        meta: { totalCount: number };
      }>('GET', '/api/v1/role-permissions?pageSize=5', { token: accessToken });
      record('2', 'GET /role-permissions → 200', list.status === 200, `got ${list.status}`);
      record(
        '2',
        'list returns non-empty seeded data',
        (list.body?.data ?? []).length > 0,
        `n=${list.body?.data?.length ?? 0} total=${list.body?.meta?.totalCount ?? 0}`
      );

      // Assign fixture permission to fixture role
      const assign = await http<{
        data: { id: number; roleId: number; permissionId: number };
      }>('POST', '/api/v1/role-permissions', {
        token: accessToken,
        body: { roleId: fixtureRoleId, permissionId: fixturePermissionId }
      });
      record('2', 'POST /role-permissions → 201', assign.status === 201, `got ${assign.status}`);
      record(
        '2',
        'response carries freshly-assigned junction DTO',
        assign.body?.data?.roleId === fixtureRoleId &&
          assign.body?.data?.permissionId === fixturePermissionId,
        `rid=${assign.body?.data?.roleId} pid=${assign.body?.data?.permissionId}`
      );
      rpAssignmentId = assign.body?.data?.id ?? null;

      if (rpAssignmentId) {
        const get = await http<{
          data: { id: number; roleCode: string; permissionCode: string };
        }>(
          'GET',
          `/api/v1/role-permissions/${rpAssignmentId}`,
          { token: accessToken }
        );
        record('2', 'GET /role-permissions/:id → 200', get.status === 200, `got ${get.status}`);
        record(
          '2',
          'view DTO resolves role code + permission code',
          get.body?.data?.roleCode === TEST_ROLE_CODE &&
            get.body?.data?.permissionCode === TEST_PERM_CODE,
          `${get.body?.data?.roleCode} / ${get.body?.data?.permissionCode}`
        );
      }

      // Filter by roleId should surface exactly the fixture assignment
      const byRole = await http<{ data: Array<{ id: number; roleId: number }> }>(
        'GET',
        `/api/v1/role-permissions?roleId=${fixtureRoleId}`,
        { token: accessToken }
      );
      record(
        '2',
        'filter by roleId returns only that role',
        byRole.status === 200 &&
          (byRole.body?.data ?? []).every((row) => row.roleId === fixtureRoleId) &&
          (byRole.body?.data ?? []).length >= 1,
        `n=${byRole.body?.data?.length ?? 0}`
      );

      // Duplicate assignment should 4xx
      const dup = await http<{ code: string }>('POST', '/api/v1/role-permissions', {
        token: accessToken,
        body: { roleId: fixtureRoleId, permissionId: fixturePermissionId }
      });
      record(
        '2',
        'duplicate assignment → 4xx',
        dup.status >= 400 && dup.status < 500,
        `got ${dup.status} code=${dup.body?.code}`
      );

      // Revoke by pair
      const revoke = await http('POST', '/api/v1/role-permissions/revoke', {
        token: accessToken,
        body: { roleId: fixtureRoleId, permissionId: fixturePermissionId }
      });
      record('2', 'POST /role-permissions/revoke → 200', revoke.status === 200, `got ${revoke.status}`);

      // Re-assign (should reactivate the soft-deleted row)
      const reassign = await http<{ data: { id: number } }>(
        'POST',
        '/api/v1/role-permissions',
        {
          token: accessToken,
          body: { roleId: fixtureRoleId, permissionId: fixturePermissionId }
        }
      );
      record(
        '2',
        're-assign after revoke → 201 (reactivates same row)',
        reassign.status === 201 && reassign.body?.data?.id === rpAssignmentId,
        `got ${reassign.status} id=${reassign.body?.data?.id}`
      );

      if (rpAssignmentId) {
        // Delete by junction id
        const del = await http('DELETE', `/api/v1/role-permissions/${rpAssignmentId}`, {
          token: accessToken
        });
        record('2', 'DELETE /role-permissions/:id → 200', del.status === 200, `got ${del.status}`);

        // Restore by junction id
        const rest = await http<{ data: { id: number; isDeleted: boolean } }>(
          'POST',
          `/api/v1/role-permissions/${rpAssignmentId}/restore`,
          { token: accessToken }
        );
        record('2', 'POST /role-permissions/:id/restore → 200', rest.status === 200, `got ${rest.status}`);
        record(
          '2',
          'restored row has isDeleted=false',
          rest.body?.data?.isDeleted === false,
          `isDeleted=${rest.body?.data?.isDeleted}`
        );
      }

      // Non-existent junction id → 404
      const notFound = await http('GET', '/api/v1/role-permissions/999999999', {
        token: accessToken
      });
      record(
        '2',
        'GET /role-permissions/:unknown → 404',
        notFound.status === 404,
        `got ${notFound.status}`
      );

      // Bad body (missing roleId)
      const badBody = await http('POST', '/api/v1/role-permissions', {
        token: accessToken,
        body: { permissionId: fixturePermissionId }
      });
      record(
        '2',
        'POST with missing roleId → 400',
        badBody.status === 400,
        `got ${badBody.status}`
      );
    }

    // ─── 3. User-Permissions ────────────────────────────
    header('3. User-Permissions CRUD');
    {
      const list = await http<{
        data: Array<{ id: number }>;
        meta: { totalCount: number };
      }>('GET', '/api/v1/user-permissions?pageSize=5', { token: accessToken });
      record('3', 'GET /user-permissions → 200', list.status === 200, `got ${list.status}`);

      // Assign (grant) the fixture permission to the harness user itself.
      // Super Admin already has it via role_permissions, so this override
      // is an idempotent no-op at the auth layer, but exercises the UDF.
      const grant = await http<{
        data: { id: number; userId: number; grantType: string };
      }>('POST', '/api/v1/user-permissions', {
        token: accessToken,
        body: {
          userId: createdUserId,
          permissionId: fixturePermissionId,
          grantType: 'grant'
        }
      });
      record('3', 'POST /user-permissions (grant) → 201', grant.status === 201, `got ${grant.status}`);
      record(
        '3',
        'override saved with grantType=grant',
        grant.body?.data?.grantType === 'grant',
        `grantType=${grant.body?.data?.grantType}`
      );
      upAssignmentId = grant.body?.data?.id ?? null;

      if (upAssignmentId) {
        const get = await http<{
          data: { id: number; userId: number; grantType: string; permissionCode: string };
        }>(
          'GET',
          `/api/v1/user-permissions/${upAssignmentId}`,
          { token: accessToken }
        );
        record('3', 'GET /user-permissions/:id → 200', get.status === 200, `got ${get.status}`);
        record(
          '3',
          'view DTO resolves permissionCode + userId',
          get.body?.data?.userId === createdUserId &&
            get.body?.data?.permissionCode === TEST_PERM_CODE,
          `uid=${get.body?.data?.userId} code=${get.body?.data?.permissionCode}`
        );
      }

      // Duplicate grant → 4xx
      const dup = await http<{ code: string }>('POST', '/api/v1/user-permissions', {
        token: accessToken,
        body: {
          userId: createdUserId,
          permissionId: fixturePermissionId,
          grantType: 'grant'
        }
      });
      record(
        '3',
        'duplicate grant → 4xx',
        dup.status >= 400 && dup.status < 500,
        `got ${dup.status} code=${dup.body?.code}`
      );

      // Revoke by pair → soft delete
      const revoke = await http('POST', '/api/v1/user-permissions/revoke', {
        token: accessToken,
        body: { userId: createdUserId, permissionId: fixturePermissionId }
      });
      record('3', 'POST /user-permissions/revoke → 200', revoke.status === 200, `got ${revoke.status}`);

      // Re-assign as DENY (reactivates soft-deleted row with new grant_type)
      const denyReassign = await http<{
        data: { id: number; grantType: string };
      }>('POST', '/api/v1/user-permissions', {
        token: accessToken,
        body: {
          userId: createdUserId,
          permissionId: fixturePermissionId,
          grantType: 'deny'
        }
      });
      record(
        '3',
        're-assign after revoke with grantType=deny → 201',
        denyReassign.status === 201,
        `got ${denyReassign.status}`
      );
      record(
        '3',
        'reactivated row is same junction id',
        denyReassign.body?.data?.id === upAssignmentId,
        `id=${denyReassign.body?.data?.id}`
      );
      record(
        '3',
        'grant_type switched to deny on reactivation',
        denyReassign.body?.data?.grantType === 'deny',
        `grantType=${denyReassign.body?.data?.grantType}`
      );

      if (upAssignmentId) {
        const del = await http('DELETE', `/api/v1/user-permissions/${upAssignmentId}`, {
          token: accessToken
        });
        record('3', 'DELETE /user-permissions/:id → 200', del.status === 200, `got ${del.status}`);

        const rest = await http<{ data: { id: number; isDeleted: boolean; grantType: string } }>(
          'POST',
          `/api/v1/user-permissions/${upAssignmentId}/restore`,
          { token: accessToken }
        );
        record('3', 'POST /user-permissions/:id/restore → 200', rest.status === 200, `got ${rest.status}`);
        record(
          '3',
          'restored override has isDeleted=false',
          rest.body?.data?.isDeleted === false,
          `isDeleted=${rest.body?.data?.isDeleted}`
        );
      }

      // Invalid grantType → 400
      const badType = await http('POST', '/api/v1/user-permissions', {
        token: accessToken,
        body: {
          userId: createdUserId,
          permissionId: fixturePermissionId,
          grantType: 'maybe'
        }
      });
      record('3', 'invalid grantType → 400', badType.status === 400, `got ${badType.status}`);

      // Filter by userId returns only rows for the harness user
      const byUser = await http<{ data: Array<{ userId: number }> }>(
        'GET',
        `/api/v1/user-permissions?userId=${createdUserId}`,
        { token: accessToken }
      );
      record(
        '3',
        'filter by userId returns only that user',
        byUser.status === 200 &&
          (byUser.body?.data ?? []).every((row) => row.userId === createdUserId) &&
          (byUser.body?.data ?? []).length >= 1,
        `n=${byUser.body?.data?.length ?? 0}`
      );

      // Filter by grantType
      const byDeny = await http<{ data: Array<{ grantType: string }> }>(
        'GET',
        `/api/v1/user-permissions?grantType=deny&pageSize=20`,
        { token: accessToken }
      );
      record(
        '3',
        'filter by grantType=deny (no crash)',
        byDeny.status === 200 &&
          (byDeny.body?.data ?? []).every((r) => r.grantType === 'deny'),
        `n=${byDeny.body?.data?.length ?? 0}`
      );

      // Bad body (missing userId)
      const badBody = await http('POST', '/api/v1/user-permissions', {
        token: accessToken,
        body: { permissionId: fixturePermissionId, grantType: 'grant' }
      });
      record(
        '3',
        'POST with missing userId → 400',
        badBody.status === 400,
        `got ${badBody.status}`
      );
    }
  } finally {
    // ─── 4. Cleanup ──────────────────────────────────
    header('4. Cleanup');
    {
      // Hard-delete fixture permission first — this cascades via our
      // helper (user_permissions + role_permissions → permissions row).
      if (fixturePermissionId) {
        try {
          await hardDeletePermission(fixturePermissionId);
          record('4', 'fixture permission hard-deleted', true, `id=${fixturePermissionId}`);
        } catch (err) {
          record('4', 'fixture permission hard-deleted', false, (err as Error).message);
        }
      }
      if (fixtureRoleId) {
        try {
          await hardDeleteRole(fixtureRoleId);
          record('4', 'fixture role hard-deleted', true, `id=${fixtureRoleId}`);
        } catch (err) {
          record('4', 'fixture role hard-deleted', false, (err as Error).message);
        }
      }
      if (createdUserId) {
        try {
          await softDeleteUser(createdUserId);
          record('4', 'harness user soft-deleted', true, `id=${createdUserId}`);
        } catch (err) {
          record('4', 'harness user soft-deleted', false, (err as Error).message);
        }
      }
      if (firstJti) {
        try {
          await redisRevoked.remove(firstJti);
          record('4', 'redis revoked entry removed (no-op if absent)', true, `jti=${firstJti}`);
        } catch (err) {
          record('4', 'redis revoked entry removed', false, (err as Error).message);
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
    console.log('  Step 9 verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
