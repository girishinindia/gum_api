-- ============================================================================
-- user_otps Security View (uv_user_otps)
-- ============================================================================
-- Purpose: Safe view for querying OTP records without exposing otp_hash.
--          Joins with users table to provide user context (name, email, mobile).
--
-- Depends: user_otps table, users table
--
-- Usage: SELECT FROM uv_user_otps to display OTP records in logs, admin panels.
--        Never expose otp_hash; only safe fields visible.
--
-- Security: security_invoker = true; hash never exposed
-- ============================================================================

CREATE VIEW uv_user_otps WITH (security_invoker = true) AS
SELECT
    uo.id,
    uo.user_id,
    u.first_name,
    u.last_name,
    u.email AS user_email,
    u.mobile AS user_mobile,
    uo.purpose,
    uo.channel,
    uo.destination,
    -- otp_hash intentionally excluded
    uo.status,
    uo.expires_at,
    uo.resend_available_at,
    uo.attempts_count,
    uo.max_attempts,
    uo.resend_count,
    uo.max_resend,
    uo.cooldown_until,
    uo.verified_at,
    uo.used_at,
    uo.created_at,
    uo.updated_at
FROM user_otps uo
INNER JOIN users u ON uo.user_id = u.id;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================
/*

-- Verify view definition
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name = 'uv_user_otps'
ORDER BY ordinal_position;

-- Ensure otp_hash is not exposed
SELECT column_name FROM information_schema.columns
WHERE table_name = 'uv_user_otps' AND column_name = 'otp_hash';
-- Should return 0 rows

-- Test view query (sample)
-- SELECT * FROM uv_user_otps LIMIT 5;

-- Verify security_invoker setting
SELECT table_name, with_security_invoker
FROM pg_views
WHERE table_name = 'uv_user_otps';

*/
