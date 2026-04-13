-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_roles_delete
-- PURPOSE: Soft delete a role (system roles cannot be deleted)
-- RETURNS: JSONB { success, message }
-- USAGE: SELECT udf_roles_delete(p_id := 9);
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_roles_delete(
    p_id     BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    -- Verify role exists
    IF NOT EXISTS (SELECT 1 FROM roles WHERE id = p_id AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'Role with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- Prevent deleting system roles
    IF EXISTS (SELECT 1 FROM roles WHERE id = p_id AND is_system_role = TRUE) THEN
        RAISE EXCEPTION 'Cannot delete a system role. System roles are protected.';
    END IF;

    -- Check if role is assigned to any active users (1-to-many: users.role_id)
    IF EXISTS (SELECT 1 FROM users WHERE role_id = p_id AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'Cannot delete role: it is currently assigned to active users. Reassign users first.';
    END IF;

    -- Soft delete role
    UPDATE roles
    SET
        is_deleted = TRUE,
        is_active = FALSE,
        deleted_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    -- Cascade: soft delete all role_permissions for this role
    UPDATE role_permissions
    SET is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP
    WHERE role_id = p_id AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Role %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting role: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Try to delete a system role (should fail gracefully)
-- SELECT udf_roles_delete(p_id := 1);

-- Test 2: Delete a custom role
-- SELECT udf_roles_delete(p_id := 9);

-- ══════════════════════════════════════════════════════════════════════════════
