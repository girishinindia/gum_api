-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_permissions_insert
-- PURPOSE: Insert a new permission with validation
--          Auto-assigns to Super Admin (all) and Admin (all except delete)
-- RETURNS: JSONB { success, message, id }
-- USAGE: SELECT udf_permissions_insert(p_name := 'Manage Email', p_code := 'email.manage', ...);
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_permissions_insert(
    p_name                       CITEXT,
    p_code                       CITEXT,
    p_resource                   TEXT,
    p_action                     TEXT,
    p_scope                      TEXT    DEFAULT 'global',
    p_description                TEXT    DEFAULT NULL,
    p_display_order              INT     DEFAULT 0,
    p_is_active                  BOOLEAN DEFAULT TRUE,
    p_created_by                 BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_id        BIGINT;
    v_sa_role_id    BIGINT;
    v_admin_role_id BIGINT;
BEGIN

    -- ── Validate name ──
    IF TRIM(p_name::TEXT) = '' THEN
        RAISE EXCEPTION 'Permission name cannot be empty.';
    END IF;

    -- ── Validate code ──
    IF TRIM(p_code::TEXT) = '' THEN
        RAISE EXCEPTION 'Permission code cannot be empty.';
    END IF;

    -- ── Validate resource ──
    IF TRIM(p_resource) = '' THEN
        RAISE EXCEPTION 'Permission resource cannot be empty.';
    END IF;

    -- ── Validate action ──
    IF TRIM(p_action) = '' THEN
        RAISE EXCEPTION 'Permission action cannot be empty.';
    END IF;

    -- ── Check duplicate code ──
    IF EXISTS (SELECT 1 FROM permissions WHERE code = LOWER(TRIM(p_code)) AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'Permission with code "%" already exists.', p_code;
    END IF;

    -- ── Check duplicate resource+action+scope ──
    IF EXISTS (
        SELECT 1 FROM permissions
        WHERE resource = LOWER(TRIM(p_resource))
          AND action   = LOWER(TRIM(p_action))
          AND scope    = LOWER(TRIM(COALESCE(p_scope, 'global')))
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Permission for resource=%, action=%, scope=% already exists.',
            p_resource, p_action, COALESCE(p_scope, 'global');
    END IF;

    -- ── Insert permission ──
    INSERT INTO permissions (
        name, code, description, resource, action, scope,
        display_order, is_active, created_by, updated_by
    )
    VALUES (
        TRIM(p_name),
        LOWER(TRIM(p_code)),
        p_description,
        LOWER(TRIM(p_resource)),
        LOWER(TRIM(p_action)),
        LOWER(TRIM(COALESCE(p_scope, 'global'))),
        p_display_order,
        p_is_active,
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    -- ══════════════════════════════════════════════════════════════════════
    -- Auto-assign to Super Admin (level 0) → ALL permissions
    -- ══════════════════════════════════════════════════════════════════════
    SELECT id INTO v_sa_role_id FROM roles WHERE level = 0 AND is_deleted = FALSE LIMIT 1;

    IF v_sa_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id, created_by, updated_by)
        VALUES (v_sa_role_id, v_new_id, p_created_by, p_created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- Auto-assign to Admin (level 1) → ALL except action = 'delete'
    -- ══════════════════════════════════════════════════════════════════════
    IF LOWER(TRIM(p_action)) <> 'delete' THEN
        SELECT id INTO v_admin_role_id FROM roles WHERE level = 1 AND is_deleted = FALSE LIMIT 1;

        IF v_admin_role_id IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_id, created_by, updated_by)
            VALUES (v_admin_role_id, v_new_id, p_created_by, p_created_by)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Permission inserted successfully with ID: %s (auto-assigned to Super Admin%s).',
                          v_new_id,
                          CASE WHEN LOWER(TRIM(p_action)) <> 'delete' THEN ' and Admin' ELSE '' END),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting permission: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Insert a permission (auto-assigns to Super Admin + Admin)
-- SELECT udf_permissions_insert(
--     p_name          := 'Manage Email Templates',
--     p_code          := 'email_template.manage',
--     p_resource      := 'email_template',
--     p_action        := 'manage',
--     p_display_order := 106
-- );

-- Test 2: Insert a delete permission (auto-assigns to Super Admin ONLY)
-- SELECT udf_permissions_insert(
--     p_name          := 'Delete Email Template',
--     p_code          := 'email_template.delete',
--     p_resource      := 'email_template',
--     p_action        := 'delete',
--     p_display_order := 107
-- );

-- ══════════════════════════════════════════════════════════════════════════════
