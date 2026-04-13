/**
 * ============================================================================
 * UDF_LOGIN_ATTEMPT_RECORD FUNCTION
 * ============================================================================
 * Purpose:
 *   - Record a single login attempt (success or failure)
 *   - Detect if 5 consecutive failures have occurred in last 30 minutes
 *   - If threshold reached, set blocked_until = CURRENT_TIMESTAMP + 30 min
 *   - Returns {success: bool, message: string, id: bigint}
 *
 * Depends:
 *   - login_attempts table
 *   - users table (for lookups, optional)
 *
 * Usage:
 *   SELECT udf_login_attempt_record(
 *     p_user_id => 123,
 *     p_identifier => 'user@example.com',
 *     p_ip_address => '192.168.1.100'::inet,
 *     p_status => 'failed'::login_attempt_status,
 *     p_failure_reason => 'invalid_credentials'
 *   );
 *
 * Logic:
 *   1. Insert the attempt record
 *   2. If status = 'failed':
 *      - Count consecutive failures for this identifier in last 30 min
 *      - If count >= 5: update the record to set blocked_until
 *   3. Return success/message/id
 * ============================================================================
 */

-- NOTE on parameter order:
--   p_identifier and p_status are logically required, but they keep
--   DEFAULT NULL here because PostgreSQL requires every parameter
--   after a defaulted one to also have a default, and we must preserve
--   the existing positional-call contract used by 12-auth/04_fn_login.sql
--   (user_id, identifier, ip_address, user_agent, device_type, os,
--    browser, status, failure_reason). NULL values for identifier or
--   status are caught by the runtime validation below.
CREATE OR REPLACE FUNCTION udf_login_attempt_record(
  p_user_id BIGINT DEFAULT NULL,
  p_identifier TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL,
  p_os TEXT DEFAULT NULL,
  p_browser TEXT DEFAULT NULL,
  p_status login_attempt_status DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id BIGINT;
  v_failure_count INT;
  v_blocked_until TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  -- Validate inputs
  IF p_identifier IS NULL OR p_identifier = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'identifier is required',
      'id', NULL
    );
  END IF;

  IF p_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'status is required',
      'id', NULL
    );
  END IF;

  -- Insert the login attempt record
  INSERT INTO login_attempts (
    user_id,
    identifier,
    ip_address,
    user_agent,
    device_type,
    os,
    browser,
    status,
    failure_reason,
    attempted_at
  )
  VALUES (
    p_user_id,
    p_identifier,
    p_ip_address,
    p_user_agent,
    p_device_type,
    p_os,
    p_browser,
    p_status,
    p_failure_reason,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_record_id;

  -- If this is a failed attempt, check for rate limiting
  IF p_status = 'failed' THEN
    -- Count failed/blocked attempts for this identifier in last 30 minutes
    -- We check for failures OR previous blocks to detect patterns
    SELECT COUNT(*)
    INTO v_failure_count
    FROM login_attempts
    WHERE identifier = p_identifier
      AND attempted_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
      AND (status = 'failed' OR status = 'blocked');

    -- If 5 or more consecutive failures detected, block this identifier
    IF v_failure_count >= 5 THEN
      v_blocked_until := CURRENT_TIMESTAMP + INTERVAL '30 minutes';

      UPDATE login_attempts
      SET
        status = 'blocked',
        blocked_until = v_blocked_until
      WHERE id = v_record_id;

      v_result := jsonb_build_object(
        'success', true,
        'message', 'Login attempt recorded. Identifier blocked for 30 minutes due to excessive failures.',
        'id', v_record_id,
        'blocked', true,
        'blocked_until', v_blocked_until
      );
    ELSE
      v_result := jsonb_build_object(
        'success', true,
        'message', 'Failed login attempt recorded.',
        'id', v_record_id,
        'blocked', false,
        'failures_remaining', 5 - v_failure_count
      );
    END IF;
  ELSE
    -- Success or explicit block status
    v_result := jsonb_build_object(
      'success', true,
      'message', 'Login attempt recorded with status: ' || p_status::text,
      'id', v_record_id
    );
  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Error recording login attempt: ' || SQLERRM,
    'id', NULL
  );
END;
$$;

-- ============================================================================
-- TESTING / EXAMPLES (uncomment to run)
-- ============================================================================

/*
-- Record a successful login
SELECT udf_login_attempt_record(
  p_user_id => 123,
  p_identifier => 'user@example.com',
  p_ip_address => '192.168.1.100'::inet,
  p_user_agent => 'Mozilla/5.0...',
  p_device_type => 'desktop',
  p_os => 'Windows',
  p_browser => 'Chrome',
  p_status => 'success'::login_attempt_status
);

-- Record a failed login (wrong password)
SELECT udf_login_attempt_record(
  p_user_id => 123,
  p_identifier => 'user@example.com',
  p_ip_address => '192.168.1.100'::inet,
  p_status => 'failed'::login_attempt_status,
  p_failure_reason => 'invalid_credentials'
);

-- Simulate 5 rapid failures to trigger block
DO $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM udf_login_attempt_record(
      p_identifier => 'testuser@example.com',
      p_ip_address => '10.0.0.1'::inet,
      p_status => 'failed'::login_attempt_status,
      p_failure_reason => 'invalid_credentials'
    );
  END LOOP;
END;
$$;

-- Check if identifier is now blocked
SELECT * FROM login_attempts
  WHERE identifier = 'testuser@example.com'
  ORDER BY attempted_at DESC
  LIMIT 5;

-- Verify blocked_until is set on the 5th attempt
SELECT id, status, blocked_until, attempted_at
  FROM login_attempts
  WHERE identifier = 'testuser@example.com'
  ORDER BY attempted_at DESC
  LIMIT 1;
*/
