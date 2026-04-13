/**
 * ============================================================================
 * UDF_LOGIN_ATTEMPT_RESET FUNCTION
 * ============================================================================
 * Purpose:
 *   - Called after successful login to clear the failure block
 *   - Since login_attempts is append-only, no records are deleted
 *   - Clear blocked_until on any active blocks for this identifier
 *   - Allows future login attempts without the 30-minute penalty
 *
 * Depends:
 *   - login_attempts table
 *
 * Usage:
 *   SELECT udf_login_attempt_reset(p_identifier => 'user@example.com');
 *
 * Logic:
 *   1. Update all blocked records for this identifier to clear blocked_until
 *   2. This logically "resets" the block without deleting the audit trail
 *   3. Next check() call will see only recent failures (not the old block)
 * ============================================================================
 */

CREATE OR REPLACE FUNCTION udf_login_attempt_reset(
  p_identifier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT;
  v_result JSONB;
BEGIN
  -- Validate input
  IF p_identifier IS NULL OR p_identifier = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'identifier is required'
    );
  END IF;

  -- Clear blocked_until on any active blocks for this identifier
  -- This allows the next login attempt to proceed
  UPDATE login_attempts
  SET blocked_until = NULL
  WHERE identifier = p_identifier
    AND status = 'blocked'
    AND blocked_until IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'message', 'Login block cleared for identifier: ' || p_identifier,
    'blocks_cleared', v_updated_count
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Error resetting login attempts: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- TESTING / EXAMPLES (uncomment to run)
-- ============================================================================

/*
-- Create a blocked identifier by recording 5 failures
DO $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM udf_login_attempt_record(
      p_identifier => 'blocked@example.com',
      p_status => 'failed'::login_attempt_status
    );
  END LOOP;
END;
$$;

-- Verify it's blocked
SELECT udf_login_attempt_check(p_identifier => 'blocked@example.com');

-- Reset the block
SELECT udf_login_attempt_reset(p_identifier => 'blocked@example.com');

-- Verify the block is cleared
SELECT udf_login_attempt_check(p_identifier => 'blocked@example.com');

-- View the audit trail (records still exist, but blocked_until is NULL)
SELECT id, status, blocked_until, attempted_at
  FROM login_attempts
  WHERE identifier = 'blocked@example.com'
  ORDER BY attempted_at DESC;

-- Test reset on identifier with no active blocks
SELECT udf_login_attempt_reset(p_identifier => 'never_blocked@example.com');

-- Test with empty identifier (should fail gracefully)
SELECT udf_login_attempt_reset(p_identifier => '');
*/
