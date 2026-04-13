-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_permissions_update
-- PURPOSE: Update an existing permission
-- RETURNS: JSONB { success, message }
-- USAGE: SELECT udf_permissions_update(p_id := 1, p_name := 'Create New User');
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_permissions_update(
    p_id                         BIGINT,
    p_name                       CITEXT  DEFAULT NULL,
    p_code                       CITEXT  DEFAULT NULL,
    p_description                TEXT    DEFAULT NULL,
    p_resource                   TEXT    DEFAULT NULL,
    p_action                     TEXT    DEFAULT NULL,
    p_scope                      TEXT    DEFAULT NULL,
    p_display_order              INT     DEFAULT NULL,
    p_is_active                  BOOLEAN DEFAULT NULL,
    p_updated_by                 BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current RECORD;
BEGIN

    -- ── Check existence ──
    SELECT id, code, resource, action, scope
    INTO v_current
    FROM permissions
    WHERE id = p_id AND is_deleted = FALSE;

    IF v_current.id IS NULL THEN
        RAISE EXCEPTION 'Permission with ID % does not exist or is deleted.', p_id;
    END IF;

    -- ── Check code uniqueness if changing ──
    IF p_code IS NOT NULL AND LOWER(TRIM(p_code::TEXT)) <> v_current.code::TEXT THEN
        IF EXISTS (SELECT 1 FROM permissions WHERE code = LOWER(TRIM(p_code)) AND id <> p_id AND is_deleted = FALSE) THEN
            RAISE EXCEPTION 'Permission with code "%" already exists.', p_code;
        END IF;
    END IF;

    -- ── Check resource+action+scope uniqueness if changing any of them ──
    IF p_resource IS NOT NULL OR p_action IS NOT NULL OR p_scope IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM permissions
            WHERE resource = COALESCE(LOWER(TRIM(p_resource)), v_current.resource)
              AND action   = COALESCE(LOWER(TRIM(p_action)),   v_current.action)
              AND scope    = COALESCE(LOWER(TRIM(p_scope)),     v_current.scope)
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'Permission for resource=%, action=%, scope=% already exists.',
                COALESCE(p_resource, v_current.resource),
                COALESCE(p_action,   v_current.action),
                COALESCE(p_scope,    v_current.scope);
        END IF;
    END IF;

    -- ── Update ──
    UPDATE permissions
    SET
        name          = COALESCE(NULLIF(TRIM(p_name::TEXT), '')::CITEXT, name),
        code          = COALESCE(NULLIF(LOWER(TRIM(p_code::TEXT)), '')::CITEXT, code),
        description   = CASE WHEN p_description IS NOT NULL THEN p_description ELSE description END,
        resource      = COALESCE(NULLIF(LOWER(TRIM(p_resource)), ''), resource),
        action        = COALESCE(NULLIF(LOWER(TRIM(p_action)), ''),   action),
        scope         = COALESCE(NULLIF(LOWER(TRIM(p_scope)), ''),    scope),
        display_order = COALESCE(p_display_order, display_order),
        is_active     = COALESCE(p_is_active, is_active),
        updated_by    = p_updated_by,
        updated_at    = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Permission %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating permission: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Update permission name
-- SELECT udf_permissions_update(p_id := 1, p_name := 'Create New User');

-- Test 2: Update permission scope
-- SELECT udf_permissions_update(p_id := 5, p_scope := 'assigned');

-- ══════════════════════════════════════════════════════════════════════════════
