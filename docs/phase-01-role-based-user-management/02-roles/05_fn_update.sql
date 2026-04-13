-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_roles_update
-- PURPOSE: Update an existing role
-- RETURNS: JSONB { success, message }
-- USAGE: SELECT udf_roles_update(p_id := 1, p_name := 'Super Administrator');
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_roles_update(
    p_id                         BIGINT,
    p_name                       CITEXT DEFAULT NULL,
    p_code                       CITEXT DEFAULT NULL,
    p_description                TEXT DEFAULT NULL,
    p_parent_role_id             BIGINT DEFAULT NULL,
    p_level                      SMALLINT DEFAULT NULL,
    p_display_order              INT DEFAULT NULL,
    p_icon                       TEXT DEFAULT NULL,
    p_color                      TEXT DEFAULT NULL,
    p_is_active                  BOOLEAN DEFAULT NULL,
    p_updated_by                 BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_current_name CITEXT;
    v_is_system    BOOLEAN;
BEGIN

    -- Get current values
    SELECT name, is_system_role
    INTO v_current_name, v_is_system
    FROM roles
    WHERE id = p_id AND is_deleted = FALSE;

    IF v_current_name IS NULL THEN
        RAISE EXCEPTION 'Role with ID % does not exist or is deleted.', p_id;
    END IF;

    -- Prevent renaming system role code
    IF v_is_system AND p_code IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot change code of a system role.';
    END IF;

    -- Prevent self-reference
    IF p_parent_role_id IS NOT NULL AND p_parent_role_id = p_id THEN
        RAISE EXCEPTION 'Cannot set parent_role_id to the same ID (self-reference).';
    END IF;

    -- Validate parent role if provided
    IF p_parent_role_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM roles WHERE id = p_parent_role_id AND is_deleted = FALSE) THEN
            RAISE EXCEPTION 'Parent role with ID % does not exist or is deleted.', p_parent_role_id;
        END IF;
    END IF;

    -- Update role
    UPDATE roles
    SET
        name = COALESCE(NULLIF(TRIM(p_name)::CITEXT, ''), name),
        code = COALESCE(NULLIF(LOWER(TRIM(p_code))::CITEXT, ''), code),
        description = CASE WHEN p_description IS NOT NULL THEN p_description ELSE description END,
        parent_role_id = COALESCE(p_parent_role_id, parent_role_id),
        level = COALESCE(p_level, level),
        display_order = COALESCE(p_display_order, display_order),
        icon = CASE WHEN p_icon IS NOT NULL THEN p_icon ELSE icon END,
        color = CASE WHEN p_color IS NOT NULL THEN p_color ELSE color END,
        is_active = COALESCE(p_is_active, is_active),
        updated_by = p_updated_by,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Role %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating role: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Update role name
-- SELECT udf_roles_update(p_id := 1, p_name := 'Super Administrator');

-- Test 2: Update display order and icon
-- SELECT udf_roles_update(p_id := 3, p_display_order := 10, p_icon := 'shield-check');

-- Test 3: Deactivate a role
-- SELECT udf_roles_update(p_id := 6, p_is_active := FALSE);

-- ══════════════════════════════════════════════════════════════════════════════
