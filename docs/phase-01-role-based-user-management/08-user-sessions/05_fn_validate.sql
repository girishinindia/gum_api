/*
 * Purpose:
 *   Validate a session token and check its validity.
 *   Verifies session is active, not expired, and user is still valid.
 *   Updates last_active_at on successful validation.
 *
 * Depends:
 *   - user_sessions table
 *   - users table with columns: id, is_active, is_deleted
 *
 * Parameters:
 *   - p_session_token: Session token to validate
 *
 * Returns:
 *   JSONB with:
 *   - On valid session: {success: true, message: 'Session valid', user_id: bigint, session_id: bigint}
 *   - On invalid session: {success: false, message: 'Reason for failure'}
 *
 * Validations:
 *   1. Session token exists
 *   2. Session is_active = true
 *   3. Session expires_at > CURRENT_TIMESTAMP
 *   4. Associated user is_active = true
 *   5. Associated user is_deleted = false
 *
 * Side Effects:
 *   - Updates last_active_at to CURRENT_TIMESTAMP on successful validation
 */

CREATE OR REPLACE FUNCTION udf_session_validate(
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_session_id BIGINT;
  v_user_id BIGINT;
  v_is_active BOOLEAN;
  v_expires_at TIMESTAMPTZ;
  v_user_is_active BOOLEAN;
  v_user_is_deleted BOOLEAN;
BEGIN
  -- Step 1: Find session by token
  SELECT
    id,
    user_id,
    is_active,
    expires_at
  INTO
    v_session_id,
    v_user_id,
    v_is_active,
    v_expires_at
  FROM user_sessions
  WHERE session_token = p_session_token;

  -- Step 2: Check session exists
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Session not found'
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
      'message', 'Session has expired'
    );
  END IF;

  -- Step 5: Fetch associated user status
  SELECT
    is_active,
    is_deleted
  INTO
    v_user_is_active,
    v_user_is_deleted
  FROM users
  WHERE id = v_user_id;

  -- Step 6: Check user still exists
  IF v_user_is_active IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Associated user not found'
    );
  END IF;

  -- Step 7: Check user is not deleted
  IF v_user_is_deleted THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User account is deleted'
    );
  END IF;

  -- Step 8: Check user is active
  IF NOT v_user_is_active THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User account is not active'
    );
  END IF;

  -- Step 9: Update last_active_at on successful validation
  UPDATE user_sessions
  SET last_active_at = CURRENT_TIMESTAMP
  WHERE id = v_session_id;

  -- Step 10: Return success with user and session IDs
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Session is valid',
    'user_id', v_user_id,
    'session_id', v_session_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Validation error: ' || SQLERRM
  );
END;
$$;

-- Add function comment

/*
 * Testing Queries
 * ===============
 *
 * -- Create a test session first
 * INSERT INTO user_sessions (user_id, session_token, expires_at)
 * VALUES (1, 'valid-test-token-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days')
 * RETURNING id, session_token;
 *
 * -- Validate with valid token (replace with actual token from above)
 * SELECT udf_session_validate('valid-test-token-...');
 *
 * -- Validate with non-existent token
 * SELECT udf_session_validate('non-existent-token');
 *
 * -- Validate expired session
 * INSERT INTO user_sessions (user_id, session_token, expires_at)
 * VALUES (1, 'expired-token-' || gen_random_uuid(), CURRENT_TIMESTAMP - INTERVAL '1 day');
 *
 * SELECT udf_session_validate('expired-token-...');
 *
 * -- Check last_active_at was updated after validation
 * SELECT id, session_token, last_active_at FROM user_sessions
 * WHERE session_token = 'valid-test-token-...'
 * ORDER BY updated_at DESC;
 *
 * -- Create revoked session and test
 * INSERT INTO user_sessions (user_id, session_token, expires_at, is_active, revoked_at)
 * VALUES (1, 'revoked-token-' || gen_random_uuid(), CURRENT_TIMESTAMP + INTERVAL '7 days', false, CURRENT_TIMESTAMP);
 *
 * SELECT udf_session_validate('revoked-token-...');
 */
