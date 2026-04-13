-- ============================================================================
-- File: 18_fn_deactivate.sql
-- Purpose: Deactivate a user account (super admin operation)
--          1. Only super admin can deactivate users
--          2. Uses hierarchy checks to validate permissions
--          3. Prevents deactivating primary super admin (id=1)
--          4. Revokes all active sessions for the target user
--          5. Maintains audit trail
-- Depends: udf_check_hierarchy_access, udf_session_revoke_all
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_auth_deactivate(
  p_caller_id BIGINT,
  p_target_user_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hierarchy_check JSONB;
  v_revoke_result JSONB;
  v_caller_role_level INT;
  v_updated_rows INT;
BEGIN
  -- Verify caller has permission to deactivate users
  v_hierarchy_check := udf_check_hierarchy_access(p_caller_id, p_target_user_id, 'deactivate');
  IF NOT (v_hierarchy_check->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_hierarchy_check->>'message'
    );
  END IF;

  v_caller_role_level := (v_hierarchy_check->>'caller_role_level')::INT;

  -- Only super admin (level 0) can deactivate users
  IF v_caller_role_level != 0 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Only super admin can deactivate users'
    );
  END IF;

  -- Prevent deactivating primary super admin
  IF p_target_user_id = 1 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Cannot deactivate primary super admin'
    );
  END IF;

  -- Verify target user exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_target_user_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Target user not found'
    );
  END IF;

  -- Revoke all active sessions for the target user before deactivating
  v_revoke_result := udf_session_revoke_all(p_target_user_id, NULL);
  IF NOT (v_revoke_result->>'success')::BOOLEAN THEN
    -- Log warning but continue with deactivation
    RAISE WARNING 'Session revocation warning: %', v_revoke_result->>'message';
  END IF;

  -- Deactivate the user
  UPDATE users
  SET
    is_active = FALSE,
    updated_by = p_caller_id,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_target_user_id;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Failed to deactivate user'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'User deactivated successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'message', 'Error deactivating user: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (uncomment to test)
-- ============================================================================
/*
-- Assuming super admin id=1 exists, user id=3 exists and is active
SELECT udf_auth_deactivate(1, 3);

-- Verify user is now deactivated
SELECT id, is_active FROM users WHERE id = 3;

-- Test deactivating primary super admin (should fail)
SELECT udf_auth_deactivate(1, 1);

-- Test with non-super-admin caller (should fail)
-- Assuming user id=2 has role level > 1
SELECT udf_auth_deactivate(2, 3);

-- Test with non-existent target user
SELECT udf_auth_deactivate(1, 99999);

-- Test deactivating an already-deactivated user (should still return success)
-- UPDATE users SET is_active = FALSE WHERE id = 3;
-- SELECT udf_auth_deactivate(1, 3);
-- UPDATE users SET is_active = TRUE WHERE id = 3; -- restore for other tests

-- Verify sessions were revoked for the deactivated user
-- SELECT * FROM user_sessions WHERE user_id = 3 AND is_revoked = TRUE;
*/
