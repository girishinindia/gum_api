-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_user_permissions_revoke
-- Purpose: Soft-delete a user-permission override (remove grant or deny)
-- RETURNS: JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_user_permissions_revoke(
    p_user_id           BIGINT,
    p_permission_id     BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    -- ── Check assignment exists and is active ──
    IF NOT EXISTS (
        SELECT 1 FROM user_permissions
        WHERE user_id = p_user_id
          AND permission_id = p_permission_id
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active override found for user % and permission %.', p_user_id, p_permission_id;
    END IF;

    -- ── Soft delete ──
    UPDATE user_permissions
    SET is_deleted  = TRUE,
        is_active   = FALSE,
        deleted_at  = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id
      AND permission_id = p_permission_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Permission override %s revoked from user %s.', p_permission_id, p_user_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error revoking permission override from user: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Revoke override for user 5, permission 1
-- SELECT udf_user_permissions_revoke(p_user_id := 5, p_permission_id := 1);

-- ══════════════════════════════════════════════════════════════════════════════
