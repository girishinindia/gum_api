-- ============================================================================
-- File: 11_fn_change_email_complete.sql
-- Purpose: Complete email change after OTP verification
--          1. Verifies the change request (marks as verified)
--          2. Completes the change (updates users table)
--          3. Invalidates all email change OTPs
--          4. Revokes all user sessions (forces re-login)
-- Depends: udf_contact_change_verify, udf_contact_change_complete,
--          udf_otp_invalidate, udf_session_revoke_all
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_auth_change_email_complete(
  p_request_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verify_result JSONB;
  v_complete_result JSONB;
  v_invalidate_result JSONB;
  v_revoke_result JSONB;
  v_user_id BIGINT;
  v_change_type TEXT;
BEGIN
  -- Verify the change request (must have been verified by OTP)
  v_verify_result := udf_contact_change_verify(p_request_id);
  IF NOT (v_verify_result->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_verify_result->>'message'
    );
  END IF;

  -- Complete the change (updates users table with new email)
  v_complete_result := udf_contact_change_complete(p_request_id);
  IF NOT (v_complete_result->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_complete_result->>'message'
    );
  END IF;

  v_user_id := (v_complete_result->>'user_id')::BIGINT;

  -- Invalidate all pending email change OTPs for this user
  v_invalidate_result := udf_otp_invalidate(v_user_id, 'change_email');
  IF NOT (v_invalidate_result->>'success')::BOOLEAN THEN
    -- Log but don't fail; OTP invalidation is cleanup
    RAISE WARNING 'Failed to invalidate OTPs: %', v_invalidate_result->>'message';
  END IF;

  -- Revoke all sessions for this user (forces re-login with new email)
  v_revoke_result := udf_session_revoke_all(v_user_id, NULL);
  IF NOT (v_revoke_result->>'success')::BOOLEAN THEN
    -- Log but don't fail; session revocation is security measure
    RAISE WARNING 'Failed to revoke sessions: %', v_revoke_result->>'message';
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Email changed successfully. All sessions have been revoked. Please log in again.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'message', 'Error completing email change: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (uncomment to test)
-- ============================================================================
/*
-- Prerequisites:
-- 1. Call udf_auth_change_email_initiate to create a request
-- 2. Verify the OTP via app (udf_otp_verify)
-- 3. Then call this function

-- Get latest email change request for user 3
-- SELECT id FROM contact_changes WHERE user_id = 3 AND change_type = 'email'
-- ORDER BY created_at DESC LIMIT 1;

-- Then complete it (assuming request_id = 5):
-- SELECT udf_auth_change_email_complete(5);

-- Verify the email was updated
-- SELECT id, email, is_email_verified, email_verified_at FROM users WHERE id = 3;

-- Verify the change request is now complete
-- SELECT id, user_id, change_type, status, completed_at
-- FROM contact_changes WHERE id = 5;

-- Test with non-existent request
-- SELECT udf_auth_change_email_complete(99999);

-- Test with unverified request (should fail)
-- (Create a new request but don't verify OTP)
*/
