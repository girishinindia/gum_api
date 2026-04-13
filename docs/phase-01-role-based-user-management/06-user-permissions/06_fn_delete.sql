-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_user_permissions_delete
-- Purpose: Soft delete a user-permission override by ID
-- RETURNS: JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_user_permissions_delete(
    p_id     BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    IF NOT EXISTS (SELECT 1 FROM user_permissions WHERE id = p_id AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'User-permission override with ID % does not exist or is already deleted.', p_id;
    END IF;

    UPDATE user_permissions
    SET is_deleted  = TRUE,
        is_active   = FALSE,
        deleted_at  = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('User-permission override %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting user-permission override: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Delete by ID
-- SELECT udf_user_permissions_delete(p_id := 1);

-- ══════════════════════════════════════════════════════════════════════════════
