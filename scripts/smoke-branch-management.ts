/* eslint-disable no-console */
/**
 * Phase-03 branch management · Stage-2 smoke test.
 *
 * Boots the real Express app on an ephemeral port, registers a
 * throw-away user, elevates them to super_admin, logs in, and
 * exercises one happy-path call on each of:
 *   - /api/v1/branches
 *   - /api/v1/departments
 *   - /api/v1/branch-departments
 *
 * Cleans up everything it creates. This is NOT the full verify
 * script (that lands in Stage 3); it just confirms the wiring is
 * live and the three routers talk to the phase-03 UDFs without
 * compile or runtime errors.
 */

process.env.SKIP_GLOBAL_RATE_LIMIT = '1';

import type { AddressInfo } from 'node:net';

import { buildApp } from '../src/app';
import { closePool, getPool } from '../src/database/pg-pool';
import { closeRedis } from '../src/database/redis';

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];
const record = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(60)} ${detail}`);
};

const RUN_ID = `${process.pid}-${Date.now()}`;
const TEST_EMAIL = `smoke-br+${RUN_ID}@test.growupmore.local`;
const TEST_PASSWORD = 'SmokeBr123';
const TEST_FIRST = 'SmokeBr';
const TEST_LAST = `Run${process.pid}`;

const BRANCH_CODE = `SM-${Date.now().toString(36)}`.toUpperCase().slice(0, 16);
const DEPT_CODE = `SMDEPT-${Date.now().toString(36)}`.toUpperCase().slice(0, 16);
const BRANCH_NAME = `Smoke Branch ${RUN_ID}`;
const DEPT_NAME = `Smoke Dept ${RUN_ID}`;

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

const main = async (): Promise<void> => {
  console.log('━━ Phase-03 branch management · smoke test ━━');
  console.log(`  test email : ${TEST_EMAIL}`);
  console.log(`  branch     : ${BRANCH_NAME} (${BRANCH_CODE})`);
  console.log(`  department : ${DEPT_NAME} (${DEPT_CODE})`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  let createdUserId: number | null = null;
  let branchId: number | null = null;
  let departmentId: number | null = null;
  let bdId: number | null = null;

  try {
    // ─── register + elevate + login ────────────────────
    const reg = await http<{ data?: { userId: number } }>(
      'POST',
      '/api/v1/auth/register',
      {
        body: {
          firstName: TEST_FIRST,
          lastName: TEST_LAST,
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          roleCode: 'student'
        }
      }
    );
    const uid = reg.body?.data?.userId;
    record(
      'register harness user',
      reg.status === 201 && typeof uid === 'number',
      `status=${reg.status}`
    );
    if (typeof uid !== 'number') throw new Error('register failed');
    createdUserId = uid;

    await getPool().query('SELECT udf_auth_verify_email($1)', [uid]);
    await getPool().query('SELECT udf_auth_verify_mobile($1)', [uid]);
    await elevateToSuperAdmin(uid);
    record('elevated to super_admin', true, `uid=${uid}`);

    const login = await http<{ data?: { accessToken: string } }>(
      'POST',
      '/api/v1/auth/login',
      { body: { identifier: TEST_EMAIL, password: TEST_PASSWORD } }
    );
    const accessToken = login.body?.data?.accessToken ?? '';
    record(
      'login as super_admin',
      login.status === 200 && accessToken.length > 0,
      `status=${login.status}`
    );

    // ─── branches.create happy path ─────────────────────
    const br = await http<{ data?: { id: number; code: string } }>(
      'POST',
      '/api/v1/branches',
      {
        token: accessToken,
        body: {
          countryId: 1,
          stateId: 1,
          cityId: 1,
          name: BRANCH_NAME,
          code: BRANCH_CODE,
          branchType: 'office',
          isActive: true
        }
      }
    );
    branchId = br.body?.data?.id ?? null;
    record(
      'POST /branches returns 201 + body',
      br.status === 201 && typeof branchId === 'number',
      `status=${br.status} id=${branchId}`
    );

    // ─── branches.list paginated ────────────────────────
    const brList = await http<{ data?: unknown[]; meta?: unknown }>(
      'GET',
      `/api/v1/branches?pageIndex=1&pageSize=5&searchTerm=Smoke+Branch+${RUN_ID}`,
      { token: accessToken }
    );
    record(
      'GET /branches?search=... returns 200 + meta',
      brList.status === 200 &&
        Array.isArray(brList.body?.data) &&
        brList.body?.meta != null,
      `status=${brList.status} rows=${Array.isArray(brList.body?.data) ? brList.body!.data!.length : '?'}`
    );

    // ─── branches.read one ──────────────────────────────
    const brGet = await http<{
      data?: { id: number; name: string; city: { name: string } };
    }>('GET', `/api/v1/branches/${branchId}`, { token: accessToken });
    record(
      'GET /branches/:id returns joined city/state/country',
      brGet.status === 200 &&
        brGet.body?.data?.id === branchId &&
        typeof brGet.body?.data?.city?.name === 'string',
      `status=${brGet.status} city=${brGet.body?.data?.city?.name}`
    );

    // ─── departments.create happy path ─────────────────
    const dp = await http<{ data?: { id: number } }>(
      'POST',
      '/api/v1/departments',
      {
        token: accessToken,
        body: {
          name: DEPT_NAME,
          code: DEPT_CODE,
          description: 'Smoke-test department',
          isActive: true
        }
      }
    );
    departmentId = dp.body?.data?.id ?? null;
    record(
      'POST /departments returns 201 + body',
      dp.status === 201 && typeof departmentId === 'number',
      `status=${dp.status} id=${departmentId}`
    );

    // ─── branch-departments.create happy path ──────────
    const bd = await http<{ data?: { id: number } }>(
      'POST',
      '/api/v1/branch-departments',
      {
        token: accessToken,
        body: {
          branchId,
          departmentId,
          floorOrWing: 'Smoke Floor 1',
          extensionNumber: '101',
          isActive: true
        }
      }
    );
    bdId = bd.body?.data?.id ?? null;
    record(
      'POST /branch-departments returns 201 + body',
      bd.status === 201 && typeof bdId === 'number',
      `status=${bd.status} id=${bdId}`
    );

    // ─── branch-departments.list ────────────────────────
    const bdList = await http<{ data?: unknown[] }>(
      'GET',
      `/api/v1/branch-departments?pageIndex=1&pageSize=5&branchId=${branchId}`,
      { token: accessToken }
    );
    record(
      'GET /branch-departments?branchId=... returns 200 + rows',
      bdList.status === 200 && Array.isArray(bdList.body?.data),
      `status=${bdList.status} rows=${Array.isArray(bdList.body?.data) ? bdList.body!.data!.length : '?'}`
    );

    // ─── branches.delete blocked while BD active ───────
    const brDelBlocked = await http(
      'DELETE',
      `/api/v1/branches/${branchId}`,
      { token: accessToken }
    );
    record(
      'DELETE /branches/:id blocked by active BD child',
      brDelBlocked.status >= 400 && brDelBlocked.status < 500,
      `status=${brDelBlocked.status}`
    );
  } catch (err) {
    console.error('\x1b[31mSmoke test threw:\x1b[0m', err);
    record('no exception during smoke test', false, String(err));
  } finally {
    // ─── cleanup ────────────────────────────────────────
    try {
      if (bdId != null) {
        await getPool().query('DELETE FROM branch_departments WHERE id = $1', [bdId]);
      }
      if (branchId != null) {
        await getPool().query('DELETE FROM branches WHERE id = $1', [branchId]);
      }
      if (departmentId != null) {
        await getPool().query('DELETE FROM departments WHERE id = $1', [departmentId]);
      }
      if (createdUserId != null) {
        await getPool().query(
          `UPDATE users
              SET is_deleted = TRUE, is_active = FALSE,
                  deleted_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $1`,
          [createdUserId]
        );
      }
    } catch (cleanupErr) {
      console.error('cleanup error:', cleanupErr);
    }

    server.close();
    await closePool();
    await closeRedis();
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n  ${passed}/${total} passed`);
  if (passed !== total) process.exit(1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
