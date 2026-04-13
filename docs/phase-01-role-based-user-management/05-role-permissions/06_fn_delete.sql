-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_role_permissions_delete
-- Purpose: Soft delete a role-permission assignment by ID
-- RETURNS: JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_role_permissions_delete(
    p_id     BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    IF NOT EXISTS (SELECT 1 FROM role_permissions WHERE id = p_id AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'Role-permission assignment with ID % does not exist or is already deleted.', p_id;
    END IF;

    UPDATE role_permissions
    SET is_deleted  = TRUE,
        is_active   = FALSE,
        deleted_at  = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Role-permission assignment %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting role-permission assignment: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Delete by ID
-- SELECT udf_role_permissions_delete(p_id := 1);

-- ══════════════════════════════════════════════════════════════════════════════
