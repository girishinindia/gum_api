-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_role_permissions_revoke
-- Purpose: Soft-delete a role-permission assignment (revoke permission from role)
-- RETURNS: JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_role_permissions_revoke(
    p_role_id           BIGINT,
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
        SELECT 1 FROM role_permissions
        WHERE role_id = p_role_id
          AND permission_id = p_permission_id
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active assignment found for role % and permission %.', p_role_id, p_permission_id;
    END IF;

    -- ── Soft delete ──
    UPDATE role_permissions
    SET is_deleted  = TRUE,
        is_active   = FALSE,
        deleted_at  = CURRENT_TIMESTAMP
    WHERE role_id = p_role_id
      AND permission_id = p_permission_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Permission %s revoked from role %s.', p_permission_id, p_role_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error revoking permission from role: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Revoke permission 1 from role 2
-- SELECT udf_role_permissions_revoke(p_role_id := 2, p_permission_id := 1);

-- ══════════════════════════════════════════════════════════════════════════════
