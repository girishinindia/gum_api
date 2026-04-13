-- ============================================================================
-- VIEW: uv_password_history
-- ============================================================================
-- Purpose:
--   Unified password history view with user details joined in.
--   NEVER includes password_hash to prevent accidental exposure.
--   security_invoker = true ensures row-level security is evaluated at query time.
--
-- Depends:
--   - password_history table
--   - users table
--
-- Usage:
--   SELECT * FROM uv_password_history WHERE user_id = 123 ORDER BY created_at DESC;
--   SELECT * FROM uv_password_history WHERE user_first_name ILIKE '%john%';
--
-- ============================================================================

CREATE OR REPLACE VIEW uv_password_history WITH (security_invoker = true) AS
SELECT
  ph.id,
  ph.user_id,
  u_target.first_name AS user_first_name,
  u_target.last_name AS user_last_name,
  u_target.email AS user_email,
  ph.changed_by,
  u_changer.email AS changed_by_email,
  ph.change_reason,
  ph.created_at
FROM password_history ph
INNER JOIN users u_target ON ph.user_id = u_target.id
LEFT JOIN users u_changer ON ph.changed_by = u_changer.id;

-- ============================================================================
-- COMMENTS
-- ============================================================================

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*
-- View all password history with user details (no password hashes exposed)
SELECT * FROM uv_password_history
ORDER BY created_at DESC
LIMIT 10;

-- Find all password changes for a specific user
SELECT * FROM uv_password_history
WHERE user_id = 1
ORDER BY created_at DESC;

-- Find all password resets initiated by admins
SELECT * FROM uv_password_history
WHERE change_reason = 'admin_reset'
ORDER BY created_at DESC
LIMIT 20;

-- Audit: who initiated password changes
SELECT changed_by_email, COUNT(*) AS change_count
FROM uv_password_history
WHERE changed_by IS NOT NULL
GROUP BY changed_by_email
ORDER BY change_count DESC;

-- Track password changes over time
SELECT
  DATE_TRUNC('day', created_at) AS change_date,
  COUNT(*) AS daily_changes
FROM uv_password_history
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY change_date
ORDER BY change_date DESC;
*/
