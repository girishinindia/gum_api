#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * lint-sql.mjs — Supabase Data-API grant enforcement
 *
 * Scans every SQL file under `sql/` (recursively) and rejects the build if
 * any `CREATE TABLE public.<name>` is missing one or more of the three
 * required Data-API grants:
 *
 *   GRANT … ON public.<name> TO anon
 *   GRANT … ON public.<name> TO authenticated
 *   GRANT … ON public.<name> TO service_role
 *
 * Why this matters:
 *   • From 2026-05-30 (new projects) and 2026-10-30 (existing projects),
 *     Supabase no longer auto-grants new public-schema tables. Tables
 *     without explicit grants are invisible to supabase-js / PostgREST.
 *   • The lint runs in CI so missing grants are caught before merge — no
 *     more "table works locally but returns 42501 in prod" surprises.
 *
 * Allowed escape hatch — fully internal tables:
 *   If a table is intentionally hidden from the Data API (queue, log,
 *   internal cache), follow the GRANT for service_role with an explicit
 *   REVOKE from anon and authenticated. The lint detects the REVOKE and
 *   skips the anon/auth checks for that table:
 *
 *     grant select, insert, update, delete on public.internal_q to service_role;
 *     revoke all on public.internal_q from anon, authenticated;
 *
 * Per-file opt-out:
 *   Add `-- lint-sql: skip` on its own line anywhere in the file. Useful
 *   for legacy or read-only baseline dumps.
 *
 * Exit codes:
 *   0  → all checked tables are compliant
 *   1  → one or more violations; details printed to stderr
 *   2  → unexpected error (bad path, I/O issue)
 *
 * Run: `npm run lint:sql` (also wired into GitHub Actions ci.yml).
 *
 * No external deps. Pure Node 18+ (uses fs.promises + path).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_ROOT = path.resolve(__dirname, '..', 'sql');

// `CREATE TABLE [IF NOT EXISTS] public.<ident> (` — also tolerates
// double-quoted identifiers and a leading schema-less `public.`.
const CREATE_TABLE_RE =
  /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(?:"?([A-Za-z_][A-Za-z0-9_]*)"?)\s*[(]/gi;

// Match `GRANT … ON public.<table> TO <role>` — role is captured.
const grantRegex = (tableName) => new RegExp(
  '\\bgrant\\s+[a-z, \\t\\n*]+on\\s+(?:public\\.)?"?' +
    escapeRegex(tableName) +
    '"?\\s+to\\s+([^;]+);',
  'gi',
);

// Match `REVOKE … ON public.<table> FROM …` — used as the opt-out signal.
const revokeRegex = (tableName) => new RegExp(
  '\\brevoke\\s+[a-z, \\t\\n*]+on\\s+(?:public\\.)?"?' +
    escapeRegex(tableName) +
    '"?\\s+from\\s+([^;]+);',
  'gi',
);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Recursively walk SQL_ROOT and return every `.sql` file. */
async function listSqlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...await listSqlFiles(full));
    } else if (e.isFile() && full.toLowerCase().endsWith('.sql')) {
      files.push(full);
    }
  }
  return files.sort();
}

/** Strip line + block comments so they don't confuse the regex passes. */
function stripComments(sql) {
  // Remove `-- …` to end-of-line (preserving the newline so line counts stay close).
  let out = sql.replace(/--[^\r\n]*/g, '');
  // Remove `/* … */` (non-greedy, multi-line).
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  return out;
}

/**
 * Inspect one file. Returns an array of human-readable violation strings.
 * Empty array == file is clean.
 */
async function lintFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  if (/--\s*lint-sql:\s*skip\b/i.test(raw)) return [];

  const sql = stripComments(raw);
  const violations = [];

  // Pull every CREATE TABLE public.X out of this file.
  const tables = new Set();
  for (const m of sql.matchAll(CREATE_TABLE_RE)) {
    tables.add(m[1]);
  }
  if (tables.size === 0) return [];

  for (const t of tables) {
    // Skip the per-file template skeleton — its example placeholder names
    // (your_table, foo) are obviously not real.
    if (t === 'your_table' || t === 'foo') continue;

    // Find all GRANT and REVOKE statements that target this exact table.
    const grantedTo = new Set();
    for (const g of sql.matchAll(grantRegex(t))) {
      const rolesPart = g[1] || '';
      for (const role of rolesPart.split(',').map((s) => s.trim().toLowerCase())) {
        if (role) grantedTo.add(role);
      }
    }
    const revokedFrom = new Set();
    for (const r of sql.matchAll(revokeRegex(t))) {
      const rolesPart = r[1] || '';
      for (const role of rolesPart.split(',').map((s) => s.trim().toLowerCase())) {
        if (role) revokedFrom.add(role);
      }
    }

    // service_role grant is ALWAYS required — even internal tables need
    // gum_api to be able to write to them via the service key.
    if (!grantedTo.has('service_role')) {
      violations.push(`table "${t}": missing  GRANT … ON public.${t} TO service_role`);
    }
    // anon / authenticated are required UNLESS explicitly revoked
    // (internal-table opt-out).
    if (!grantedTo.has('anon') && !revokedFrom.has('anon')) {
      violations.push(`table "${t}": missing  GRANT … ON public.${t} TO anon  (or REVOKE … FROM anon for internal tables)`);
    }
    if (!grantedTo.has('authenticated') && !revokedFrom.has('authenticated')) {
      violations.push(`table "${t}": missing  GRANT … ON public.${t} TO authenticated  (or REVOKE … FROM authenticated for internal tables)`);
    }
  }

  return violations;
}

async function main() {
  let files;
  try {
    files = await listSqlFiles(SQL_ROOT);
  } catch (err) {
    console.error(`[lint-sql] cannot read ${SQL_ROOT}: ${err.message}`);
    process.exit(2);
  }

  let totalViolations = 0;
  let filesWithViolations = 0;

  for (const file of files) {
    let v;
    try {
      v = await lintFile(file);
    } catch (err) {
      console.error(`[lint-sql] failed to read ${file}: ${err.message}`);
      process.exit(2);
    }
    if (v.length === 0) continue;
    filesWithViolations++;
    totalViolations += v.length;
    const rel = path.relative(process.cwd(), file);
    console.error(`\n✖ ${rel}`);
    for (const line of v) console.error(`    ${line}`);
  }

  if (totalViolations === 0) {
    console.log(`[lint-sql] ✓ scanned ${files.length} file(s) — all CREATE TABLE statements have the required GRANTs.`);
    process.exit(0);
  }
  console.error(`\n[lint-sql] ✗ ${totalViolations} violation(s) across ${filesWithViolations} file(s).`);
  console.error(`           Fix: copy sql/templates/new-table.sql and follow docs/MIGRATIONS.md.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`[lint-sql] unexpected error:`, err);
  process.exit(2);
});
