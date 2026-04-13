/*
 * Purpose:
 *   Create a secure view that joins user_sessions with users table.
 *   Exposes essential session and user info WITHOUT sensitive tokens.
 *   Used for audit logs, session management dashboards, and admin views.
 *
 * Depends:
 *   - user_sessions table
 *   - users table with columns: first_name, last_name, email, role_id
 *
 * Security:
 *   - session_token and refresh_token are NEVER exposed in this view
 *   - Uses security_invoker to respect RLS policies
 *   - Data visibility depends on user's role and RLS rules
 */

CREATE OR REPLACE VIEW uv_user_sessions WITH (security_invoker = true) AS
SELECT
  us.id,
  us.user_id,
  u.first_name,
  u.last_name,
  u.email,
  u.role_id,
  us.ip_address,
  us.user_agent,
  us.device_type,
  us.os,
  us.browser,
  us.location,
  us.login_at,
  us.expires_at,
  us.last_active_at,
  us.revoked_at,
  us.is_active,
  us.created_at,
  us.updated_at
FROM
  user_sessions us
  INNER JOIN users u ON us.user_id = u.id;

-- Add view comment

-- Add column comments to document what data is visible

/*
 * Testing Queries
 * ===============
 *
 * -- View structure and availability
 * SELECT * FROM uv_user_sessions LIMIT 5;
 *
 * -- Verify tokens are NOT exposed
 * SELECT column_name FROM information_schema.columns
 * WHERE table_name = 'uv_user_sessions'
 * ORDER BY column_name;
 *
 * -- Confirm view joins correctly
 * SELECT COUNT(*) FROM uv_user_sessions;
 *
 * -- Query by user
 * SELECT * FROM uv_user_sessions WHERE user_id = 1;
 *
 * -- Find active sessions
 * SELECT * FROM uv_user_sessions WHERE is_active = true;
 */
