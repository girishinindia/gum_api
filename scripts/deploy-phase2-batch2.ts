// ═══════════════════════════════════════════════════════════════
// deploy-phase2-batch2.ts
//
// Surgically applies the four new phase-02 modules
// (document_types, documents, designations, specializations) plus
// the updated permission seed, WITHOUT touching the existing
// batch-1 tables (states / cities / skills / languages /
// education_levels) which are already deployed.
//
// Strategy:
//   1. Pre-clean: drop tables and helper view/UDFs for the four new
//      modules ONLY. These modules are freshly minted, so anything
//      currently in the live DB for them is a dirty partial leftover
//      from an earlier attempt and can be safely dropped.
//   2. Apply the 28 SQL files (tables → views → list UDFs → mutation
//      UDFs → restore UDFs) for each new module in order.
//   3. Apply the updated phase-02 permission seed (append-only for
//      the four new resources — the helper is idempotent via
//      `ON CONFLICT (code) DO NOTHING`).
//   4. Print a short sanity report (tables, UDF count, permission
//      counts) so the operator can eyeball the result.
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { closePool, getPool } from '../src/database/pg-pool';

const MODULES: Array<{ folder: string; table: string }> = [
  { folder: '07-document-types', table: 'document_types' },
  { folder: '08-documents', table: 'documents' },
  { folder: '09-designations', table: 'designations' },
  { folder: '10-specializations', table: 'specializations' }
];

const PHASE_ROOT = resolve(__dirname, '../../phase-02-master-data-management');

const readSql = (moduleFolder: string, file: string): string =>
  readFileSync(resolve(PHASE_ROOT, moduleFolder, file), 'utf8');

const readRoot = (file: string): string =>
  readFileSync(resolve(PHASE_ROOT, file), 'utf8');

const UDF_NAMES = [
  // document_types
  'udf_get_document_types',
  'udf_document_types_insert',
  'udf_document_types_update',
  'udf_document_types_delete',
  'udf_document_types_restore',
  // documents
  'udf_get_documents',
  'udf_documents_insert',
  'udf_documents_update',
  'udf_documents_delete',
  'udf_documents_restore',
  // designations
  'udf_get_designations',
  'udf_designations_insert',
  'udf_designations_update',
  'udf_designations_delete',
  'udf_designations_restore',
  // specializations
  'udf_get_specializations',
  'udf_specializations_insert',
  'udf_specializations_update',
  'udf_specializations_delete',
  'udf_specializations_restore'
];

const main = async (): Promise<void> => {
  const pool = getPool();
  const t0 = Date.now();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' deploy-phase2-batch2');
  console.log(' Modules:', MODULES.map((m) => m.table).join(', '));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── 1. Pre-clean: drop any stale artifacts for these four modules ──
  //
  // The tables are brand new to the live DB, so dropping them is a
  // clean slate. We drop in reverse FK order (documents → document_types)
  // so dependency checks don't fire. We also drop the UDFs explicitly
  // because changing a RETURNS TABLE column set requires a DROP first
  // (CREATE OR REPLACE cannot widen/narrow the signature).

  console.log('\n[1/4] Dropping stale artifacts (if any)…');

  const dropSql = `
    -- Drop tables in reverse FK order so children go before parents
    DROP TABLE IF EXISTS specializations CASCADE;
    DROP TABLE IF EXISTS designations CASCADE;
    DROP TABLE IF EXISTS documents CASCADE;
    DROP TABLE IF EXISTS document_types CASCADE;

    -- Drop helper views if they exist (recreated by 02_view.sql)
    DROP VIEW IF EXISTS uv_specializations CASCADE;
    DROP VIEW IF EXISTS uv_designations CASCADE;
    DROP VIEW IF EXISTS uv_documents CASCADE;
    DROP VIEW IF EXISTS uv_document_types CASCADE;

    -- Drop all UDFs for these four modules (any signature)
    ${UDF_NAMES.map((n) => `DROP FUNCTION IF EXISTS ${n} CASCADE;`).join('\n    ')}
  `;
  await pool.query(dropSql);
  console.log('      stale artifacts dropped');

  // ── 2. Apply new module SQL in sequence ────────────────────────
  //
  // Per module: table → view → list UDF → insert → update → delete → restore

  console.log('\n[2/4] Applying 4 modules × 7 files = 28 files…');

  const files = [
    '01_table.sql',
    '02_view.sql',
    '03_function.sql',
    '04_fn_insert.sql',
    '05_fn_update.sql',
    '06_fn_delete.sql',
    '07_fn_restore.sql'
  ];

  for (const { folder, table } of MODULES) {
    console.log(`  · ${folder}`);
    for (const file of files) {
      const sql = readSql(folder, file);
      const start = Date.now();
      try {
        await pool.query(sql);
      } catch (err) {
        console.error(`    ✗ ${file} (${Date.now() - start}ms)`);
        throw err;
      }
      console.log(`    ✓ ${file} (${Date.now() - start}ms)`);
    }
    // Quick sanity: row count in the new table (after seed).
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::TEXT AS cnt FROM ${table}`
    );
    console.log(`    → ${table}: ${rows[0]?.cnt ?? 0} rows seeded`);
  }

  // ── 3. Apply the updated phase-02 permission seed ──────────────
  //
  // The underlying helper `udf_auto_create_resource_permissions`
  // uses `ON CONFLICT (code) DO NOTHING`, so re-running the full
  // seed file is idempotent for the five batch-1 resources as well
  // as the four new ones.

  console.log('\n[3/4] Applying 06_seed_permissions.sql (idempotent)…');
  const permStart = Date.now();
  await pool.query(readRoot('06_seed_permissions.sql'));
  console.log(`      applied in ${Date.now() - permStart}ms`);

  // ── 4. Sanity report ───────────────────────────────────────────

  console.log('\n[4/4] Sanity report');

  const { rows: tables } = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('document_types','documents','designations','specializations')
      ORDER BY table_name`
  );
  console.log(`  tables: ${tables.map((t) => t.table_name).join(', ')}`);

  const { rows: fns } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::TEXT AS cnt
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1::TEXT[])`,
    [UDF_NAMES]
  );
  console.log(`  new UDFs present: ${fns[0]?.cnt ?? 0}/${UDF_NAMES.length}`);

  const { rows: perms } = await pool.query<{ resource: string; cnt: string }>(
    `SELECT resource, COUNT(*)::TEXT AS cnt
       FROM permissions
      WHERE resource IN ('document_type','document','designation','specialization')
        AND is_deleted = FALSE
      GROUP BY resource
      ORDER BY resource`
  );
  for (const p of perms) {
    console.log(`  permission ${p.resource}: ${p.cnt}/5`);
  }

  const { rows: saAdminCheck } = await pool.query<{ level: number; cnt: string }>(
    `SELECT r.level, COUNT(*)::TEXT AS cnt
       FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.id
       JOIN roles       r ON rp.role_id       = r.id
      WHERE r.level IN (0, 1)
        AND p.resource IN ('document_type','document','designation','specialization')
        AND rp.is_deleted = FALSE
      GROUP BY r.level
      ORDER BY r.level`
  );
  for (const s of saAdminCheck) {
    const expected = s.level === 0 ? 20 : 16; // SA gets 20; Admin gets 16 (no delete)
    console.log(
      `  role.level=${s.level}: ${s.cnt}/${expected} of new phase-02 perms (${s.level === 0 ? 'Super Admin' : 'Admin'})`
    );
  }

  console.log(`\n  total elapsed: ${Date.now() - t0}ms`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await closePool();
};

main().catch(async (err) => {
  console.error('\n[deploy-phase2-batch2] FAILED:\n', err);
  await closePool().catch(() => undefined);
  process.exit(1);
});
