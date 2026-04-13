-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_role_permissions_restore
-- Purpose: Restore a soft-deleted role-permission assignment
-- RETURNS: JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_role_permissions_restore(
    p_id     BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    -- ── Check exists and is deleted ──
    IF NOT EXISTS (SELECT 1 FROM role_permissions WHERE id = p_id AND is_deleted = TRUE) THEN
        RAISE EXCEPTION 'Role-permission assignment with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Validate the role is still active ──
    IF NOT EXISTS (
        SELECT 1 FROM roles r
        INNER JOIN role_permissions rp ON rp.role_id = r.id
        WHERE rp.id = p_id AND r.is_deleted = FALSE AND r.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Cannot restore: the associated role is deleted or inactive.';
    END IF;

    -- ── Validate the permission is still active ──
    IF NOT EXISTS (
        SELECT 1 FROM permissions p
        INNER JOIN role_permissions rp ON rp.permission_id = p.id
        WHERE rp.id = p_id AND p.is_deleted = FALSE AND p.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Cannot restore: the associated permission is deleted or inactive.';
    END IF;

    -- ── Restore ──
    UPDATE role_permissions
    SET is_deleted  = FALSE,
        is_active   = TRUE,
        deleted_at  = NULL
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Role-permission assignment %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring role-permission assignment: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Restore a deleted assignment
-- SELECT udf_role_permissions_restore(p_id := 1);

-- ══════════════════════════════════════════════════════════════════════════════
