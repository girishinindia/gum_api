-- ============================================================================
-- File: 16_fn_change_role.sql
-- Purpose: Change a user's role (admin operation)
--          1. Only super admin (role level 0) can change roles
--          2. Uses hierarchy checks to validate caller permissions
--          3. Prevents changing primary super admin's (id=1) role
--          4. Updates target user with audit trail
-- Depends: udf_check_hierarchy_access, udf_check_user_active
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_auth_change_role(
  p_caller_id BIGINT,
  p_target_user_id BIGINT,
  p_new_role_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hierarchy_check JSONB;
  v_target_check JSONB;
  v_role_check RECORD;
  v_old_role_id BIGINT;
  v_caller_role_level INT;
  v_target_role_level INT;
BEGIN
  -- Verify caller has permission to change roles (must be super admin)
  v_hierarchy_check := udf_check_hierarchy_access(p_caller_id, p_target_user_id, 'change_role');
  IF NOT (v_hierarchy_check->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_hierarchy_check->>'message'
    );
  END IF;

  v_caller_role_level := (v_hierarchy_check->>'caller_role_level')::INT;

  -- Only level 0 (super admin) can change roles
  IF v_caller_role_level != 0 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Only super admin can change user roles'
    );
  END IF;

  -- Verify target user is active and not deleted
  v_target_check := udf_check_user_active(p_target_user_id);
  IF NOT (v_target_check->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', v_target_check->>'message'
    );
  END IF;

  -- Prevent changing primary super admin's role
  IF p_target_user_id = 1 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Cannot change primary super admin role'
    );
  END IF;

  -- Verify new role exists and is active
  SELECT id, level, is_active, is_deleted
  INTO v_role_check
  FROM roles
  WHERE id = p_new_role_id;

  IF v_role_check IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'New role not found'
    );
  END IF;

  IF v_role_check.is_deleted THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'New role is deleted'
    );
  END IF;

  IF NOT v_role_check.is_active THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'New role is not active'
    );
  END IF;

  -- Get old role ID before update
  SELECT role_id INTO v_old_role_id
  FROM users
  WHERE id = p_target_user_id;

  -- Update user's role
  UPDATE users
  SET
    role_id = p_new_role_id,
    updated_by = p_caller_id,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'User role changed successfully',
    'old_role_id', v_old_role_id,
    'new_role_id', p_new_role_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'message', 'Error changing user role: ' || SQLERRM
  );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (uncomment to test)
-- ============================================================================
/*
-- Assuming super admin id=1 exists, user id=3 exists, role id=2 exists
SELECT udf_auth_change_role(1, 3, 2);

-- Verify the role was changed
SELECT id, role_id FROM users WHERE id = 3;

-- Test with non-super-admin caller (should fail)
-- Assuming user id=2 has role level > 1
SELECT udf_auth_change_role(2, 3, 2);

-- Test changing primary super admin's role (should fail)
SELECT udf_auth_change_role(1, 1, 2);

-- Test with non-existent target user
SELECT udf_auth_change_role(1, 99999, 2);

-- Test with non-existent role
SELECT udf_auth_change_role(1, 3, 99999);

-- Test with inactive role (mark role as inactive first)
-- UPDATE roles SET is_active = FALSE WHERE id = 2;
-- SELECT udf_auth_change_role(1, 3, 2);
-- UPDATE roles SET is_active = TRUE WHERE id = 2; -- restore
*/
