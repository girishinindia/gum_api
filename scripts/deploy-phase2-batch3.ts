// ═══════════════════════════════════════════════════════════════
// deploy-phase2-batch3.ts
//
// Surgically applies the four new phase-02 modules
// (learning_goals, social_medias, categories, sub_categories) plus
// the updated permission seed, WITHOUT touching the nine previously
// deployed phase-02 tables (states / cities / skills / languages /
// education_levels / document_types / documents / designations /
// specializations).
//
// Strategy:
//   1. Pre-clean: drop tables and helper views/UDFs for the four
//      new modules ONLY. These modules are freshly minted, so any
//      leftover in the live DB for them is a dirty partial from an
//      earlier attempt and can be safely dropped.
//   2. Apply the module SQL files in dependency order:
//        · 11-learning-goals      (7 files)
//        · 12-social-medias       (7 files)
//        · 13-categories          (11 files — incl. translation UDFs)
//        · 14-sub-categories      (11 files — incl. translation UDFs)
//      Total: 36 files.
//   3. Apply the updated phase-02 permission seed (append-only for
//      the four new resources — helper is idempotent via
//      `ON CONFLICT (code) DO NOTHING`).
//   4. Print a short sanity report (tables, UDF count, permission
//      counts) so the operator can eyeball the result.
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { closePool, getPool } from '../src/database/pg-pool';

type ModuleDef = {
  folder: string;
  tables: string[];   // main table(s), in reverse-FK order for DROP
  files: string[];    // ordered SQL files within the folder
};

const SIMPLE_FILES = [
  '01_table.sql',
  '02_view.sql',
  '03_function.sql',
  '04_fn_insert.sql',
  '05_fn_update.sql',
  '06_fn_delete.sql',
  '07_fn_restore.sql'
];

const TRANSLATED_FILES = [
  ...SIMPLE_FILES,
  '08_fn_translation_insert.sql',
  '09_fn_translation_update.sql',
  '10_fn_translation_delete.sql',
  '11_fn_translation_restore.sql'
];

const MODULES: ModuleDef[] = [
  { folder: '11-learning-goals', tables: ['learning_goals'], files: SIMPLE_FILES },
  { folder: '12-social-medias',  tables: ['social_medias'],  files: SIMPLE_FILES },
  {
    folder: '13-categories',
    tables: ['category_translations', 'categories'],
    files: TRANSLATED_FILES
  },
  {
    folder: '14-sub-categories',
    tables: ['sub_category_translations', 'sub_categories'],
    files: TRANSLATED_FILES
  }
];

const PHASE_ROOT = resolve(__dirname, '../../phase-02-master-data-management');

const readSql = (moduleFolder: string, file: string): string =>
  readFileSync(resolve(PHASE_ROOT, moduleFolder, file), 'utf8');

const readRoot = (file: string): string =>
  readFileSync(resolve(PHASE_ROOT, file), 'utf8');

const UDF_NAMES = [
  // learning_goals
  'udf_get_learning_goals',
  'udf_learning_goals_insert',
  'udf_learning_goals_update',
  'udf_learning_goals_delete',
  'udf_learning_goals_restore',
  // social_medias
  'udf_get_social_medias',
  'udf_social_medias_insert',
  'udf_social_medias_update',
  'udf_social_medias_delete',
  'udf_social_medias_restore',
  // categories
  'udf_get_categories',
  'udf_get_category_translations',
  'udf_categories_insert',
  'udf_categories_update',
  'udf_categories_delete',
  'udf_categories_restore',
  'udf_category_translations_insert',
  'udf_category_translations_update',
  'udf_category_translations_delete',
  'udf_category_translations_restore',
  // sub_categories
  'udf_get_sub_categories',
  'udf_get_sub_category_translations',
  'udf_sub_categories_insert',
  'udf_sub_categories_update',
  'udf_sub_categories_delete',
  'udf_sub_categories_restore',
  'udf_sub_category_translations_insert',
  'udf_sub_category_translations_update',
  'udf_sub_category_translations_delete',
  'udf_sub_category_translations_restore'
];

const VIEW_NAMES = [
  'uv_learning_goals',
  'uv_social_medias',
  'uv_categories',
  'uv_category_translations',
  'uv_sub_categories',
  'uv_sub_category_translations'
];

const NEW_RESOURCES = ['learning_goal', 'social_media', 'category', 'sub_category'];

const main = async (): Promise<void> => {
  const pool = getPool();
  const t0 = Date.now();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' deploy-phase2-batch3');
  console.log(' Modules:', MODULES.map((m) => m.folder).join(', '));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── 1. Pre-clean ─────────────────────────────────────────────
  //
  // Drop in reverse FK order (children before parents, sub_categories
  // before categories because sub_categories.category_id → categories).
  // CASCADE also drops any dependent indexes / triggers / views.

  console.log('\n[1/4] Dropping stale artifacts (if any)…');

  const dropSql = `
    -- Drop tables in reverse FK dependency order
    DROP TABLE IF EXISTS sub_category_translations CASCADE;
    DROP TABLE IF EXISTS sub_categories CASCADE;
    DROP TABLE IF EXISTS category_translations CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
    DROP TABLE IF EXISTS social_medias CASCADE;
    DROP TABLE IF EXISTS learning_goals CASCADE;

    -- Drop helper views (recreated by 02_view.sql per module)
    ${VIEW_NAMES.map((v) => `DROP VIEW IF EXISTS ${v} CASCADE;`).join('\n    ')}

    -- Drop all UDFs for these four modules (any signature).
    -- Required because CREATE OR REPLACE FUNCTION cannot widen/narrow
    -- a RETURNS TABLE column set or change OUT params.
    ${UDF_NAMES.map((n) => `DROP FUNCTION IF EXISTS ${n} CASCADE;`).join('\n    ')}
  `;
  await pool.query(dropSql);
  console.log('      stale artifacts dropped');

  // ── 2. Apply new module SQL in sequence ────────────────────────

  const totalFiles = MODULES.reduce((acc, m) => acc + m.files.length, 0);
  console.log(`\n[2/4] Applying ${MODULES.length} modules = ${totalFiles} files…`);

  for (const mod of MODULES) {
    console.log(`  · ${mod.folder}`);
    for (const file of mod.files) {
      const sql = readSql(mod.folder, file);
      const start = Date.now();
      try {
        await pool.query(sql);
      } catch (err) {
        console.error(`    ✗ ${file} (${Date.now() - start}ms)`);
        throw err;
      }
      console.log(`    ✓ ${file} (${Date.now() - start}ms)`);
    }
    // Quick sanity: row count in each table.
    for (const table of mod.tables) {
      const { rows } = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::TEXT AS cnt FROM ${table}`
      );
      console.log(`    → ${table}: ${rows[0]?.cnt ?? 0} rows seeded`);
    }
  }

  // ── 3. Apply the updated phase-02 permission seed ──────────────

  console.log('\n[3/4] Applying 06_seed_permissions.sql (idempotent)…');
  const permStart = Date.now();
  await pool.query(readRoot('06_seed_permissions.sql'));
  console.log(`      applied in ${Date.now() - permStart}ms`);

  // ── 4. Sanity report ───────────────────────────────────────────

  console.log('\n[4/4] Sanity report');

  const expectedTables = [
    'learning_goals',
    'social_medias',
    'categories',
    'category_translations',
    'sub_categories',
    'sub_category_translations'
  ];

  const { rows: tables } = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::TEXT[])
      ORDER BY table_name`,
    [expectedTables]
  );
  console.log(
    `  tables present: ${tables.length}/${expectedTables.length} — ${tables
      .map((t) => t.table_name)
      .join(', ')}`
  );

  const { rows: fns } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::TEXT AS cnt
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1::TEXT[])`,
    [UDF_NAMES]
  );
  console.log(`  new UDFs present: ${fns[0]?.cnt ?? 0}/${UDF_NAMES.length}`);

  const { rows: views } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::TEXT AS cnt
       FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = ANY($1::TEXT[])`,
    [VIEW_NAMES]
  );
  console.log(`  new views present: ${views[0]?.cnt ?? 0}/${VIEW_NAMES.length}`);

  const { rows: perms } = await pool.query<{ resource: string; cnt: string }>(
    `SELECT resource, COUNT(*)::TEXT AS cnt
       FROM permissions
      WHERE resource = ANY($1::TEXT[])
        AND is_deleted = FALSE
      GROUP BY resource
      ORDER BY resource`,
    [NEW_RESOURCES]
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
        AND p.resource = ANY($1::TEXT[])
        AND rp.is_deleted = FALSE
      GROUP BY r.level
      ORDER BY r.level`,
    [NEW_RESOURCES]
  );
  for (const s of saAdminCheck) {
    // SA gets 20 (4 resources × 5 actions); Admin gets 16 (4 resources × 4, no delete)
    const expected = s.level === 0 ? 20 : 16;
    console.log(
      `  role.level=${s.level}: ${s.cnt}/${expected} of new phase-02 perms (${s.level === 0 ? 'Super Admin' : 'Admin'})`
    );
  }

  // Phase-02 total across all 13 resources (batch-1 + batch-2 + batch-3)
  const { rows: totalPerms } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::TEXT AS cnt
       FROM permissions
      WHERE resource IN (
              'state','city','skill','language','education_level',
              'document_type','document','designation','specialization',
              'learning_goal','social_media','category','sub_category'
            )
        AND is_deleted = FALSE`
  );
  console.log(`  phase-02 total permissions: ${totalPerms[0]?.cnt ?? 0}/65`);

  console.log(`\n  total elapsed: ${Date.now() - t0}ms`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await closePool();
};

main().catch(async (err) => {
  console.error('\n[deploy-phase2-batch3] FAILED:\n', err);
  await closePool().catch(() => undefined);
  process.exit(1);
});
