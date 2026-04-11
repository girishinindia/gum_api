import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../src/database/pg-pool';

const files = [
  '../../phase-01-role-based-user-management/07-user-otps/05_fn_verify.sql',
  '../../phase-01-role-based-user-management/11-password-history/05_fn_check.sql',
  '../../phase-01-role-based-user-management/12-auth/07_fn_forgot_password_complete.sql',
  '../../phase-01-role-based-user-management/12-auth/09_fn_reset_password_complete.sql'
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
