-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_roles_restore
-- PURPOSE: Restore a soft-deleted role
-- RETURNS: JSONB { success, message }
-- USAGE: SELECT udf_roles_restore(p_id := 9);
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_roles_restore(
    p_id     BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    -- Verify role exists and is deleted
    IF NOT EXISTS (SELECT 1 FROM roles WHERE id = p_id AND is_deleted = TRUE) THEN
        RAISE EXCEPTION 'Role with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- Restore role
    UPDATE roles
    SET
        is_deleted = FALSE,
        is_active = TRUE,
        deleted_at = NULL
    WHERE id = p_id;

    -- NOTE: Role_permissions are NOT auto-restored to avoid unintended access grants.
    -- Use udf_role_permissions_restore() to selectively restore specific assignments.

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Role %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring role: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Restore a deleted role
-- SELECT udf_roles_restore(p_id := 9);

-- ══════════════════════════════════════════════════════════════════════════════
