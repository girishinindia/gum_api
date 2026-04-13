-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_role_permissions_assign
-- Purpose: Assign a permission to a role (or re-activate soft-deleted assignment)
-- RETURNS: JSONB { success, message, id }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_role_permissions_assign(
    p_role_id           BIGINT,
    p_permission_id     BIGINT,
    p_created_by        BIGINT DEFAULT NULL
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

    -- ── Validate role exists and is active ──
    IF NOT EXISTS (SELECT 1 FROM roles WHERE id = p_role_id AND is_deleted = FALSE AND is_active = TRUE) THEN
        RAISE EXCEPTION 'Role with ID % does not exist, is deleted, or is inactive.', p_role_id;
    END IF;

    -- ── Validate permission exists and is active ──
    IF NOT EXISTS (SELECT 1 FROM permissions WHERE id = p_permission_id AND is_deleted = FALSE AND is_active = TRUE) THEN
        RAISE EXCEPTION 'Permission with ID % does not exist, is deleted, or is inactive.', p_permission_id;
    END IF;

    -- ── Check if assignment already exists (including soft-deleted) ──
    SELECT id INTO v_existing_id
    FROM role_permissions
    WHERE role_id = p_role_id
      AND permission_id = p_permission_id
      AND is_deleted = TRUE;

    IF v_existing_id IS NOT NULL THEN
        -- ── Re-activate soft-deleted assignment ──
        UPDATE role_permissions
        SET is_deleted  = FALSE,
            is_active   = TRUE,
            deleted_at  = NULL,
            updated_by  = p_created_by,
            updated_at  = CURRENT_TIMESTAMP
        WHERE id = v_existing_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'message', format('Role-permission assignment restored (ID: %s).', v_existing_id),
            'id', v_existing_id
        );
    END IF;

    -- ── Check if already active ──
    IF EXISTS (
        SELECT 1 FROM role_permissions
        WHERE role_id = p_role_id
          AND permission_id = p_permission_id
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Permission % is already assigned to role %.', p_permission_id, p_role_id;
    END IF;

    -- ── Insert new assignment ──
    INSERT INTO role_permissions (role_id, permission_id, created_by, updated_by)
    VALUES (p_role_id, p_permission_id, p_created_by, p_created_by)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Permission %s assigned to role %s (ID: %s).', p_permission_id, p_role_id, v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error assigning permission to role: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Assign permission 1 (user.create) to role 2 (admin)
-- SELECT udf_role_permissions_assign(p_role_id := 2, p_permission_id := 1, p_created_by := 1);

-- ══════════════════════════════════════════════════════════════════════════════
