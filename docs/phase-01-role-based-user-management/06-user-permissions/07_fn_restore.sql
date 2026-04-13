-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_user_permissions_restore
-- Purpose: Restore a soft-deleted user-permission override
-- RETURNS: JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_user_permissions_restore(
    p_id     BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    -- ── Check exists and is deleted ──
    IF NOT EXISTS (SELECT 1 FROM user_permissions WHERE id = p_id AND is_deleted = TRUE) THEN
        RAISE EXCEPTION 'User-permission override with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Validate the user is still active ──
    IF NOT EXISTS (
        SELECT 1 FROM users u
        INNER JOIN user_permissions up ON up.user_id = u.id
        WHERE up.id = p_id AND u.is_deleted = FALSE AND u.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Cannot restore: the associated user is deleted or inactive.';
    END IF;

    -- ── Validate the permission is still active ──
    IF NOT EXISTS (
        SELECT 1 FROM permissions p
        INNER JOIN user_permissions up ON up.permission_id = p.id
        WHERE up.id = p_id AND p.is_deleted = FALSE AND p.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Cannot restore: the associated permission is deleted or inactive.';
    END IF;

    -- ── Restore ──
    UPDATE user_permissions
    SET is_deleted  = FALSE,
        is_active   = TRUE,
        deleted_at  = NULL
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('User-permission override %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring user-permission override: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Restore a deleted override
-- SELECT udf_user_permissions_restore(p_id := 1);

-- ══════════════════════════════════════════════════════════════════════════════
