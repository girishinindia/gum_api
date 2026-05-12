#!/usr/bin/env node
/**
 * Post-install type patch
 * ───────────────────────
 * Narrows Express ParamsDictionary from `string | string[]` to `string`.
 *
 * Express 4 route params are always strings for named params (:id, :slug),
 * but @types/express-serve-static-core >=5.0.1 added `string[]` for
 * forward-compatibility with Express 5. This causes 635+ TS2345 errors
 * in our codebase. This script patches the type after npm install.
 *
 * Run: node scripts/patch-types.js  (called automatically via postinstall)
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname, '..', 'node_modules', '@types',
  'express-serve-static-core', 'index.d.ts'
);

if (!fs.existsSync(file)) {
  console.log('[patch-types] @types/express-serve-static-core not found — skipping');
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');
const before = '    [key: string]: string | string[];';
const after  = '    [key: string]: string;';

if (content.includes(before)) {
  content = content.replace(before, after);
  fs.writeFileSync(file, content, 'utf8');
  console.log('[patch-types] Patched ParamsDictionary: string | string[] → string');
} else if (content.includes(after)) {
  console.log('[patch-types] Already patched');
} else {
  console.log('[patch-types] ParamsDictionary signature not found — manual check needed');
}
