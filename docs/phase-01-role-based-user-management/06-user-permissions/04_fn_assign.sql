-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_user_permissions_assign
-- Purpose: Assign (grant/deny) a permission override to a user
-- RETURNS: JSONB { success, message, id }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_user_permissions_assign(
    p_user_id           BIGINT,
    p_permission_id     BIGINT,
    p_grant_type        TEXT    DEFAULT 'grant',
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id   BIGINT;
    v_new_id        BIGINT;
BEGIN

    -- ── Validate grant_type ──
    IF p_grant_type NOT IN ('grant', 'deny') THEN
        RAISE EXCEPTION 'Invalid grant_type "%". Must be "grant" or "deny".', p_grant_type;
    END IF;

    -- ── Validate user exists and is active ──
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND is_deleted = FALSE AND is_active = TRUE) THEN
        RAISE EXCEPTION 'User with ID % does not exist, is deleted, or is inactive.', p_user_id;
    END IF;

    -- ── Validate permission exists and is active ──
    IF NOT EXISTS (SELECT 1 FROM permissions WHERE id = p_permission_id AND is_deleted = FALSE AND is_active = TRUE) THEN
        RAISE EXCEPTION 'Permission with ID % does not exist, is deleted, or is inactive.', p_permission_id;
    END IF;

    -- ── Check if assignment already exists (soft-deleted) ──
    SELECT id INTO v_existing_id
    FROM user_permissions
    WHERE user_id = p_user_id
      AND permission_id = p_permission_id
      AND is_deleted = TRUE;

    IF v_existing_id IS NOT NULL THEN
        -- ── Re-activate with possibly updated grant_type ──
        UPDATE user_permissions
        SET is_deleted  = FALSE,
            is_active   = TRUE,
            deleted_at  = NULL,
            grant_type  = p_grant_type,
            updated_by  = p_created_by,
            updated_at  = CURRENT_TIMESTAMP
        WHERE id = v_existing_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'message', format('User-permission override restored (ID: %s, type: %s).', v_existing_id, p_grant_type),
            'id', v_existing_id
        );
    END IF;

    -- ── Check if already active ──
    IF EXISTS (
        SELECT 1 FROM user_permissions
        WHERE user_id = p_user_id
          AND permission_id = p_permission_id
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Permission % already has an active override for user %. Use update to change grant_type.', p_permission_id, p_user_id;
    END IF;

    -- ── Insert new override ──
    INSERT INTO user_permissions (user_id, permission_id, grant_type, created_by, updated_by)
    VALUES (p_user_id, p_permission_id, p_grant_type, p_created_by, p_created_by)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Permission %s %sed for user %s (ID: %s).', p_permission_id, p_grant_type, p_user_id, v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error assigning permission to user: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Grant extra permission to user
-- SELECT udf_user_permissions_assign(p_user_id := 5, p_permission_id := 1, p_grant_type := 'grant', p_created_by := 1);

-- Test 2: Deny a permission from a user
-- SELECT udf_user_permissions_assign(p_user_id := 5, p_permission_id := 10, p_grant_type := 'deny', p_created_by := 1);

-- ══════════════════════════════════════════════════════════════════════════════
