-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_auth_get_user_permissions
-- Purpose:  Return the *effective* permission codes + role code for a given user.
--           Used by the API auth module to bake claims into the JWT at login
--           time and on refresh.
-- ══════════════════════════════════════════════════════════════════════════════
-- Resolution order (matches udf_check_permission):
--   Super Admin (role level 0)     → ALL active permission codes
--   Otherwise:
--     (role_permissions for u.role_id)
--     ∪ user_permissions(grant_type='grant')
--     ∖ user_permissions(grant_type='deny')
--
-- NOTE: This intentionally returns the *union* as distinct rows so the Node
-- layer can turn it into a plain `permissions: string[]` JWT claim.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_auth_get_user_permissions(
    p_user_id BIGINT
)
-- ── Return shape ─────────────────────────────────────────────
-- Always returns at least ONE row for a valid active user — the
-- role_code. If the user has zero effective permissions (e.g. a
-- "student" role with no role_permissions seeded yet), the sole
-- row will have permission_code IS NULL. Callers filter nulls
-- when building the JWT claim array.
-- ─────────────────────────────────────────────────────────────
RETURNS TABLE (
    permission_code CITEXT,
    role_code       CITEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id    BIGINT;
    v_role_level SMALLINT;
    v_role_code  CITEXT;
BEGIN
    -- ── Resolve the user's role ──────────────────────────────
    SELECT u.role_id, r.level, r.code
    INTO v_role_id, v_role_level, v_role_code
    FROM users u
    INNER JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id
      AND u.is_deleted = FALSE
      AND u.is_active  = TRUE
      AND r.is_deleted = FALSE
      AND r.is_active  = TRUE;

    IF v_role_id IS NULL THEN
        RETURN;  -- no rows
    END IF;

    -- ── Super Admin: every active permission in the catalog ──
    IF v_role_level = 0 THEN
        RETURN QUERY
        SELECT p.code::CITEXT AS permission_code,
               v_role_code    AS role_code
        FROM permissions p
        WHERE p.is_deleted = FALSE
          AND p.is_active  = TRUE;

        -- Fallback sentinel row if the catalog is empty.
        IF NOT FOUND THEN
            RETURN QUERY SELECT NULL::CITEXT, v_role_code;
        END IF;
        RETURN;
    END IF;

    -- ── Regular user: role perms + user grants − user denies ──
    RETURN QUERY
    WITH denied AS (
        SELECT up.permission_id
        FROM user_permissions up
        WHERE up.user_id = p_user_id
          AND up.grant_type = 'deny'
          AND up.is_deleted = FALSE
          AND up.is_active  = TRUE
    ),
    granted_ids AS (
        SELECT rp.permission_id
        FROM role_permissions rp
        WHERE rp.role_id = v_role_id
          AND rp.is_deleted = FALSE
          AND rp.is_active  = TRUE
        UNION
        SELECT up.permission_id
        FROM user_permissions up
        WHERE up.user_id = p_user_id
          AND up.grant_type = 'grant'
          AND up.is_deleted = FALSE
          AND up.is_active  = TRUE
    )
    SELECT DISTINCT p.code::CITEXT AS permission_code,
                    v_role_code    AS role_code
    FROM permissions p
    JOIN granted_ids g ON g.permission_id = p.id
    WHERE p.is_deleted = FALSE
      AND p.is_active  = TRUE
      AND p.id NOT IN (SELECT permission_id FROM denied);

    -- ── Sentinel row: valid user with zero effective perms ──
    -- Ensures the caller can still learn role_code even when no
    -- role_permissions have been seeded for this role yet. The
    -- Node layer filters NULL permission_code out of its claim
    -- array.
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::CITEXT, v_role_code;
    END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT * FROM udf_auth_get_user_permissions(1);  -- super admin
-- SELECT * FROM udf_auth_get_user_permissions(5);  -- regular user
