-- ============================================================================
-- File: 15_fn_verify_mobile.sql
-- Purpose: Mark user mobile number as verified after OTP verification
--          Called after OTP is successfully verified for registration or
--          re-verification purposes. Sets mobile verification flag and timestamp.
-- Depends: none (direct table updates)
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_auth_verify_mobile(
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
  -- Update users table: set mobile as verified with current timestamp
  UPDATE users
  SET
    is_mobile_verified = TRUE,
    mobile_verified_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE
    id = p_user_id
    AND is_mobile_verified = FALSE;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  -- If no rows were updated, mobile was already verified
  IF v_updated_rows = 0 THEN
    -- Check if user exists at all
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'User not found'
      );
    END IF;

    -- User exists but mobile already verified
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'Mobile already verified'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Mobile verified successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'message', 'Error verifying mobile: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (uncomment to test)
-- ============================================================================
/*
-- Verify mobile for user 3 (assuming is_mobile_verified = FALSE)
SELECT udf_auth_verify_mobile(3);

-- Check the result
SELECT id, mobile, is_mobile_verified, mobile_verified_at
FROM users WHERE id = 3;

-- Test verifying again (should return success with "already verified" message)
SELECT udf_auth_verify_mobile(3);

-- Test with non-existent user
SELECT udf_auth_verify_mobile(99999);

-- Test with user that has inactive status
-- (should still work - registration users can be inactive)
*/
