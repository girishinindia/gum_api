import { closePool, getPool } from '../src/database/pg-pool';

const main = async () => {
  // Check tables
  const { rows: tables } = await getPool().query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
        ('states','cities','skills','languages','education_levels')
      ORDER BY table_name`
  );
  console.log('TABLES:', tables.map(t => t.table_name).join(', '));

  // Check UDFs
  const { rows } = await getPool().query<{ proname: string; args: string }>(
    `SELECT p.proname,
            pg_get_function_arguments(p.oid) AS args
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND (p.proname ~ '^udf_(get)?states'
          OR p.proname ~ '^udf_(get)?cities'
          OR p.proname ~ '^udf_(get_)?skills'
          OR p.proname ~ '^udf_(get_)?languages'
          OR p.proname ~ '^udf_(get_)?education_levels')
      ORDER BY p.proname`
  );
  console.log('UDFs:');
  for (const r of rows) console.log(`  ${r.proname}(${r.args})`);
  await closePool();
};
main().catch((err) => { console.error(err); closePool().catch(() => undefined); process.exit(1); });
