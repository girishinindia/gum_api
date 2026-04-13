-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_users_delete
-- PURPOSE: Soft delete a user with hierarchy checks and session revocation
-- RETURNS: JSONB { success, message }
-- USAGE: SELECT udf_users_delete(p_caller_id := 1, p_id := 3);
-- ══════════════════════════════════════════════════════════════════════════════
-- Only super admin (level=0) can delete users via hierarchy check.
-- Cannot delete another super admin.
-- Cannot delete the primary super admin (id=1 or email='sa@growupmore.com').
-- On successful delete: revokes all sessions for the deleted user.
-- DEPENDS ON: users, roles, udf_check_hierarchy_access, udf_session_revoke_all
-- ══════════════════════════════════════════════════════════════════════════════


-- Drop old function signatures
DROP FUNCTION IF EXISTS sp_users_delete(BIGINT);
DROP FUNCTION IF EXISTS udf_users_delete(BIGINT);

CREATE OR REPLACE FUNCTION udf_users_delete(
    p_caller_id BIGINT,
    p_id        BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hierarchy_check JSONB;
    v_email           CITEXT;
    v_target_role_id  BIGINT;
    v_role_level      BIGINT;
    v_session_result  JSONB;
BEGIN

    -- Check hierarchy access: only super admin can delete
    v_hierarchy_check := udf_check_hierarchy_access(p_caller_id, p_id, 'delete');
    IF NOT (v_hierarchy_check ->> 'success')::BOOLEAN THEN
        RAISE EXCEPTION '%', v_hierarchy_check ->> 'message';
    END IF;

    -- Check if user exists and is not already deleted
    SELECT email, role_id
    INTO v_email, v_target_role_id
    FROM users
    WHERE id = p_id AND is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- Protect primary super admin by ID or email
    IF p_id = 1 OR v_email = 'sa@growupmore.com' THEN
        RAISE EXCEPTION 'Cannot delete the primary super admin (sa@growupmore.com).';
    END IF;

    -- Cannot delete another super admin
    IF EXISTS (
        SELECT 1 FROM roles
        WHERE id = v_target_role_id
          AND level = 0
    ) THEN
        RAISE EXCEPTION 'Cannot delete another super admin. Only a super admin can be deleted by... (permission denied).';
    END IF;

    -- Soft delete
    UPDATE users
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE
        id = p_id
        AND is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- Revoke all sessions for the deleted user
    v_session_result := udf_session_revoke_all(p_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('User %s deleted successfully. Sessions revoked.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting user: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Soft delete a user (caller=1 is super admin)
-- SELECT udf_users_delete(p_caller_id := 1, p_id := 3);

-- Test 2: Verify soft delete
-- SELECT user_id, user_first_name, user_is_deleted, user_deleted_at FROM uv_users WHERE user_id = 3;

-- Test 3: Should FAIL — already deleted
-- SELECT udf_users_delete(p_caller_id := 1, p_id := 3);

-- Test 4: Should FAIL — non-existent ID
-- SELECT udf_users_delete(p_caller_id := 1, p_id := 99999);

-- Test 5: Should FAIL — cannot delete primary super admin (id=1)
-- SELECT udf_users_delete(p_caller_id := 1, p_id := 1);

-- Test 6: Should FAIL — cannot delete another super admin
-- (Assuming user 2 is a super admin with level=1)
-- SELECT udf_users_delete(p_caller_id := 1, p_id := 2);

-- Test 7: Should FAIL — hierarchy access denied (caller is not super admin)
-- SELECT udf_users_delete(p_caller_id := 5, p_id := 3);

-- ══════════════════════════════════════════════════════════════════════════════
