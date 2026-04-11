/* eslint-disable no-console */
/**
 * One-off: re-apply the 5 udf_get_* functions that had citext/text
 * RETURNS TABLE mismatches. Each is DROP'd first because CREATE OR REPLACE
 * cannot change the return type.
 */

import fs from 'node:fs';
import path from 'node:path';

import { closePool, getPool } from '../src/database/pg-pool';

const REPO_ROOT = path.resolve(__dirname, '../..');

type Target = {
  label: string;
  file: string;
  // Full signature used in DROP FUNCTION — types must match CREATE exactly.
  dropSignature: string;
};

const targets: Target[] = [
  {
    label: 'udf_get_otps',
    file: 'phase-01-role-based-user-management/07-user-otps/03_fn_view.sql',
    dropSignature:
      'udf_get_otps(BIGINT, BIGINT, otp_purpose, otp_channel, otp_status, TEXT, TEXT, TEXT, INTEGER, INTEGER)'
  },
  {
    label: 'udf_get_sessions',
    file: 'phase-01-role-based-user-management/08-user-sessions/03_fn_view.sql',
    dropSignature:
      'udf_get_sessions(BIGINT, BIGINT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER)'
  },
  {
    label: 'udf_get_contact_change_requests',
    file: 'phase-01-role-based-user-management/09-contact-change-requests/03_fn_view.sql',
    dropSignature:
      'udf_get_contact_change_requests(BIGINT, BIGINT, contact_change_type, contact_change_status, TEXT, TEXT, TEXT, INT, INT)'
  },
  {
    label: 'udf_get_login_attempts',
    file: 'phase-01-role-based-user-management/10-login-attempts/03_fn_view.sql',
    dropSignature:
      'udf_get_login_attempts(BIGINT, BIGINT, TEXT, login_attempt_status, INET, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, INT, INT)'
  },
  {
    label: 'udf_get_password_history',
    file: 'phase-01-role-based-user-management/11-password-history/03_fn_view.sql',
    dropSignature:
      'udf_get_password_history(BIGINT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INT, INT)'
  }
];

async function main(): Promise<void> {
  const pool = getPool();

  console.log('\nApplying citext/text fixes to 5 udf_get_* functions\n');

  for (const target of targets) {
    const abs = path.resolve(REPO_ROOT, target.file);
    if (!fs.existsSync(abs)) {
      console.log(`  ✖  ${target.label}: source file missing at ${abs}`);
      process.exitCode = 1;
      continue;
    }
    const sql = fs.readFileSync(abs, 'utf8');

    const client = await pool.connect();
    try {
      await client.query(`DROP FUNCTION IF EXISTS ${target.dropSignature};`);
      await client.query(sql);
      console.log(`  ✔  ${target.label} re-created`);
    } catch (err) {
      console.log(`  ✖  ${target.label}: ${(err as Error).message}`);
      process.exitCode = 1;
    } finally {
      client.release();
    }
  }

  await closePool();
  console.log('\nDone.');
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await closePool().catch(() => undefined);
  process.exit(1);
});
