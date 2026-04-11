import { closePool, getPool } from '../src/database/pg-pool';

const main = async (): Promise<void> => {
  const pool = getPool();
  const r = await pool.query<{ id: number; code: string; level: number }>(
    `SELECT id, code, level FROM roles WHERE is_active=true AND is_deleted=false ORDER BY level`
  );
  console.log('roles:');
  for (const row of r.rows) console.log(' ', row.id, row.level, row.code);
  await closePool();
};
main().catch(e => { console.error(e); process.exitCode = 1; closePool().catch(() => undefined); });
