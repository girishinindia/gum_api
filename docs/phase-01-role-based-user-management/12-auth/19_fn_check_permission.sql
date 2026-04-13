-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_check_permission
-- Purpose: Check if a user has a specific permission
-- ══════════════════════════════════════════════════════════════════════════════
-- Resolution order:
--   1. Check user_permissions for explicit 'deny'  → DENY
--   2. Check user_permissions for explicit 'grant'  → ALLOW
--   3. Check role_permissions for the user's role   → ALLOW / DENY
--
-- Super Admin (role level 0) bypasses all checks → always TRUE.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_check_permission(
    p_user_id           BIGINT,
    p_permission_code   TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id       BIGINT;
    v_role_level    SMALLINT;
    v_perm_id       BIGINT;
    v_user_override TEXT;
BEGIN

    -- ── Get the user's role ──
    SELECT u.role_id, r.level
    INTO v_role_id, v_role_level
    FROM users u
        INNER JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id
      AND u.is_deleted = FALSE
      AND u.is_active  = TRUE;

    IF v_role_id IS NULL THEN
        RETURN FALSE;   -- user not found / inactive / deleted
    END IF;

    -- ── Super Admin bypass (level 0) ──
    IF v_role_level = 0 THEN
        RETURN TRUE;
    END IF;

    -- ── Resolve permission_id from code ──
    SELECT id INTO v_perm_id
    FROM permissions
    WHERE code = LOWER(TRIM(p_permission_code))
      AND is_deleted = FALSE
      AND is_active  = TRUE;

    IF v_perm_id IS NULL THEN
        RETURN FALSE;   -- permission doesn't exist or inactive
    END IF;

    -- ── Step 1: Check user-level overrides (deny takes precedence) ──
    SELECT grant_type INTO v_user_override
    FROM user_permissions
    WHERE user_id       = p_user_id
      AND permission_id = v_perm_id
      AND is_deleted    = FALSE
      AND is_active     = TRUE;

    IF v_user_override = 'deny' THEN
        RETURN FALSE;
    END IF;

    IF v_user_override = 'grant' THEN
        RETURN TRUE;
    END IF;

    -- ── Step 2: Check role-level permissions ──
    IF EXISTS (
        SELECT 1 FROM role_permissions
        WHERE role_id       = v_role_id
          AND permission_id = v_perm_id
          AND is_deleted    = FALSE
          AND is_active     = TRUE
    ) THEN
        RETURN TRUE;
    END IF;

    -- ── No match → deny ──
    RETURN FALSE;

END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Check if user 1 (super admin) has any permission → always TRUE
-- SELECT udf_check_permission(1, 'course.create');

-- Test 2: Check if user 5 has 'user.create' permission
-- SELECT udf_check_permission(5, 'user.create');

-- Test 3: Use in a guard clause
-- DO $$
-- BEGIN
--     IF NOT udf_check_permission(5, 'course.create') THEN
--         RAISE EXCEPTION 'Access denied: missing permission course.create';
--     END IF;
--     -- proceed with operation...
-- END $$;

-- ══════════════════════════════════════════════════════════════════════════════
