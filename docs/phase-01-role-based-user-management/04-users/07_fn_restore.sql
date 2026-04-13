-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_users_restore
-- PURPOSE: Restore a soft-deleted user with hierarchy checks
-- RETURNS: JSONB { success, message }
-- USAGE: SELECT udf_users_restore(p_caller_id := 1, p_id := 3);
-- ══════════════════════════════════════════════════════════════════════════════
-- Only super admin (level=0) can restore users via hierarchy check.
-- Cannot restore a super admin (if target's role is super admin level=0, reject).
-- Validates that the user's role is still active before restoring.
-- Validates that the user's country is still active before restoring.
-- DEPENDS ON: users, roles, countries, udf_check_hierarchy_access
-- ══════════════════════════════════════════════════════════════════════════════


-- Drop old function signatures
DROP FUNCTION IF EXISTS udf_users_restore(BIGINT);

CREATE OR REPLACE FUNCTION udf_users_restore(
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
    v_role_id         BIGINT;
    v_country_id      BIGINT;
    v_role_level      BIGINT;
BEGIN

    -- Check hierarchy access: only super admin can restore
    v_hierarchy_check := udf_check_hierarchy_access(p_caller_id, p_id, 'restore');
    IF NOT (v_hierarchy_check ->> 'success')::BOOLEAN THEN
        RAISE EXCEPTION '%', v_hierarchy_check ->> 'message';
    END IF;

    -- Verify user exists and is deleted
    SELECT role_id, country_id
    INTO v_role_id, v_country_id
    FROM users
    WHERE id = p_id AND is_deleted = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- Get the role level
    SELECT level INTO v_role_level
    FROM roles
    WHERE id = v_role_id;

    -- Cannot restore a super admin
    IF v_role_level = 0 THEN
        RAISE EXCEPTION 'Cannot restore a super admin. Only non-super-admin users can be restored.';
    END IF;

    -- Validate role is still active
    IF NOT EXISTS (
        SELECT 1 FROM roles
        WHERE id = v_role_id
          AND is_active = TRUE
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Cannot restore user: role ID % is inactive or deleted. Update role first.', v_role_id;
    END IF;

    -- Validate parent country is still active
    IF NOT EXISTS (
        SELECT 1 FROM countries
        WHERE id = v_country_id
          AND is_active = TRUE
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Cannot restore user: country ID % is inactive or deleted. Update country first.', v_country_id;
    END IF;

    -- Restore user
    UPDATE users
    SET
        is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('User %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring user: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Restore a deleted user (caller=1 is super admin)
-- SELECT udf_users_restore(p_caller_id := 1, p_id := 3);

-- Test 2: Verify restore
-- SELECT user_id, user_first_name, user_is_deleted, user_is_active, role_name FROM uv_users WHERE user_id = 3;

-- Test 3: Should FAIL — user is not deleted
-- SELECT udf_users_restore(p_caller_id := 1, p_id := 1);

-- Test 4: Should FAIL — non-existent ID
-- SELECT udf_users_restore(p_caller_id := 1, p_id := 99999);

-- Test 5: Should FAIL — role was deactivated while user was deleted
-- (Deactivate role first, then try to restore)
-- SELECT udf_users_restore(p_caller_id := 1, p_id := 3);

-- Test 6: Should FAIL — cannot restore a super admin
-- (Assuming user 2 is deleted and has role level=1)
-- SELECT udf_users_restore(p_caller_id := 1, p_id := 2);

-- Test 7: Should FAIL — hierarchy access denied (caller is not super admin)
-- SELECT udf_users_restore(p_caller_id := 5, p_id := 3);

-- ══════════════════════════════════════════════════════════════════════════════
