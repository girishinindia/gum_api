/*
 * Purpose:
 *   Create a new user session. Validates user existence, account status,
 *   and email/mobile verification requirements before session creation.
 *
 * Depends:
 *   - user_sessions table
 *   - users table with columns: id, is_active, is_deleted, is_email_verified, is_mobile_verified
 *
 * Parameters:
 *   - p_user_id: User ID creating the session
 *   - p_session_token: Unique session token (app-generated, e.g., UUID)
 *   - p_refresh_token: Optional refresh token for token renewal
 *   - p_ip_address: Client IP address (INET)
 *   - p_user_agent: Client user agent string
 *   - p_device_type: Device type (mobile, desktop, tablet, etc.)
 *   - p_os: Operating system
 *   - p_browser: Browser name
 *   - p_location: JSONB {lat, lng, city, country} (optional)
 *   - p_expires_at: Session expiration time (default: +7 days)
 *
 * Returns:
 *   JSONB with {success: boolean, message: string, id: bigint (on success)}
 *
 * Validations:
 *   1. User exists
 *   2. User is_active = true
 *   3. User is_deleted = false
 *   4. User is_email_verified = true
 *   5. User is_mobile_verified = true
 */

CREATE OR REPLACE FUNCTION udf_session_create(
  p_user_id BIGINT,
  p_session_token TEXT,
  p_refresh_token TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL,
  p_os TEXT DEFAULT NULL,
  p_browser TEXT DEFAULT NULL,
  p_location JSONB DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_exists BOOLEAN;
  v_user_is_active BOOLEAN;
  v_user_is_deleted BOOLEAN;
  v_user_is_email_verified BOOLEAN;
  v_user_is_mobile_verified BOOLEAN;
  v_session_id BIGINT;
BEGIN
  -- Step 1: Verify user exists
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = p_user_id
  ) INTO v_user_exists;

  IF NOT v_user_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  -- Step 2: Fetch user's account status
  SELECT
    is_active,
    is_deleted,
    is_email_verified,
    is_mobile_verified
  INTO
    v_user_is_active,
    v_user_is_deleted,
    v_user_is_email_verified,
    v_user_is_mobile_verified
  FROM users
  WHERE id = p_user_id;

  -- Step 3: Validate user is not deleted
  IF v_user_is_deleted THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User account is deleted'
    );
  END IF;

  -- Step 4: Validate user account is active
  IF NOT v_user_is_active THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User account is not active'
    );
  END IF;

  -- Step 5: Validate email verification
  IF NOT v_user_is_email_verified THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User email is not verified'
    );
  END IF;

  -- Step 6: Validate mobile verification
  IF NOT v_user_is_mobile_verified THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User mobile number is not verified'
    );
  END IF;

  -- Step 7: Insert new session
  INSERT INTO user_sessions (
    user_id,
    session_token,
    refresh_token,
    ip_address,
    user_agent,
    device_type,
    os,
    browser,
    location,
    expires_at
  ) VALUES (
    p_user_id,
    p_session_token,
    p_refresh_token,
    p_ip_address,
    p_user_agent,
    p_device_type,
    p_os,
    p_browser,
    p_location,
    p_expires_at
  )
  RETURNING id INTO v_session_id;

  -- Step 8: Return success with session ID
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Session created successfully',
    'id', v_session_id
  );

EXCEPTION WHEN OTHERS THEN
  -- Log error and return failure
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Failed to create session: ' || SQLERRM
  );
END;
$$;

-- Add function comment

/*
 * Testing Queries
 * ===============
 *
 * -- Assuming user with ID 1 exists and is fully verified
 * SELECT udf_session_create(
 *   p_user_id := 1,
 *   p_session_token := 'test-token-' || gen_random_uuid(),
 *   p_refresh_token := 'test-refresh-' || gen_random_uuid(),
 *   p_ip_address := '192.168.1.1'::inet,
 *   p_user_agent := 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
 *   p_device_type := 'desktop',
 *   p_os := 'Windows',
 *   p_browser := 'Chrome'
 * );
 *
 * -- Test with non-existent user
 * SELECT udf_session_create(
 *   p_user_id := 99999,
 *   p_session_token := 'test-token',
 *   p_expires_at := CURRENT_TIMESTAMP + INTERVAL '7 days'
 * );
 *
 * -- Test with location data
 * SELECT udf_session_create(
 *   p_user_id := 1,
 *   p_session_token := 'test-token-' || gen_random_uuid(),
 *   p_location := jsonb_build_object(
 *     'lat', 40.7128,
 *     'lng', -74.0060,
 *     'city', 'New York',
 *     'country', 'USA'
 *   )
 * );
 *
 * -- Verify session was created
 * SELECT * FROM user_sessions ORDER BY created_at DESC LIMIT 1;
 *
 * -- Check token uniqueness (should fail on second insert with same token)
 * SELECT udf_session_create(
 *   p_user_id := 1,
 *   p_session_token := 'duplicate-token',
 *   p_expires_at := CURRENT_TIMESTAMP + INTERVAL '7 days'
 * );
 *
 * SELECT udf_session_create(
 *   p_user_id := 1,
 *   p_session_token := 'duplicate-token',
 *   p_expires_at := CURRENT_TIMESTAMP + INTERVAL '7 days'
 * );
 */
