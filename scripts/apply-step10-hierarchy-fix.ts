import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../src/database/pg-pool';

const files = [
  '../../phase-01-role-based-user-management/12-auth/02_fn_check_hierarchy.sql',
  '../../phase-01-role-based-user-management/04-users/06_fn_delete.sql',
  '../../phase-01-role-based-user-management/04-users/07_fn_restore.sql'
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
