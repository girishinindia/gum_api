/**
 * Redeploy the 3 list/get UDFs whose RETURNS TABLE had `CITEXT` changed to `TEXT`.
 * Postgres treats function identity as (name, arg-types) — return type is NOT part of identity,
 * but CREATE OR REPLACE FUNCTION rejects a return-type change. So we DROP first, then re-create.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { getPool, closePool } from '../src/database/pg-pool.js';

const PHASE_ROOT = path.resolve(__dirname, '../../phase-02-master-data-management');

// (relative path, full DROP signature to kill the old version — empty string if CREATE OR REPLACE is safe)
const TARGETS: Array<{ file: string; drop: string; label: string }> = [
  {
    file: '03_skills/03_function.sql',
    drop: `DROP FUNCTION IF EXISTS udf_get_skills(
      BIGINT, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, INT, INT
    );`,
    label: 'udf_get_skills'
  },
  {
    file: '04_languages/03_function.sql',
    drop: `DROP FUNCTION IF EXISTS udf_get_languages(
      BIGINT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, INT, INT
    );`,
    label: 'udf_get_languages'
  },
  {
    file: '05_education-levels/03_function.sql',
    drop: `DROP FUNCTION IF EXISTS udf_get_education_levels(
      BIGINT, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, INT, INT
    );`,
    label: 'udf_get_education_levels'
  },
  {
    // Iso-code duplicate guard added — same signature, plain CREATE OR REPLACE
    file: '04_languages/04_fn_insert.sql',
    drop: '',
    label: 'udf_languages_insert (iso_code dup guard)'
  },
  {
    // Iso-code duplicate guard added — same signature, plain CREATE OR REPLACE
    file: '04_languages/05_fn_update.sql',
    drop: '',
    label: 'udf_languages_update (iso_code dup guard)'
  }
];

async function main() {
  const pool = getPool();
  for (const t of TARGETS) {
    const full = path.join(PHASE_ROOT, t.file);
    const body = await readFile(full, 'utf-8');
    process.stdout.write(`  → ${t.label} ... `);
    if (t.drop) await pool.query(t.drop);
    await pool.query(body);
    console.log('OK');
  }
  await closePool();
}

main().catch((err) => {
  console.error('Redeploy failed:', err);
  process.exit(1);
});
