-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_permissions_restore
-- PURPOSE: Restore a soft-deleted permission
-- RETURNS: JSONB { success, message }
-- USAGE: SELECT udf_permissions_restore(p_id := 100);
-- ══════════════════════════════════════════════════════════════════════════════
-- NOTE: Does NOT auto-restore role_permissions or user_permissions.
--       Those must be restored separately to avoid unintended access grants.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_permissions_restore(
    p_id     BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    -- ── Check existence ──
    IF NOT EXISTS (SELECT 1 FROM permissions WHERE id = p_id AND is_deleted = TRUE) THEN
        RAISE EXCEPTION 'Permission with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Restore ──
    UPDATE permissions
    SET is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Permission %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring permission: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Restore a deleted permission
-- SELECT udf_permissions_restore(p_id := 100);

-- ══════════════════════════════════════════════════════════════════════════════
