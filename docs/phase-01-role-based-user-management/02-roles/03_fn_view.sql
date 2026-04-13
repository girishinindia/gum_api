-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_get_roles
-- Purpose: Fetch roles with search, filter, sorting, and pagination
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_get_roles(
    -- Single record
    p_id                            BIGINT  DEFAULT NULL,
    p_code                          TEXT    DEFAULT NULL,
    p_is_active                     BOOLEAN DEFAULT NULL,

    -- Filters
    p_filter_level                  SMALLINT DEFAULT NULL,
    p_filter_parent_role_id         BIGINT  DEFAULT NULL,
    p_filter_is_system_role         BOOLEAN DEFAULT NULL,

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
    role_id                         BIGINT,
    role_name                       CITEXT,
    role_code                       CITEXT,
    role_slug                       CITEXT,
    role_description                TEXT,
    role_parent_role_id             BIGINT,
    role_parent_name                CITEXT,
    role_parent_code                CITEXT,
    role_level                      SMALLINT,
    role_is_system_role             BOOLEAN,
    role_display_order              INT,
    role_icon                       TEXT,
    role_color                      TEXT,
    role_created_by                 BIGINT,
    role_updated_by                 BIGINT,
    role_is_active                  BOOLEAN,
    role_is_deleted                 BOOLEAN,
    role_created_at                 TIMESTAMPTZ,
    role_updated_at                 TIMESTAMPTZ,
    role_deleted_at                 TIMESTAMPTZ,
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

    -- ── Base query ──
    v_sql := '
        SELECT
            r.id,
            r.name,
            r.code,
            r.slug,
            r.description,
            r.parent_role_id,
            pr.name,
            pr.code,
            r.level,
            r.is_system_role,
            r.display_order,
            r.icon,
            r.color,
            r.created_by,
            r.updated_by,
            r.is_active,
            r.is_deleted,
            r.created_at,
            r.updated_at,
            r.deleted_at,
            COUNT(*) OVER() AS total_count
        FROM roles r
        LEFT JOIN roles pr ON r.parent_role_id = pr.id AND pr.is_deleted = FALSE
        WHERE r.is_deleted = FALSE
    ';

    -- ── Filters ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND r.id = %L', p_id);
    END IF;

    IF p_code IS NOT NULL THEN
        v_where := v_where || format(' AND r.code = %L', p_code);
    END IF;

    IF p_is_active IS NOT NULL THEN
        v_where := v_where || format(' AND r.is_active = %L', p_is_active);
    END IF;

    IF p_filter_level IS NOT NULL THEN
        v_where := v_where || format(' AND r.level = %L', p_filter_level);
    END IF;

    IF p_filter_parent_role_id IS NOT NULL THEN
        v_where := v_where || format(' AND r.parent_role_id = %L', p_filter_parent_role_id);
    END IF;

    IF p_filter_is_system_role IS NOT NULL THEN
        v_where := v_where || format(' AND r.is_system_role = %L', p_filter_is_system_role);
    END IF;

    -- ── Search ──
    IF p_search_term IS NOT NULL AND TRIM(p_search_term) <> '' THEN
        v_search_param := '%' || TRIM(p_search_term) || '%';
        v_where := v_where || format(
            ' AND (r.name::TEXT ILIKE %L OR r.code::TEXT ILIKE %L OR r.description ILIKE %L)',
            v_search_param, v_search_param, v_search_param
        );
    END IF;

    -- ── Sorting (whitelisted) ──
    CASE
        WHEN p_sort_column IN ('display_order', 'name', 'code', 'level', 'created_at') THEN
            v_order := ' ORDER BY r.' || p_sort_column || ' ' || COALESCE(UPPER(p_sort_direction), 'ASC');
        ELSE
            v_order := ' ORDER BY r.display_order ASC';
    END CASE;

    -- ── Pagination (clamped values set at top of function) ──
    v_offset := (p_page_index - 1) * p_page_size;
    v_limit  := format(' LIMIT %s OFFSET %s', p_page_size, v_offset);

    -- ── Execute ──
    RETURN QUERY EXECUTE v_sql || v_where || v_order || v_limit;

END; $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Get all roles
-- SELECT * FROM udf_get_roles();

-- Test 2: Get by code
-- SELECT * FROM udf_get_roles(p_code := 'admin');

-- Test 3: Get system roles only
-- SELECT * FROM udf_get_roles(p_filter_is_system_role := TRUE);

-- Test 4: Get by level
-- SELECT * FROM udf_get_roles(p_filter_level := 2);

-- Test 5: Search
-- SELECT * FROM udf_get_roles(p_search_term := 'content');

-- Test 6: Paginated
-- SELECT * FROM udf_get_roles(p_page_index := 1, p_page_size := 5);

-- ══════════════════════════════════════════════════════════════════════════════
