-- ============================================================================
-- File: 14_fn_verify_email.sql
-- Purpose: Mark user email as verified after OTP verification
--          Called after OTP is successfully verified for registration or
--          re-verification purposes. Sets email verification flag and timestamp.
-- Depends: none (direct table updates)
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_auth_verify_email(
  p_user_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_rows INT;
BEGIN
  -- Update users table: set email as verified with current timestamp
  UPDATE users
  SET
    is_email_verified = TRUE,
    email_verified_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE
    id = p_user_id
    AND is_email_verified = FALSE;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- If no rows were updated, email was already verified
  IF v_updated_rows = 0 THEN
    -- Check if user exists at all
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'User not found'
      );
    END IF;

    -- User exists but email already verified
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'Email already verified'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Email verified successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'message', 'Error verifying email: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (uncomment to test)
-- ============================================================================
/*
-- Verify email for user 3 (assuming is_email_verified = FALSE)
SELECT udf_auth_verify_email(3);

-- Check the result
SELECT id, email, is_email_verified, email_verified_at
FROM users WHERE id = 3;

-- Test verifying again (should return success with "already verified" message)
SELECT udf_auth_verify_email(3);

-- Test with non-existent user
SELECT udf_auth_verify_email(99999);

-- Test with user that has inactive status
-- (should still work - registration users can be inactive)
*/
