// ═══════════════════════════════════════════════════════════════
// One-off: apply udf_auth_get_user_permissions to the live DB.
// Safe to re-run — uses CREATE OR REPLACE.
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

import { closePool, getPool } from '../src/database/pg-pool';

const SQL_PATH = path.resolve(
  __dirname,
  '../../phase-01-role-based-user-management/12-auth/22_fn_get_user_effective_permissions.sql'
);

const main = async (): Promise<void> => {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const pool = getPool();
  console.log(`▶ Applying ${path.basename(SQL_PATH)} …`);
  await pool.query(sql);
  console.log('✓ udf_auth_get_user_permissions applied');

  // Smoke test: call it for user id 1 (super admin) — should return many rows.
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM udf_auth_get_user_permissions(1)'
  );
  console.log(`  → super admin effective permissions: ${rows[0].n}`);
};

main()
  .catch((err) => {
    console.error('✗ Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
