/**
 * ============================================================================
 * UDF_LOGIN_ATTEMPT_CHECK FUNCTION
 * ============================================================================
 * Purpose:
 *   - Check if an identifier is currently blocked
 *   - Count recent failed attempts in the last 30 minutes
 *   - Calculate remaining attempts before block
 *   - Returns {success: bool, is_blocked: bool, blocked_until: ts, failed_count: int, remaining_attempts: int}
 *
 * Depends:
 *   - login_attempts table
 *
 * Usage:
 *   SELECT udf_login_attempt_check(p_identifier => 'user@example.com');
 *
 * Logic:
 *   1. Check if there's an active block (blocked_until > CURRENT_TIMESTAMP)
 *   2. Count failed attempts in last 30 minutes
 *   3. is_blocked = true if blocked_until > NOW or failed_count >= 5
 *   4. remaining_attempts = MAX(0, 5 - failed_count)
 * ============================================================================
 */

CREATE OR REPLACE FUNCTION udf_login_attempt_check(
  p_identifier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_blocked_until TIMESTAMPTZ;
  v_failure_count INT;
  v_is_blocked BOOLEAN;
  v_remaining_attempts INT;
  v_result JSONB;
BEGIN
  -- Validate input
  IF p_identifier IS NULL OR p_identifier = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'identifier is required',
      'is_blocked', false,
      'blocked_until', NULL,
      'failed_count', 0,
      'remaining_attempts', 5
    );
  END IF;

  -- Get the most recent block expiration for this identifier
  SELECT MAX(blocked_until)
  INTO v_blocked_until
  FROM login_attempts
  WHERE identifier = p_identifier
    AND blocked_until IS NOT NULL;

  -- Count failed attempts in the last 30 minutes
  SELECT COUNT(*)
  INTO v_failure_count
  FROM login_attempts
  WHERE identifier = p_identifier
    AND attempted_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
    AND status = 'failed';

  -- Determine if currently blocked
  v_is_blocked := (v_blocked_until IS NOT NULL AND v_blocked_until > CURRENT_TIMESTAMP)
                  OR v_failure_count >= 5;

  -- Calculate remaining attempts (always >= 0)
  v_remaining_attempts := GREATEST(0, 5 - v_failure_count);

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'is_blocked', v_is_blocked,
    'blocked_until', v_blocked_until,
    'failed_count', v_failure_count,
    'remaining_attempts', v_remaining_attempts
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Error checking login attempts: ' || SQLERRM,
    'is_blocked', true,
    'blocked_until', NULL,
    'failed_count', -1,
    'remaining_attempts', 0
  );
END;
$$;

-- ============================================================================
-- TESTING / EXAMPLES (uncomment to run)
-- ============================================================================

/*
-- Check a clean identifier (no block)
SELECT udf_login_attempt_check(p_identifier => 'clean@example.com');

-- Check an identifier with recent failures
SELECT udf_login_attempt_check(p_identifier => 'user@example.com');

-- Check identifier after 5 failures (should be blocked)
SELECT udf_login_attempt_check(p_identifier => 'testuser@example.com');

-- Verify the returned structure
SELECT
  (udf_login_attempt_check('test@example.com') ->> 'success')::boolean as success,
  (udf_login_attempt_check('test@example.com') ->> 'is_blocked')::boolean as is_blocked,
  (udf_login_attempt_check('test@example.com') ->> 'failed_count')::integer as failed_count,
  (udf_login_attempt_check('test@example.com') ->> 'remaining_attempts')::integer as remaining_attempts,
  (udf_login_attempt_check('test@example.com') ->> 'blocked_until')::timestamptz as blocked_until;

-- Validate that check after successful login reset (next check will have lower count)
-- First, record a failure
SELECT udf_login_attempt_record(
  p_identifier => 'progressive@example.com',
  p_status => 'failed'::login_attempt_status
);

-- Check the status
SELECT udf_login_attempt_check(p_identifier => 'progressive@example.com');

-- Record a success (breaks the failure chain)
SELECT udf_login_attempt_record(
  p_identifier => 'progressive@example.com',
  p_status => 'success'::login_attempt_status
);

-- Check again (success should not count as failure in the 5-count)
SELECT udf_login_attempt_check(p_identifier => 'progressive@example.com');
*/
