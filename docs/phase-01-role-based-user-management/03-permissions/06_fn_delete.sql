-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_permissions_delete
-- PURPOSE: Soft delete a permission + cascade to role_permissions & user_permissions
-- RETURNS: JSONB { success, message }
-- USAGE: SELECT udf_permissions_delete(p_id := 100);
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_permissions_delete(
    p_id     BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    -- ── Check existence ──
    IF NOT EXISTS (SELECT 1 FROM permissions WHERE id = p_id AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'Permission with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Soft delete the permission ──
    UPDATE permissions
    SET is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    -- ── Cascade: soft delete from role_permissions ──
    UPDATE role_permissions
    SET is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP
    WHERE permission_id = p_id AND is_deleted = FALSE;

    -- ── Cascade: soft delete from user_permissions ──
    UPDATE user_permissions
    SET is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP
    WHERE permission_id = p_id AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Permission %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting permission: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Delete a permission (cascades to both junction tables)
-- SELECT udf_permissions_delete(p_id := 100);

-- ══════════════════════════════════════════════════════════════════════════════
