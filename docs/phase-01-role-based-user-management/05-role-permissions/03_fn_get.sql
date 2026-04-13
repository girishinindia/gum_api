-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_get_role_permissions
-- Purpose: Fetch role-permission assignments with filters, sorting, pagination
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_get_role_permissions(
    -- Single record
    p_id                            BIGINT  DEFAULT NULL,

    -- Filters
    p_filter_role_id                BIGINT  DEFAULT NULL,
    p_filter_role_code              TEXT    DEFAULT NULL,
    p_filter_permission_id          BIGINT  DEFAULT NULL,
    p_filter_perm_resource          TEXT    DEFAULT NULL,
    p_filter_perm_action            TEXT    DEFAULT NULL,
    p_filter_perm_scope             TEXT    DEFAULT NULL,
    p_filter_is_active              BOOLEAN DEFAULT NULL,
    p_filter_is_deleted             BOOLEAN DEFAULT NULL,

    -- Search
    p_search_term                   TEXT    DEFAULT NULL,

    -- Sorting
    p_sort_column                   TEXT    DEFAULT 'role_level',
    p_sort_direction                TEXT    DEFAULT 'ASC',

    -- Pagination (1-based; clamped to [1, 100] at runtime)
    p_page_index                    INT     DEFAULT 1,
    p_page_size                     INT     DEFAULT 20
)
RETURNS TABLE (
    rp_id                           BIGINT,
    rp_role_id                      BIGINT,
    rp_role_name                    CITEXT,
    rp_role_code                    CITEXT,
    rp_role_level                   SMALLINT,
    rp_permission_id                BIGINT,
    rp_perm_name                    CITEXT,
    rp_perm_code                    CITEXT,
    rp_perm_resource                TEXT,
    rp_perm_action                  TEXT,
    rp_perm_scope                   TEXT,
    rp_is_active                    BOOLEAN,
    rp_is_deleted                   BOOLEAN,
    rp_created_at                   TIMESTAMPTZ,
    rp_updated_at                   TIMESTAMPTZ,
    rp_deleted_at                   TIMESTAMPTZ,
    total_count                     BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_sql           TEXT;
    v_where         TEXT := '';
    v_order         TEXT := '';
    v_limit         TEXT := '';
    v_offset        INT  := 0;
    v_search_param  TEXT;
BEGIN

    -- ── Pagination safety clamp ─────────────────────────────
    p_page_index := GREATEST(COALESCE(p_page_index, 1), 1);
    p_page_size  := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);

    v_sql := '
        SELECT
            v.rp_id,
            v.rp_role_id,
            v.rp_role_name,
            v.rp_role_code,
            v.rp_role_level,
            v.rp_permission_id,
            v.rp_perm_name,
            v.rp_perm_code,
            v.rp_perm_resource,
            v.rp_perm_action,
            v.rp_perm_scope,
            v.rp_is_active,
            v.rp_is_deleted,
            v.rp_created_at,
            v.rp_updated_at,
            v.rp_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_role_permissions v
        WHERE 1=1';

    -- ── Single record ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.rp_id = %L', p_id);
    ELSE

        -- ── Filters ──
        IF p_filter_role_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.rp_role_id = %L', p_filter_role_id);
        END IF;

        IF p_filter_role_code IS NOT NULL THEN
            v_where := v_where || format(' AND v.rp_role_code = %L', p_filter_role_code);
        END IF;

        IF p_filter_permission_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.rp_permission_id = %L', p_filter_permission_id);
        END IF;

        IF p_filter_perm_resource IS NOT NULL THEN
            v_where := v_where || format(' AND v.rp_perm_resource = %L', p_filter_perm_resource);
        END IF;

        IF p_filter_perm_action IS NOT NULL THEN
            v_where := v_where || format(' AND v.rp_perm_action = %L', p_filter_perm_action);
        END IF;

        IF p_filter_perm_scope IS NOT NULL THEN
            v_where := v_where || format(' AND v.rp_perm_scope = %L', p_filter_perm_scope);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.rp_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.rp_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search ──
        IF p_search_term IS NOT NULL AND BTRIM(p_search_term) <> '' THEN
            v_search_param := '%' || BTRIM(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.rp_role_name::TEXT ILIKE %1$L
                    OR v.rp_perm_name::TEXT ILIKE %1$L
                    OR v.rp_perm_code::TEXT ILIKE %1$L
                    OR v.rp_perm_resource ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'           THEN 'v.rp_id'
                WHEN 'role_id'      THEN 'v.rp_role_id'
                WHEN 'role_name'    THEN 'v.rp_role_name'
                WHEN 'role_level'   THEN 'v.rp_role_level'
                WHEN 'perm_name'    THEN 'v.rp_perm_name'
                WHEN 'perm_code'    THEN 'v.rp_perm_code'
                WHEN 'resource'     THEN 'v.rp_perm_resource'
                WHEN 'created_at'   THEN 'v.rp_created_at'
                ELSE 'v.rp_role_level'
            END
            || ' ' ||
            CASE WHEN UPPER(p_sort_direction) = 'DESC' THEN 'DESC' ELSE 'ASC' END;

        -- ── Pagination (clamped values set at top of function) ──
        v_offset := (p_page_index - 1) * p_page_size;
        v_limit  := format(' LIMIT %s OFFSET %s', p_page_size, v_offset);

    END IF;

    v_sql := v_sql || v_where || v_order || v_limit;
    RETURN QUERY EXECUTE v_sql;

END; $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: All active role-permission mappings
-- SELECT * FROM udf_get_role_permissions(p_filter_is_deleted := FALSE);

-- Test 2: Permissions for admin role
-- SELECT * FROM udf_get_role_permissions(p_filter_role_code := 'admin');

-- Test 3: Which roles have 'course.create' permission
-- SELECT * FROM udf_get_role_permissions(p_filter_perm_resource := 'course', p_filter_perm_action := 'create');

-- ══════════════════════════════════════════════════════════════════════════════
