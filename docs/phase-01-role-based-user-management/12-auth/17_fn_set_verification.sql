-- ============================================================================
-- File: 17_fn_set_verification.sql
-- Purpose: Set or reset email/mobile verification status (admin operation)
--          1. Only super admin or admin can perform this
--          2. Caller must have higher role level than target
--          3. Supports independent toggling of email and mobile verification
--          4. Updates or clears verification timestamps accordingly
-- Depends: udf_check_hierarchy_access
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_auth_set_verification(
  p_caller_id BIGINT,
  p_target_user_id BIGINT,
  p_is_email_verified BOOLEAN DEFAULT NULL,
  p_is_mobile_verified BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hierarchy_check JSONB;
  v_caller_role_level INT;
  v_target_role_level INT;
  v_updated_rows INT;
BEGIN
  -- At least one verification flag must be provided
  IF p_is_email_verified IS NULL AND p_is_mobile_verified IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'At least one verification flag must be specified'
    );
  END IF;

  -- Verify caller has permission (must be super admin or admin)
  v_hierarchy_check := udf_check_hierarchy_access(p_caller_id, p_target_user_id, 'set_verification');
  IF NOT (v_hierarchy_check->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_hierarchy_check->>'message'
    );
  END IF;

  v_caller_role_level := (v_hierarchy_check->>'caller_role_level')::INT;
  v_target_role_level := (v_hierarchy_check->>'target_role_level')::INT;

  -- Only super admin (level 0) or admin (level 1) can set verification
  IF v_caller_role_level > 1 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Insufficient permissions to set verification status'
    );
  END IF;

  -- Caller must have higher privilege (lower level number) than target
  -- (level 0 > level 1 > level 2, etc.)
  IF v_caller_role_level >= v_target_role_level THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Cannot set verification for user with equal or higher role level'
    );
  END IF;

  -- Update user's verification status
  UPDATE users
  SET
    is_email_verified = COALESCE(p_is_email_verified, is_email_verified),
    email_verified_at = CASE
      WHEN p_is_email_verified = TRUE THEN CURRENT_TIMESTAMP
      WHEN p_is_email_verified = FALSE THEN NULL
      ELSE email_verified_at
    END,
    is_mobile_verified = COALESCE(p_is_mobile_verified, is_mobile_verified),
    mobile_verified_at = CASE
      WHEN p_is_mobile_verified = TRUE THEN CURRENT_TIMESTAMP
      WHEN p_is_mobile_verified = FALSE THEN NULL
      ELSE mobile_verified_at
    END,
    updated_by = p_caller_id,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_target_user_id;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Target user not found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Verification status updated successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'message', 'Error setting verification status: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (uncomment to test)
-- ============================================================================
/*
-- Assuming super admin id=1 exists, user id=3 exists
-- Set email verified to TRUE
SELECT udf_auth_set_verification(1, 3, TRUE, NULL);

-- Set mobile verified to FALSE (clear verification)
SELECT udf_auth_set_verification(1, 3, NULL, FALSE);

-- Set both at once
SELECT udf_auth_set_verification(1, 3, TRUE, FALSE);

-- Verify the changes
SELECT id, is_email_verified, email_verified_at, is_mobile_verified, mobile_verified_at
FROM users WHERE id = 3;

-- Test with non-super-admin caller (should fail if caller level >= target level)
-- SELECT udf_auth_set_verification(2, 3, TRUE, NULL);

-- Test with no parameters specified (should fail)
-- SELECT udf_auth_set_verification(1, 3);

-- Test with non-existent target user
SELECT udf_auth_set_verification(1, 99999, TRUE, NULL);

-- Test setting verification to TRUE clears the timestamp
-- then sets it to FALSE clears the timestamp
*/
