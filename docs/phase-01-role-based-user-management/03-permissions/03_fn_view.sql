-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_get_permissions
-- Purpose: Fetch permissions with search, filter, sorting, and pagination
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_get_permissions(
    -- Single record
    p_id                            BIGINT  DEFAULT NULL,
    p_code                          TEXT    DEFAULT NULL,
    p_is_active                     BOOLEAN DEFAULT NULL,

    -- Filters
    p_filter_resource               TEXT    DEFAULT NULL,
    p_filter_action                 TEXT    DEFAULT NULL,
    p_filter_scope                  TEXT    DEFAULT NULL,
    p_filter_is_active              BOOLEAN DEFAULT NULL,
    p_filter_is_deleted             BOOLEAN DEFAULT NULL,

    -- Search
    p_search_term                   TEXT    DEFAULT NULL,

    -- Sorting
    p_sort_column                   TEXT    DEFAULT 'display_order',
    p_sort_direction                TEXT    DEFAULT 'ASC',

    -- Pagination (1-based; clamped to [1, 100] at runtime)
    p_page_index                    INT     DEFAULT 1,
    p_page_size                     INT     DEFAULT 20
)
RETURNS TABLE (
    perm_id                         BIGINT,
    perm_name                       CITEXT,
    perm_code                       CITEXT,
    perm_description                TEXT,
    perm_resource                   TEXT,
    perm_action                     TEXT,
    perm_scope                      TEXT,
    perm_display_order              INT,
    perm_is_active                  BOOLEAN,
    perm_is_deleted                 BOOLEAN,
    perm_created_at                 TIMESTAMPTZ,
    perm_updated_at                 TIMESTAMPTZ,
    perm_deleted_at                 TIMESTAMPTZ,
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

    -- ── Base query on view ──
    v_sql := '
        SELECT
            v.perm_id,
            v.perm_name,
            v.perm_code,
            v.perm_description,
            v.perm_resource,
            v.perm_action,
            v.perm_scope,
            v.perm_display_order,
            v.perm_is_active,
            v.perm_is_deleted,
            v.perm_created_at,
            v.perm_updated_at,
            v.perm_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_permissions v
        WHERE 1=1';

    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.perm_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.perm_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.perm_is_active = %L', p_is_active);
        END IF;

        -- ── Single record by code ──
        IF p_code IS NOT NULL THEN
            v_where := v_where || format(' AND v.perm_code = %L', p_code);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_resource IS NOT NULL THEN
            v_where := v_where || format(' AND v.perm_resource = %L', p_filter_resource);
        END IF;

        IF p_filter_action IS NOT NULL THEN
            v_where := v_where || format(' AND v.perm_action = %L', p_filter_action);
        END IF;

        IF p_filter_scope IS NOT NULL THEN
            v_where := v_where || format(' AND v.perm_scope = %L', p_filter_scope);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.perm_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.perm_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index) ──
        IF p_search_term IS NOT NULL AND BTRIM(p_search_term) <> '' THEN
            v_search_param := '%' || BTRIM(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.perm_name::TEXT ILIKE %1$L
                    OR v.perm_code::TEXT ILIKE %1$L
                    OR v.perm_resource ILIKE %1$L
                    OR v.perm_description ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'            THEN 'v.perm_id'
                WHEN 'display_order' THEN 'v.perm_display_order'
                WHEN 'name'          THEN 'v.perm_name'
                WHEN 'code'          THEN 'v.perm_code'
                WHEN 'resource'      THEN 'v.perm_resource'
                WHEN 'action'        THEN 'v.perm_action'
                WHEN 'scope'         THEN 'v.perm_scope'
                WHEN 'is_active'     THEN 'v.perm_is_active'
                WHEN 'created_at'    THEN 'v.perm_created_at'
                WHEN 'updated_at'    THEN 'v.perm_updated_at'
                ELSE 'v.perm_display_order'
            END
            || ' ' ||
            CASE WHEN UPPER(p_sort_direction) = 'DESC' THEN 'DESC' ELSE 'ASC' END;

        -- ── Pagination (clamped values set at top of function) ──
        v_offset := (p_page_index - 1) * p_page_size;
        v_limit  := format(' LIMIT %s OFFSET %s', p_page_size, v_offset);

    END IF;

    -- ── Build final SQL ──
    v_sql := v_sql || v_where || v_order || v_limit;

    -- ── Execute and return ──
    RETURN QUERY EXECUTE v_sql;

END; $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Get all active permissions
-- SELECT * FROM udf_get_permissions(p_filter_is_deleted := FALSE);

-- Test 2: Get permissions for 'course' resource
-- SELECT * FROM udf_get_permissions(p_filter_resource := 'course');

-- Test 3: Get all 'create' action permissions
-- SELECT * FROM udf_get_permissions(p_filter_action := 'create');

-- Test 4: Get all 'own' scope permissions
-- SELECT * FROM udf_get_permissions(p_filter_scope := 'own');

-- Test 5: Search by term
-- SELECT * FROM udf_get_permissions(p_search_term := 'course');

-- Test 6: Get by code
-- SELECT * FROM udf_get_permissions(p_code := 'user.create');

-- Test 7: Paginated
-- SELECT * FROM udf_get_permissions(p_sort_column := 'display_order', p_page_index := 2, p_page_size := 20);

-- ══════════════════════════════════════════════════════════════════════════════
