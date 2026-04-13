/*
 * Purpose:
 *   Refresh a session by issuing new tokens while maintaining the session record.
 *   Uses refresh_token to validate refresh request and update session tokens/expiration.
 *
 * Depends:
 *   - user_sessions table
 *
 * Parameters:
 *   - p_refresh_token: Current refresh token to validate
 *   - p_new_session_token: New session token to assign
 *   - p_new_refresh_token: New refresh token to assign
 *   - p_new_expires_at: New expiration timestamp (default: +7 days)
 *
 * Returns:
 *   JSONB with {success: boolean, message: string, id: bigint (on success)}
 *
 * Validations:
 *   1. Session with refresh_token exists
 *   2. Session is_active = true
 *   3. Session expires_at > CURRENT_TIMESTAMP (not expired)
 *
 * Side Effects:
 *   - Updates session_token, refresh_token, and expires_at
 *   - last_active_at is NOT updated here (that's for validation)
 */

CREATE OR REPLACE FUNCTION udf_session_refresh(
  p_refresh_token TEXT,
  p_new_session_token TEXT,
  p_new_refresh_token TEXT,
  p_new_expires_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id BIGINT;
  v_is_active BOOLEAN;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Step 1: Find session by refresh token
  SELECT
    id,
    is_active,
    expires_at
  INTO
    v_session_id,
    v_is_active,
    v_expires_at
  FROM user_sessions
  WHERE refresh_token = p_refresh_token;

  -- Step 2: Check session exists
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Refresh token not found or invalid'
    );
  END IF;

  -- Step 3: Check session is active
  IF NOT v_is_active THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Session is not active'
    );
  END IF;

  -- Step 4: Check session not expired
  IF v_expires_at <= CURRENT_TIMESTAMP THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Session has expired, cannot refresh'
    );
  END IF;

  -- Step 5: Update session with new tokens and expiration
  UPDATE user_sessions
  SET
    session_token = p_new_session_token,
    refresh_token = p_new_refresh_token,
    expires_at = p_new_expires_at,
    last_active_at = CURRENT_TIMESTAMP
  WHERE id = v_session_id;

  -- Step 6: Return success with session ID
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Session refreshed successfully',
    'id', v_session_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Failed to refresh session: ' || SQLERRM
  );
END;
$$;

-- Add function comment

/*
 * Testing Queries
 * ===============
 *
 * -- Create a test session with refresh token
 * INSERT INTO user_sessions (user_id, session_token, refresh_token, expires_at)
 * VALUES (1, 'session-token-' || gen_random_uuid(), 'refresh-token-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days')
 * RETURNING id, session_token, refresh_token;
 *
 * -- Refresh the session with new tokens (replace with actual tokens from above)
 * SELECT udf_session_refresh(
 *   p_refresh_token := 'refresh-token-...',
 *   p_new_session_token := 'new-session-' || gen_random_uuid(),
 *   p_new_refresh_token := 'new-refresh-' || gen_random_uuid(),
 *   p_new_expires_at := CURRENT_TIMESTAMP + INTERVAL '7 days'
 * );
 *
 * -- Verify tokens were updated
 * SELECT id, session_token, refresh_token, expires_at, last_active_at
 * FROM user_sessions WHERE id = <session_id>;
 *
 * -- Test with non-existent refresh token
 * SELECT udf_session_refresh(
 *   p_refresh_token := 'non-existent-refresh-token',
 *   p_new_session_token := 'new-session-token',
 *   p_new_refresh_token := 'new-refresh-token'
 * );
 *
 * -- Test with expired session
 * INSERT INTO user_sessions (user_id, session_token, refresh_token, expires_at)
 * VALUES (1, 'expired-session-' || gen_random_uuid(), 'expired-refresh-' || gen_random_uuid(), CURRENT_TIMESTAMP - INTERVAL '1 day');
 *
 * SELECT udf_session_refresh(
 *   p_refresh_token := 'expired-refresh-...',
 *   p_new_session_token := 'new-token',
 *   p_new_refresh_token := 'new-refresh'
 * );
 *
 * -- Test with revoked session
 * INSERT INTO user_sessions (user_id, session_token, refresh_token, expires_at, is_active, revoked_at)
 * VALUES (1, 'revoked-session-' || gen_random_uuid(), 'revoked-refresh-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days', false, CURRENT_TIMESTAMP);
 *
 * SELECT udf_session_refresh(
 *   p_refresh_token := 'revoked-refresh-...',
 *   p_new_session_token := 'new-token',
 *   p_new_refresh_token := 'new-refresh'
 * );
 */
