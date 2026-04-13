/*
 * Purpose:
 *   Revoke all active sessions for a user, optionally preserving one session.
 *   Useful for force logout, password reset, or security events.
 *
 * Depends:
 *   - user_sessions table
 *
 * Parameters:
 *   - p_user_id: User whose sessions to revoke
 *   - p_except_session_id: Optional session ID to keep active (e.g., current session)
 *
 * Returns:
 *   JSONB with {success: boolean, message: string, count: integer (sessions revoked)}
 *
 * Side Effects:
 *   - Sets is_active = false for all target sessions
 *   - Sets revoked_at = CURRENT_TIMESTAMP for all target sessions
 *   - updated_at is automatically updated by trigger
 *
 * Typical Use Cases:
 *   1. Force logout all devices: udf_session_revoke_all(p_user_id := 1)
 *   2. Logout all except current device: udf_session_revoke_all(p_user_id := 1, p_except_session_id := 123)
 *   3. Account security event (password change, suspicious activity)
 */

CREATE OR REPLACE FUNCTION udf_session_revoke_all(
  p_user_id BIGINT,
  p_except_session_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_exists BOOLEAN;
  v_revoked_count INTEGER;
BEGIN
  -- Step 1: Check user exists
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = p_user_id
  ) INTO v_user_exists;

  IF NOT v_user_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found',
      'count', 0
    );
  END IF;

  -- Step 2: Revoke all active sessions for the user
  UPDATE user_sessions
  SET
    is_active = false,
    revoked_at = CURRENT_TIMESTAMP
  WHERE
    user_id = p_user_id
    AND is_active = true
    AND (p_except_session_id IS NULL OR id != p_except_session_id);

  -- Step 3: Get count of revoked sessions
  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  -- Step 4: Return success with revocation count
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Sessions revoked successfully',
    'count', v_revoked_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Failed to revoke sessions: ' || SQLERRM,
    'count', 0
  );
END;
$$;

-- Add function comment

/*
 * Testing Queries
 * ===============
 *
 * -- Create multiple test sessions for a user
 * INSERT INTO user_sessions (user_id, session_token, expires_at)
 * VALUES
 *   (1, 'session-1-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days'),
 *   (1, 'session-2-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days'),
 *   (1, 'session-3-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days')
 * RETURNING id, session_token;
 *
 * -- Verify user has active sessions
 * SELECT COUNT(*), SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
 * FROM user_sessions WHERE user_id = 1;
 *
 * -- Revoke all sessions for user 1
 * SELECT udf_session_revoke_all(p_user_id := 1);
 *
 * -- Verify all sessions are now inactive
 * SELECT id, is_active, revoked_at FROM user_sessions WHERE user_id = 1;
 *
 * -- Test with except_session_id (keep one session active)
 * -- First, create fresh sessions
 * DELETE FROM user_sessions WHERE user_id = 1;
 *
 * INSERT INTO user_sessions (user_id, session_token, expires_at)
 * VALUES
 *   (1, 'session-keep-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days'),
 *   (1, 'session-revoke-1-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days'),
 *   (1, 'session-revoke-2-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days')
 * RETURNING id;
 *
 * -- Now revoke all except the first one (replace with actual ID)
 * SELECT udf_session_revoke_all(p_user_id := 1, p_except_session_id := <keep_session_id>);
 *
 * -- Verify: one active, two inactive
 * SELECT id, is_active, revoked_at FROM user_sessions WHERE user_id = 1 ORDER BY id;
 *
 * -- Test revoking for non-existent user
 * SELECT udf_session_revoke_all(p_user_id := 99999);
 *
 * -- Test with already revoked sessions (should return count 0)
 * SELECT udf_session_revoke_all(p_user_id := 1);
 *
 * -- Verify revoked sessions fail validation
 * SELECT udf_session_validate('session-revoke-1-token');
 */
