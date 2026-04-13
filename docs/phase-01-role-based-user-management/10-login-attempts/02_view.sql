/**
 * ============================================================================
 * UV_LOGIN_ATTEMPTS VIEW
 * ============================================================================
 * Purpose:
 *   - Denormalize login_attempts with user details
 *   - Join to users table for first_name, last_name, email, mobile, role_id
 *   - Provides complete context for audit and analytics
 *   - Security invoker — caller permissions determine visible rows
 *
 * Depends:
 *   - login_attempts table
 *   - users table
 *
 * Usage:
 *   SELECT * FROM uv_login_attempts WHERE identifier = 'user@example.com';
 * ============================================================================
 */

CREATE VIEW uv_login_attempts WITH (security_invoker = true) AS
SELECT
  la.id,
  la.user_id,
  u.first_name,
  u.last_name,
  u.email,
  u.mobile,
  u.role_id,
  la.identifier,
  la.ip_address,
  la.user_agent,
  la.device_type,
  la.os,
  la.browser,
  la.status,
  la.failure_reason,
  la.blocked_until,
  la.attempted_at
FROM login_attempts la
LEFT JOIN users u ON la.user_id = u.id
ORDER BY la.attempted_at DESC;

-- ============================================================================
-- TESTING / EXAMPLES (uncomment to run)
-- ============================================================================

/*
-- View all login attempts with user details
SELECT * FROM uv_login_attempts LIMIT 10;

-- Find failed attempts for a specific user
SELECT id, email, identifier, status, failure_reason, attempted_at
  FROM uv_login_attempts
  WHERE user_id = 123 AND status = 'failed'
  ORDER BY attempted_at DESC
  LIMIT 20;

-- Find all currently blocked identifiers
SELECT DISTINCT identifier, first_name, last_name, email, blocked_until
  FROM uv_login_attempts
  WHERE status = 'blocked' AND blocked_until > CURRENT_TIMESTAMP
  ORDER BY blocked_until DESC;

-- Count attempts by device type for a user
SELECT device_type, COUNT(*) as attempt_count
  FROM uv_login_attempts
  WHERE user_id = 123
  GROUP BY device_type;
*/
