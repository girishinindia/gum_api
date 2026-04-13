-- ============================================================================
-- File: 10_fn_change_email_initiate.sql
-- Purpose: Initiate email change for authenticated user
--          1. Validates new email uniqueness via contact_change_initiate
--          2. Creates change request in database
--          3. Generates OTP for verification
-- Depends: udf_check_user_active, udf_contact_change_initiate, udf_otp_generate
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_auth_change_email_initiate(
  p_user_id BIGINT,
  p_new_email CITEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_check JSONB;
  v_contact_result JSONB;
  v_otp_result JSONB;
  v_request_id BIGINT;
BEGIN
  -- Validate user exists and is active
  v_user_check := udf_check_user_active(p_user_id);
  IF NOT (v_user_check->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_user_check->>'message'
    );
  END IF;

  -- Initiate contact change (validates uniqueness, creates request)
  v_contact_result := udf_contact_change_initiate(
    p_user_id,
    'email',
    p_new_email
  );

  IF NOT (v_contact_result->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_contact_result->>'message'
    );
  END IF;

  v_request_id := (v_contact_result->>'id')::BIGINT;

  -- Generate OTP to new email address
  v_otp_result := udf_otp_generate(
    p_user_id,
    'change_email',
    'email',
    p_new_email
  );

  IF NOT (v_otp_result->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_otp_result->>'message'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Email change initiated. OTP sent to new email address.',
    'request_id', v_request_id,
    'otp_id', (v_otp_result->>'id')::BIGINT,
    'otp_code', v_otp_result->>'otp_code'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'message', 'Error initiating email change: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (uncomment to test)
-- ============================================================================
/*
-- Assuming user_id=3 exists and is active
SELECT udf_auth_change_email_initiate(3, 'newemail@example.com');

-- Check that the request was created
SELECT id, user_id, change_type, new_value, status, created_at
FROM contact_changes
WHERE user_id = 3 AND change_type = 'email'
ORDER BY created_at DESC LIMIT 1;

-- Check that OTP was created
SELECT id, user_id, purpose, destination, otp_code, status, created_at
FROM otp_records
WHERE user_id = 3 AND purpose = 'change_email'
ORDER BY created_at DESC LIMIT 1;

-- Test with non-existent user
SELECT udf_auth_change_email_initiate(99999, 'test@example.com');

-- Test with duplicate email (should fail)
-- First ensure this email exists in users table
SELECT udf_auth_change_email_initiate(3, 'existing@example.com');
*/
