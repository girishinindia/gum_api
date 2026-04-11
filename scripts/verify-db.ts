/* eslint-disable no-console */
/**
 * Step 3 — Database access layer verification.
 *
 * Exercises the full UDF-only spine:
 *   1. callTableFunction happy paths across every udf_get_* in phase-01
 *   2. Pagination boundary tests (negative / zero / huge values) against the
 *      clamp we standardized in phase-01
 *   3. Live error paths via callFunction (mutations that fail-before-write,
 *      so no data is actually modified)
 *   4. parseUdfError mapping — pure unit tests against canonical messages
 *   5. Transaction helper — COMMIT path and ROLLBACK-on-throw path
 *
 * Run via: npm run verify:db
 */

import { AppError } from '../src/core/errors/app-error';
import { db } from '../src/database/db';
import { closePool, getPool } from '../src/database/pg-pool';

// ─── Tiny reporter ─────────────────────────────────────────
type CheckResult = { section: string; name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
const record = (section: string, name: string, ok: boolean, detail: string) => {
  results.push({ section, name, ok, detail });
  console.log(`  ${ok ? '✔' : '✖'}  ${name.padEnd(56)} ${detail}`);
};

// ─── Small async assertion helpers ────────────────────────
async function expectThrows(
  fn: () => Promise<unknown>,
  predicate: (err: unknown) => boolean,
  summary: string
): Promise<{ ok: boolean; detail: string }> {
  try {
    await fn();
    return { ok: false, detail: `did NOT throw (expected: ${summary})` };
  } catch (err) {
    if (predicate(err)) {
      if (err instanceof AppError) {
        return { ok: true, detail: `${err.statusCode} ${err.code}: ${err.message.substring(0, 60)}` };
      }
      return { ok: true, detail: (err as Error).message.substring(0, 80) };
    }
    return {
      ok: false,
      detail: `wrong error: ${err instanceof AppError ? `${err.statusCode}/${err.code}` : (err as Error).message}`
    };
  }
}

async function main(): Promise<void> {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Step 3 — Database Access Layer Verification');
  console.log('══════════════════════════════════════════════════════');

  // ══════════════════════════════════════════════════════════
  // 1. HAPPY PATH — callTableFunction against every udf_get_*
  // ══════════════════════════════════════════════════════════
  console.log('\n1. callTableFunction — happy paths\n');

  const readOnlyTargets: Array<{ udf: string; params: Record<string, unknown> }> = [
    { udf: 'udf_get_countries',                params: { p_page_size: 5 } },
    { udf: 'udf_get_roles',                    params: { p_page_size: 5 } },
    { udf: 'udf_get_permissions',              params: { p_page_size: 5 } },
    { udf: 'udf_get_users',                    params: { p_page_size: 5 } },
    { udf: 'udf_get_role_permissions',         params: { p_page_size: 5 } },
    { udf: 'udf_get_user_permissions',         params: { p_page_size: 5 } },
    { udf: 'udf_get_otps',                     params: { p_page_size: 5 } },
    { udf: 'udf_get_sessions',                 params: { p_page_size: 5 } },
    { udf: 'udf_get_contact_change_requests',  params: { p_page_size: 5 } },
    { udf: 'udf_get_login_attempts',           params: { p_page_size: 5 } },
    { udf: 'udf_get_password_history',         params: { p_page_size: 5 } }
  ];

  for (const { udf, params } of readOnlyTargets) {
    try {
      const { rows, totalCount } = await db.callTableFunction(udf, params);
      record('happy', udf, true, `${rows.length} row(s), totalCount=${totalCount}`);
    } catch (err) {
      record('happy', udf, false, (err as Error).message.substring(0, 80));
    }
  }

  // ══════════════════════════════════════════════════════════
  // 2. BOUNDARY TESTS — pagination clamp
  // ══════════════════════════════════════════════════════════
  console.log('\n2. Pagination clamp boundaries (must never 500)\n');

  const boundaryCases = [
    { name: 'page_index=-5, page_size=-10',  params: { p_page_index: -5, p_page_size: -10 } },
    { name: 'page_index=0,  page_size=0',    params: { p_page_index: 0,  p_page_size: 0 } },
    { name: 'page_index=1,  page_size=5',    params: { p_page_index: 1,  p_page_size: 5 } },
    { name: 'page_index=99999, page_size=5', params: { p_page_index: 99999, p_page_size: 5 } },
    { name: 'page_size=9999 (cap at 100)',   params: { p_page_size: 9999 } }
  ];

  for (const { name, params } of boundaryCases) {
    try {
      const { rows, totalCount } = await db.callTableFunction('udf_get_countries', params);
      record('boundary', name, true, `rows=${rows.length}, total=${totalCount}`);
    } catch (err) {
      record('boundary', name, false, (err as Error).message.substring(0, 80));
    }
  }

  // Separate test: verify pageSize=9999 was actually clamped to ≤100.
  try {
    const { rows } = await db.callTableFunction('udf_get_countries', { p_page_size: 9999 });
    const clamped = rows.length <= 100;
    record('boundary', 'pageSize=9999 returned ≤100 rows (proof of clamp)', clamped, `rows=${rows.length}`);
  } catch (err) {
    record('boundary', 'pageSize=9999 clamp proof', false, (err as Error).message.substring(0, 80));
  }

  // ══════════════════════════════════════════════════════════
  // 3. LIVE ERROR PATHS via callFunction (fail-before-write)
  // ══════════════════════════════════════════════════════════
  console.log('\n3. Live error paths (mutations that fail BEFORE any write)\n');

  // 3a. NOT_FOUND — update nonexistent role
  {
    const res = await expectThrows(
      () => db.callFunction('udf_roles_update', { p_id: 999999, p_name: 'doesnotexist' }),
      (err) => err instanceof AppError && err.statusCode === 404,
      '404 NOT_FOUND'
    );
    record('error-path', 'udf_roles_update(p_id=999999) → 404 NOT_FOUND', res.ok, res.detail);
  }

  // 3b. NOT_FOUND — delete nonexistent permission
  {
    const res = await expectThrows(
      () => db.callFunction('udf_permissions_delete', { p_id: 999999 }),
      (err) => err instanceof AppError && err.statusCode === 404,
      '404 NOT_FOUND'
    );
    record('error-path', 'udf_permissions_delete(p_id=999999) → 404', res.ok, res.detail);
  }

  // 3c. NOT_FOUND — update nonexistent permission
  {
    const res = await expectThrows(
      () => db.callFunction('udf_permissions_update', { p_id: 999999, p_name: 'x' }),
      (err) => err instanceof AppError && err.statusCode === 404,
      '404 NOT_FOUND'
    );
    record('error-path', 'udf_permissions_update(p_id=999999) → 404', res.ok, res.detail);
  }

  // 3d. Check role 1 is present — inspect its system flag & try to change its code
  try {
    const roleOne = await db.query<{ id: number; name: string; is_system_role: boolean }>(
      'SELECT id, name, is_system_role FROM roles WHERE id = 1 AND is_deleted = FALSE'
    );
    if (roleOne.rowCount && roleOne.rows[0].is_system_role) {
      const res = await expectThrows(
        () => db.callFunction('udf_roles_update', { p_id: 1, p_code: 'attempted_change' }),
        (err) => err instanceof AppError && (err.statusCode === 403 || err.statusCode === 400),
        '403 FORBIDDEN (cannot change)'
      );
      record('error-path', 'udf_roles_update(system role code) → FORBIDDEN/VALIDATION', res.ok, res.detail);
    } else {
      record('error-path', 'system-role guard test (skipped: role 1 not system)', true, 'skipped');
    }
  } catch (err) {
    record('error-path', 'system-role guard inspection', false, (err as Error).message.substring(0, 80));
  }

  // ══════════════════════════════════════════════════════════
  // 4. parseUdfError — pure unit tests against canonical messages
  // ══════════════════════════════════════════════════════════
  console.log('\n4. parseUdfError mapping (pure unit tests)\n');

  const parseCases: Array<{ raw: string; expectedStatus: number; expectedCode: string }> = [
    {
      raw: 'duplicate key value violates unique constraint "uq_roles_code"',
      expectedStatus: 409,
      expectedCode: 'DUPLICATE_ENTRY'
    },
    {
      raw: 'A user with this email already exists.',
      expectedStatus: 409,
      expectedCode: 'ALREADY_EXISTS'
    },
    {
      raw: 'Role with ID 42 does not exist or is deleted.',
      expectedStatus: 404,
      expectedCode: 'NOT_FOUND'
    },
    {
      raw: 'User not found',
      expectedStatus: 404,
      expectedCode: 'NOT_FOUND'
    },
    {
      raw: 'Cannot delete a role that has active assignments.',
      expectedStatus: 403,
      expectedCode: 'FORBIDDEN'
    },
    {
      raw: 'Cannot change code of a system role.',
      expectedStatus: 403,
      expectedCode: 'FORBIDDEN'
    },
    {
      raw: 'Name cannot be empty.',
      expectedStatus: 400,
      expectedCode: 'VALIDATION_ERROR'
    },
    {
      raw: 'At least one field must be provided.',
      expectedStatus: 400,
      expectedCode: 'VALIDATION_ERROR'
    },
    {
      raw: 'Invalid permission code format.',
      expectedStatus: 400,
      expectedCode: 'VALIDATION_ERROR'
    },
    {
      raw: 'Some weird unmapped database error',
      expectedStatus: 400,
      expectedCode: 'UDF_ERROR'
    }
  ];

  for (const { raw, expectedStatus, expectedCode } of parseCases) {
    const actual = db.parseUdfError(raw);
    const ok = actual.statusCode === expectedStatus && actual.code === expectedCode;
    record(
      'parse',
      `"${raw.substring(0, 45)}${raw.length > 45 ? '…' : ''}"`,
      ok,
      `expected ${expectedStatus}/${expectedCode}, got ${actual.statusCode}/${actual.code}`
    );
  }

  // ══════════════════════════════════════════════════════════
  // 5. TRANSACTION HELPER — COMMIT + ROLLBACK
  // ══════════════════════════════════════════════════════════
  console.log('\n5. Transaction helper\n');

  // 5a. Commit path
  try {
    const result = await db.transaction(async (client) => {
      const r = await client.query<{ one: number }>('SELECT 1 AS one');
      return r.rows[0].one;
    });
    record('txn', 'COMMIT path returns callback value', result === 1, `returned ${result}`);
  } catch (err) {
    record('txn', 'COMMIT path', false, (err as Error).message.substring(0, 80));
  }

  // 5b. Rollback path — thrown error propagates out of transaction
  {
    const res = await expectThrows(
      () =>
        db.transaction(async (client) => {
          await client.query('SELECT 1');
          throw new Error('intentional rollback trigger');
        }),
      (err) => err instanceof Error && err.message.includes('intentional rollback'),
      'thrown error re-raised after ROLLBACK'
    );
    record('txn', 'ROLLBACK path re-raises the original error', res.ok, res.detail);
  }

  // 5c. Verify the pool still works after a rolled-back transaction
  try {
    const pool = getPool();
    const r = await pool.query<{ post: number }>('SELECT 99 AS post');
    record('txn', 'pool still healthy after rollback', r.rows[0].post === 99, `got ${r.rows[0].post}`);
  } catch (err) {
    record('txn', 'pool after rollback', false, (err as Error).message.substring(0, 80));
  }

  // ══════════════════════════════════════════════════════════
  // Shutdown + verdict
  // ══════════════════════════════════════════════════════════
  await closePool();

  const bySection = (section: string) => results.filter((r) => r.section === section);
  const sectionSummary = (section: string) => {
    const rows = bySection(section);
    const passed = rows.filter((r) => r.ok).length;
    return `${passed}/${rows.length}`;
  };

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  1. Happy paths     : ${sectionSummary('happy')}`);
  console.log(`  2. Boundary clamps : ${sectionSummary('boundary')}`);
  console.log(`  3. Error paths     : ${sectionSummary('error-path')}`);
  console.log(`  4. parseUdfError   : ${sectionSummary('parse')}`);
  console.log(`  5. Transaction     : ${sectionSummary('txn')}`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`  ──────────────────────────────`);
  console.log(`  Total              : ${passed}/${results.length}`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILED CHECKS:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - [${r.section}] ${r.name}: ${r.detail}`));
    process.exit(1);
  }

  console.log('All Step 3 database access layer checks passed.');
  process.exit(0);
}

main().catch((error) => {
  console.error('\nFatal error during db verification:');
  console.error(error);
  process.exit(1);
});
