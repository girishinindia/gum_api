/* eslint-disable no-console */
/**
 * Step 2 — fail-fast verification.
 *
 * Deliberately corrupt required env vars in-process BEFORE importing
 * src/config/env, then verify the env module calls process.exit(1)
 * with a helpful error message. This is what protects production
 * from silent misconfiguration.
 *
 * Run via: npx tsx scripts/verify-failfast.ts
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Note: dotenv respects existing process.env values and won't overwrite them,
// so setting '' (empty string) is the right way to simulate "missing" here —
// the empty string survives into the child, and Zod's .min(1) rejects it.
const cases: Array<{ name: string; mutate: Record<string, string> }> = [
  {
    name: 'Empty DATABASE_URL',
    mutate: { DATABASE_URL: '' }
  },
  {
    name: 'JWT_ACCESS_SECRET too short (< 32 chars)',
    mutate: { JWT_ACCESS_SECRET: 'too-short' }
  },
  {
    name: 'Invalid RECAPTCHA_ENABLED (not true/false)',
    mutate: { RECAPTCHA_ENABLED: 'maybe' }
  },
  {
    name: 'Empty SUPABASE_URL',
    mutate: { SUPABASE_URL: '' }
  },
  {
    name: 'Invalid EMAIL_FROM (not an email)',
    mutate: { EMAIL_FROM: 'not-an-email' }
  },
  {
    name: 'Non-numeric PORT',
    mutate: { PORT: 'banana' }
  }
];

// We require the COMPILED env module (dist/) so we can spawn plain `node`
// instead of tsx. That keeps the fail-fast test dependency-free.
// Prerequisite: `npm run build` has been run at least once.
const compiledEnvPath = path
  .resolve(__dirname, '../dist/config/env')
  .replace(/\\\\/g, '/');

const scriptBody = `
try {
  require('${compiledEnvPath}');
  console.log('DID_NOT_EXIT');
  process.exit(0);
} catch (e) {
  console.log('THREW:', e.message);
  process.exit(2);
}
`;

console.log('\n══════════════════════════════════════════════════════');
console.log('  Step 2 — Env fail-fast verification');
console.log('══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  const childEnv = { ...process.env, ...testCase.mutate };

  const result = spawnSync(
    'node',
    ['-e', scriptBody],
    { env: childEnv, encoding: 'utf8' }
  );

  const combined = `${result.stdout}${result.stderr}`;
  const didFailFast = result.status === 1 && combined.includes('FATAL: Invalid environment variables');

  if (didFailFast) {
    console.log(`  ✔  ${testCase.name}`);
    passed++;
  } else {
    console.log(`  ✖  ${testCase.name}`);
    console.log(`       exit=${result.status}`);
    console.log(`       stdout: ${result.stdout.trim().substring(0, 200)}`);
    console.log(`       stderr: ${result.stderr.trim().substring(0, 200)}`);
    failed++;
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log(`  Passed: ${passed}   Failed: ${failed}`);
console.log('══════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
