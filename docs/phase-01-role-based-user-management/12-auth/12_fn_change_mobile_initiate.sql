-- ============================================================================
-- File: 12_fn_change_mobile_initiate.sql
-- Purpose: Initiate mobile number change for authenticated user
--          1. Validates new mobile uniqueness via contact_change_initiate
--          2. Creates change request in database
--          3. Generates OTP for verification
-- Depends: udf_check_user_active, udf_contact_change_initiate, udf_otp_generate
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_auth_change_mobile_initiate(
  p_user_id BIGINT,
  p_new_mobile TEXT
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
  v_phone_code TEXT;
  v_mobile_destination TEXT;
BEGIN
  -- Validate user exists and is active
  v_user_check := udf_check_user_active(p_user_id);
  IF NOT (v_user_check->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_user_check->>'message'
    );
  END IF;

  -- Look up the user's country phone_code so we can build the
  -- E.164 destination for the SMS OTP. We default to the user's
  -- existing country since the change-mobile request body does
  -- not currently carry a country override; cross-country mobile
  -- changes would require a new p_country_id parameter.
  SELECT c.phone_code
    INTO v_phone_code
  FROM users u
  LEFT JOIN countries c ON c.id = u.country_id
  WHERE u.id = p_user_id
  LIMIT 1;

  -- Initiate contact change (validates uniqueness, creates request)
  v_contact_result := udf_contact_change_initiate(
    p_user_id,
    'mobile',
    p_new_mobile
  );

  IF NOT (v_contact_result->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_contact_result->>'message'
    );
  END IF;

  v_request_id := (v_contact_result->>'id')::BIGINT;

  -- Generate OTP to new mobile number, formatted as E.164 via
  -- the shared helper (defensive against double-prefixing).
  v_mobile_destination := udf_format_mobile_e164(v_phone_code, p_new_mobile);

  v_otp_result := udf_otp_generate(
    p_user_id,
    'change_mobile',
    'mobile',
    v_mobile_destination
  );

  IF NOT (v_otp_result->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_otp_result->>'message'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Mobile change initiated. OTP sent to new mobile number.',
    'request_id', v_request_id,
    'otp_id', (v_otp_result->>'id')::BIGINT,
    'otp_code', v_otp_result->>'otp_code'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'message', 'Error initiating mobile change: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (uncomment to test)
-- ============================================================================
/*
-- Assuming user_id=3 exists and is active
SELECT udf_auth_change_mobile_initiate(3, '+1-555-0123');

-- Check that the request was created
SELECT id, user_id, change_type, new_value, status, created_at
FROM contact_changes
WHERE user_id = 3 AND change_type = 'mobile'
ORDER BY created_at DESC LIMIT 1;

-- Check that OTP was created
SELECT id, user_id, purpose, destination, otp_code, status, created_at
FROM otp_records
WHERE user_id = 3 AND purpose = 'change_mobile'
ORDER BY created_at DESC LIMIT 1;

-- Test with non-existent user
SELECT udf_auth_change_mobile_initiate(99999, '+1-555-0123');

-- Test with duplicate mobile (should fail)
-- First ensure this mobile exists in users table
SELECT udf_auth_change_mobile_initiate(3, '+1-555-9999');
*/
