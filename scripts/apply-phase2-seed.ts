import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../src/database/pg-pool';

const main = async () => {
  const sql = readFileSync(
    '../phase-02-master-data-management/06_seed_permissions.sql',
    'utf8'
  );
  console.log('Applying phase-02 permission seed...');
  await getPool().query(sql);

  // Verification query
  const { rows } = await getPool().query<{ resource: string; cnt: string }>(
    `SELECT resource, COUNT(*) AS cnt
       FROM permissions
      WHERE resource IN ('state', 'city', 'skill', 'language', 'education_level')
        AND is_deleted = FALSE
      GROUP BY resource
      ORDER BY resource`
  );
  console.log('Phase 2 permissions in catalogue:');
  for (const r of rows) console.log(`  ${r.resource.padEnd(18)} ${r.cnt}`);

  await closePool();
};

main().catch((err) => {
  console.error(err);
  closePool().catch(() => undefined);
  process.exit(1);
});
