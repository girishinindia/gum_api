import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../src/database/pg-pool';

// Apply the OTP destination E.164 formatting fixes:
//   - reset_password_initiate now joins countries.phone_code
//   - forgot_password_initiate now joins countries.phone_code
//   - change_mobile_initiate now joins countries.phone_code
// All three build the OTP destination as `phone_code || mobile`
// (e.g. "+919662278990") so the SMS gateway receives a fully
// qualified number regardless of the user's country.

// IMPORTANT: the helper udf_format_mobile_e164 must be applied
// FIRST since the four *_initiate UDFs reference it.
const files = [
  '../../phase-01-role-based-user-management/07-user-otps/09_fn_format_destination.sql',
  '../../phase-01-role-based-user-management/12-auth/03_fn_register.sql',
  '../../phase-01-role-based-user-management/12-auth/06_fn_forgot_password_initiate.sql',
  '../../phase-01-role-based-user-management/12-auth/08_fn_reset_password_initiate.sql',
  '../../phase-01-role-based-user-management/12-auth/12_fn_change_mobile_initiate.sql'
];

const main = async (): Promise<void> => {
  const pool = getPool();
  for (const f of files) {
    const sql = readFileSync(new URL(f, import.meta.url), 'utf8');
    process.stdout.write(`applying ${f} ... `);
    await pool.query(sql);
    process.stdout.write('ok\n');
  }
  await closePool();
};

main().catch((err) => {
  console.error('FAILED', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
});
