-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_auto_create_resource_permissions
-- Purpose: Auto-generate standard CRUD+own permissions for a new resource
--          and auto-assign to Super Admin (all) and Admin (all except delete)
-- ══════════════════════════════════════════════════════════════════════════════
-- Usage:
--   SELECT udf_auto_create_resource_permissions('webinar', 1);
--   SELECT udf_auto_create_resource_permissions('blog', 1, TRUE);  -- with own scope
--
-- Generates these permissions for the resource:
--   resource.create          (global)
--   resource.read            (global)
--   resource.read.own        (own)      — only if p_include_own = TRUE
--   resource.update          (global)
--   resource.update.own      (own)      — only if p_include_own = TRUE
--   resource.delete          (global)
--   resource.restore         (global)
--
-- Then auto-assigns:
--   Super Admin (role level 0) → ALL generated permissions
--   Admin (role level 1)       → ALL EXCEPT action = 'delete'
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_auto_create_resource_permissions(
    p_resource          TEXT,
    p_created_by        BIGINT  DEFAULT NULL,
    p_include_own       BOOLEAN DEFAULT FALSE,
    p_start_order       INT     DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resource      TEXT;
    v_display_name  TEXT;
    v_perm_id       BIGINT;
    v_count         INT := 0;
    v_rp_count      INT := 0;
    v_sa_role_id    BIGINT;
    v_admin_role_id BIGINT;
    v_order         INT;
    v_actions       TEXT[][] := ARRAY[
        ARRAY['create',  'global', 'Create'],
        ARRAY['read',    'global', 'View All'],
        ARRAY['update',  'global', 'Update Any'],
        ARRAY['delete',  'global', 'Delete'],
        ARRAY['restore', 'global', 'Restore']
    ];
    v_own_actions   TEXT[][] := ARRAY[
        ARRAY['read',   'own', 'View Own'],
        ARRAY['update', 'own', 'Update Own']
    ];
    v_action_row    TEXT[];
    v_code          TEXT;
    v_name          TEXT;
BEGIN

    v_resource := LOWER(TRIM(p_resource));

    IF v_resource = '' OR v_resource IS NULL THEN
        RAISE EXCEPTION 'Resource name cannot be empty.';
    END IF;

    -- ── Build display name: 'user_activity' → 'User Activity' ──
    v_display_name := INITCAP(REPLACE(v_resource, '_', ' '));

    -- ── Get Super Admin and Admin role IDs ──
    SELECT id INTO v_sa_role_id FROM roles WHERE level = 0 AND is_deleted = FALSE LIMIT 1;
    SELECT id INTO v_admin_role_id FROM roles WHERE level = 1 AND is_deleted = FALSE LIMIT 1;

    -- ── Calculate starting display_order if not provided ──
    IF p_start_order = 0 THEN
        SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM permissions;
    ELSE
        v_order := p_start_order;
    END IF;

    -- ── Create global-scope permissions ──
    FOREACH v_action_row SLICE 1 IN ARRAY v_actions LOOP

        v_code := v_resource || '.' || v_action_row[1];
        v_name := v_action_row[3] || ' ' || v_display_name;

        -- Skip if already exists
        IF EXISTS (SELECT 1 FROM permissions WHERE code = v_code::CITEXT AND is_deleted = FALSE) THEN
            CONTINUE;
        END IF;

        INSERT INTO permissions (name, code, resource, action, scope, display_order, created_by, updated_by)
        VALUES (v_name, v_code, v_resource, v_action_row[1], v_action_row[2], v_order, p_created_by, p_created_by)
        RETURNING id INTO v_perm_id;

        v_count := v_count + 1;
        v_order := v_order + 1;

        -- ── Auto-assign to Super Admin ──
        IF v_sa_role_id IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_id, created_by, updated_by)
            VALUES (v_sa_role_id, v_perm_id, p_created_by, p_created_by)
            ON CONFLICT DO NOTHING;
            v_rp_count := v_rp_count + 1;
        END IF;

        -- ── Auto-assign to Admin (all except delete) ──
        IF v_admin_role_id IS NOT NULL AND v_action_row[1] <> 'delete' THEN
            INSERT INTO role_permissions (role_id, permission_id, created_by, updated_by)
            VALUES (v_admin_role_id, v_perm_id, p_created_by, p_created_by)
            ON CONFLICT DO NOTHING;
            v_rp_count := v_rp_count + 1;
        END IF;

    END LOOP;

    -- ── Create own-scope permissions (if requested) ──
    IF p_include_own THEN
        FOREACH v_action_row SLICE 1 IN ARRAY v_own_actions LOOP

            v_code := v_resource || '.' || v_action_row[1] || '.own';
            v_name := v_action_row[3] || ' ' || v_display_name;

            IF EXISTS (SELECT 1 FROM permissions WHERE code = v_code::CITEXT AND is_deleted = FALSE) THEN
                CONTINUE;
            END IF;

            INSERT INTO permissions (name, code, resource, action, scope, display_order, created_by, updated_by)
            VALUES (v_name, v_code, v_resource, v_action_row[1], 'own', v_order, p_created_by, p_created_by)
            RETURNING id INTO v_perm_id;

            v_count := v_count + 1;
            v_order := v_order + 1;

            -- Own-scope permissions go to Super Admin and Admin (not delete-related)
            IF v_sa_role_id IS NOT NULL THEN
                INSERT INTO role_permissions (role_id, permission_id, created_by, updated_by)
                VALUES (v_sa_role_id, v_perm_id, p_created_by, p_created_by)
                ON CONFLICT DO NOTHING;
                v_rp_count := v_rp_count + 1;
            END IF;

            IF v_admin_role_id IS NOT NULL THEN
                INSERT INTO role_permissions (role_id, permission_id, created_by, updated_by)
                VALUES (v_admin_role_id, v_perm_id, p_created_by, p_created_by)
                ON CONFLICT DO NOTHING;
                v_rp_count := v_rp_count + 1;
            END IF;

        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('%s permissions created for resource "%s", %s role assignments added.',
                          v_count, v_resource, v_rp_count),
        'permissions_created', v_count,
        'role_assignments_created', v_rp_count,
        'resource', v_resource
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error creating resource permissions: %s', SQLERRM),
        'permissions_created', 0,
        'role_assignments_created', 0,
        'resource', p_resource
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Create standard CRUD permissions for a new resource
-- SELECT udf_auto_create_resource_permissions('webinar', 1);

-- Test 2: Create CRUD + own-scope permissions
-- SELECT udf_auto_create_resource_permissions('course', 1, TRUE);

-- Test 3: Verify permissions created
-- SELECT * FROM udf_get_permissions(p_filter_resource := 'webinar');

-- Test 4: Verify role assignments
-- SELECT * FROM udf_get_role_permissions(p_filter_perm_resource := 'webinar');

-- ══════════════════════════════════════════════════════════════════════════════
