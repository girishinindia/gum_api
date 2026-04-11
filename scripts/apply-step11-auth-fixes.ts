import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../src/database/pg-pool';

const files = [
  '../../phase-01-role-based-user-management/12-auth/02_fn_check_hierarchy.sql',
  '../../phase-01-role-based-user-management/12-auth/16_fn_change_role.sql',
  '../../phase-01-role-based-user-management/12-auth/17_fn_set_verification.sql',
  '../../phase-01-role-based-user-management/12-auth/18_fn_deactivate.sql'
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
