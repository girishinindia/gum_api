/*
 * Purpose:
 *   Revoke a single session by marking it inactive.
 *   Sets is_active = false and records revocation timestamp.
 *
 * Depends:
 *   - user_sessions table
 *
 * Parameters:
 *   - p_session_id: Session ID to revoke
 *
 * Returns:
 *   JSONB with {success: boolean, message: string}
 *
 * Side Effects:
 *   - Sets is_active = false for the specified session
 *   - Sets revoked_at = CURRENT_TIMESTAMP
 *   - updated_at is automatically updated by trigger
 */

CREATE OR REPLACE FUNCTION udf_session_revoke(
  p_session_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_exists BOOLEAN;
BEGIN
  -- Step 1: Check session exists
  SELECT EXISTS (
    SELECT 1 FROM user_sessions WHERE id = p_session_id
  ) INTO v_session_exists;

  IF NOT v_session_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Session not found'
    );
  END IF;

  -- Step 2: Revoke the session
  UPDATE user_sessions
  SET
    is_active = false,
    revoked_at = CURRENT_TIMESTAMP
  WHERE id = p_session_id;

  -- Step 3: Return success
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Session revoked successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Failed to revoke session: ' || SQLERRM
  );
END;
$$;

-- Add function comment

/*
 * Testing Queries
 * ===============
 *
 * -- Create a test session
 * INSERT INTO user_sessions (user_id, session_token, expires_at)
 * VALUES (1, 'test-revoke-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days')
 * RETURNING id, is_active, revoked_at;
 *
 * -- Revoke the session (replace with actual session ID from above)
 * SELECT udf_session_revoke(p_session_id := <session_id>);
 *
 * -- Verify session is now inactive and revoked_at is set
 * SELECT id, is_active, revoked_at FROM user_sessions WHERE id = <session_id>;
 *
 * -- Test revoking non-existent session
 * SELECT udf_session_revoke(p_session_id := 99999);
 *
 * -- Test revoking already revoked session (should succeed)
 * SELECT udf_session_revoke(p_session_id := <session_id>);
 *
 * -- Verify revoked session cannot be validated
 * SELECT udf_session_validate('test-revoke-token');
 */
