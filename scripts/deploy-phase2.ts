import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../src/database/pg-pool';

const main = async () => {
  const sql = readFileSync('../phase-02-master-data-management.sql', 'utf8');
  console.log(`Applying phase-02 schema (${(sql.length / 1024).toFixed(1)} KB)...`);
  const start = Date.now();
  await getPool().query(sql);
  console.log(`  applied in ${Date.now() - start}ms`);

  const { rows: tables } = await getPool().query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
        ('states','cities','skills','languages','education_levels')
      ORDER BY table_name`
  );
  console.log(`Tables now present: ${tables.map(t => t.table_name).join(', ')}`);

  const { rows: fns } = await getPool().query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.proname ~ '^udf_(get)?(states|cities|skills|languages|education_levels|get_skills|get_languages|get_education_levels)'`
  );
  console.log(`Phase-02 UDFs present: ${fns[0]?.cnt ?? 0}`);

  await closePool();
};
main().catch((err) => {
  console.error(err);
  closePool().catch(() => undefined);
  process.exit(1);
});
