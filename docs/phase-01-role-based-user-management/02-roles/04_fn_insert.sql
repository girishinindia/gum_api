-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_roles_insert
-- PURPOSE: Insert a new role with validation
-- RETURNS: JSONB { success, message, id }
-- USAGE: SELECT udf_roles_insert(p_name := 'Branch Manager', p_code := 'branch_manager');
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_roles_insert(
    p_name                       CITEXT,
    p_code                       CITEXT,
    p_description                TEXT DEFAULT NULL,
    p_parent_role_id             BIGINT DEFAULT NULL,
    p_level                      SMALLINT DEFAULT 99,
    p_is_system_role             BOOLEAN DEFAULT FALSE,
    p_display_order              INT DEFAULT 0,
    p_icon                       TEXT DEFAULT NULL,
    p_color                      TEXT DEFAULT NULL,
    p_is_active                  BOOLEAN DEFAULT TRUE,
    p_created_by                 BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id BIGINT;
BEGIN

    -- Validate name
    IF TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'Role name cannot be empty.';
    END IF;

    -- Validate code
    IF TRIM(p_code) = '' THEN
        RAISE EXCEPTION 'Role code cannot be empty.';
    END IF;

    -- Validate parent role exists if provided
    IF p_parent_role_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM roles WHERE id = p_parent_role_id AND is_deleted = FALSE) THEN
            RAISE EXCEPTION 'Parent role with ID % does not exist or is deleted.', p_parent_role_id;
        END IF;
    END IF;

    -- Check for duplicate name
    IF EXISTS (SELECT 1 FROM roles WHERE name = p_name AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'Role with name "%" already exists.', p_name;
    END IF;

    -- Check for duplicate code
    IF EXISTS (SELECT 1 FROM roles WHERE code = p_code AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'Role with code "%" already exists.', p_code;
    END IF;

    -- Insert role
    INSERT INTO roles (
        name, code, description, parent_role_id, level,
        is_system_role, display_order, icon, color,
        is_active, created_by, updated_by
    )
    VALUES (
        TRIM(p_name), LOWER(TRIM(p_code)), p_description, p_parent_role_id, p_level,
        p_is_system_role, p_display_order, p_icon, p_color,
        p_is_active, p_created_by, p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Role inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting role: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Insert a custom role
-- SELECT udf_roles_insert(
--     p_name          := 'Branch Manager',
--     p_code          := 'branch_manager',
--     p_description   := 'Manages a specific branch location',
--     p_parent_role_id := (SELECT id FROM roles WHERE code = 'admin'),
--     p_level         := 2,
--     p_display_order := 9
-- );

-- Test 2: Insert with icon and color
-- SELECT udf_roles_insert(
--     p_name          := 'Reviewer',
--     p_code          := 'reviewer',
--     p_description   := 'Reviews and approves course content',
--     p_level         := 3,
--     p_icon          := 'check-circle',
--     p_color         := '#4CAF50'
-- );

-- ══════════════════════════════════════════════════════════════════════════════
