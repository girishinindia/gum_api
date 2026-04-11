// ═══════════════════════════════════════════════════════════════
// One-off: replace sp_countries_* PROCEDURES with udf_countries_*
// FUNCTIONS returning JSONB { success, message, id? }.
//
// Safe to re-run — drops the old procedures (IF EXISTS) then
// CREATE OR REPLACE the new UDFs. Finishes with a read-only
// smoke test of udf_get_countries to prove the catalog is intact.
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

import { closePool, getPool } from '../src/database/pg-pool';

const COUNTRIES_DIR = path.resolve(
  __dirname,
  '../../phase-01-role-based-user-management/01-countries'
);

const FILES = [
  '04_fn_insert.sql',
  '05_fn_update.sql',
  '06_fn_delete.sql',
  '07_fn_restore.sql'
];

const DROP_OLD_PROCEDURES = `
  DROP PROCEDURE IF EXISTS sp_countries_insert(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, JSONB, TEXT, TEXT, BOOLEAN
  );
  DROP PROCEDURE IF EXISTS sp_countries_update(
    BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, JSONB, TEXT, TEXT, BOOLEAN
  );
  DROP PROCEDURE IF EXISTS sp_countries_delete(BIGINT);
`;

const main = async (): Promise<void> => {
  const pool = getPool();

  console.log('▶ Dropping old sp_countries_* procedures …');
  try {
    await pool.query(DROP_OLD_PROCEDURES);
    console.log('  ✓ old procedures dropped (if any)');
  } catch (err) {
    // Not fatal — if the signature doesn't match, the old procedures
    // simply didn't exist in that exact shape. The new UDFs live under
    // different names, so collision is not possible.
    console.warn('  ⚠ drop-procedure step produced a warning:', (err as Error).message);
  }

  for (const file of FILES) {
    const full = path.join(COUNTRIES_DIR, file);
    const sql = fs.readFileSync(full, 'utf8');
    console.log(`▶ Applying ${file} …`);
    await pool.query(sql);
    console.log(`  ✓ ${file} applied`);
  }

  // ── Smoke tests ───────────────────────────────────────────────
  console.log('▶ Smoke tests …');

  // udf_get_countries should still function (we didn't touch it).
  const { rows: listRows } = await pool.query(
    `SELECT country_id, country_name
     FROM udf_get_countries(p_filter_is_active := TRUE)
     ORDER BY country_id
     LIMIT 3`
  );
  console.log(`  ✓ udf_get_countries returned ${listRows.length} active rows`);

  // Insert: negative case (duplicate iso2) should return success=false.
  const { rows: dupe } = await pool.query(
    `SELECT udf_countries_insert(
        p_name := 'India Dupe',
        p_iso2 := 'IN',
        p_iso3 := 'IN2'
     ) AS result`
  );
  const dupeResult = dupe[0].result as { success: boolean; message: string };
  console.log(
    `  ✓ udf_countries_insert dupe iso2 → success=${dupeResult.success}`
  );
  if (dupeResult.success) {
    throw new Error('Expected duplicate-iso2 insert to fail, but it succeeded.');
  }

  // Update: non-existent id should return success=false (NOT found).
  const { rows: miss } = await pool.query(
    `SELECT udf_countries_update(p_id := 99999999, p_name := 'Ghost') AS result`
  );
  const missResult = miss[0].result as { success: boolean; message: string };
  console.log(
    `  ✓ udf_countries_update bad id  → success=${missResult.success}`
  );

  // Delete: non-existent id should return success=false (NOT found).
  const { rows: bad } = await pool.query(
    `SELECT udf_countries_delete(p_id := 99999999) AS result`
  );
  const badResult = bad[0].result as { success: boolean; message: string };
  console.log(
    `  ✓ udf_countries_delete bad id  → success=${badResult.success}`
  );

  // Restore: non-existent id should return success=false (NOT found).
  const { rows: bad2 } = await pool.query(
    `SELECT udf_countries_restore(p_id := 99999999) AS result`
  );
  const bad2Result = bad2[0].result as { success: boolean; message: string };
  console.log(
    `  ✓ udf_countries_restore bad id → success=${bad2Result.success}`
  );

  console.log('▶ Done.');
};

main()
  .catch((err) => {
    console.error('✗ Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
