import { closePool, getPool } from '../src/database/pg-pool';

const main = async () => {
  const pool = getPool();
  const u = await pool.query(
    `SELECT id, email, mobile, is_email_verified, is_mobile_verified, is_active, is_deleted FROM users WHERE id = 57`
  );
  console.log('USER 57:', JSON.stringify(u.rows, null, 2));

  const o = await pool.query(
    `SELECT id, purpose::TEXT, channel::TEXT, status::TEXT, expires_at, resend_available_at, resend_count, cooldown_until, created_at
       FROM user_otps WHERE user_id = 57 ORDER BY created_at DESC`
  );
  console.log('OTPs:', JSON.stringify(o.rows, null, 2));
  await closePool();
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
