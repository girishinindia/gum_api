// One-shot migration: reload udf_auth_login with the enriched
// failure payload (failure_reason + user_id added to the
// account-not-verified branch so the Node login() wrapper can
// return 403 ACCOUNT_NOT_VERIFIED with structured details).
//
// Usage: `npx tsx scripts/apply-login-udf-fix.ts` from api/.

import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../src/database/pg-pool';

const files = [
  '../../phase-01-role-based-user-management/12-auth/04_fn_login.sql'
];

const main = async (): Promise<void> => {
  const pool = getPool();
  for (const f of files) {
    const sql = readFileSync(new URL(f, import.meta.url), 'utf8');
    process.stdout.write(`applying ${f} ... `);
    await pool.query(sql);
    process.stdout.write('ok\n');
  }
  await closePool();
};

main().catch((err) => {
  console.error('FAILED', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
});
