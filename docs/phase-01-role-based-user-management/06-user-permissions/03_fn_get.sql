-- ══════════════════════════════════════════════════════════════════════════════
-- Function: udf_get_user_permissions
-- Purpose: Fetch user-permission overrides with filters, sorting, pagination
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_get_user_permissions(
    -- Single record
    p_id                            BIGINT  DEFAULT NULL,

    -- Filters
    p_filter_user_id                BIGINT  DEFAULT NULL,
    p_filter_permission_id          BIGINT  DEFAULT NULL,
    p_filter_grant_type             TEXT    DEFAULT NULL,
    p_filter_perm_resource          TEXT    DEFAULT NULL,
    p_filter_perm_action            TEXT    DEFAULT NULL,
    p_filter_perm_scope             TEXT    DEFAULT NULL,
    p_filter_is_active              BOOLEAN DEFAULT NULL,
    p_filter_is_deleted             BOOLEAN DEFAULT NULL,

    -- Search
    p_search_term                   TEXT    DEFAULT NULL,

    -- Sorting
    p_sort_column                   TEXT    DEFAULT 'id',
    p_sort_direction                TEXT    DEFAULT 'ASC',

    -- Pagination (1-based; clamped to [1, 100] at runtime)
    p_page_index                    INT     DEFAULT 1,
    p_page_size                     INT     DEFAULT 20
)
RETURNS TABLE (
    up_id                           BIGINT,
    up_user_id                      BIGINT,
    up_user_first_name              TEXT,
    up_user_last_name               TEXT,
    up_user_email                   CITEXT,
    up_permission_id                BIGINT,
    up_perm_name                    CITEXT,
    up_perm_code                    CITEXT,
    up_perm_resource                TEXT,
    up_perm_action                  TEXT,
    up_perm_scope                   TEXT,
    up_grant_type                   TEXT,
    up_is_active                    BOOLEAN,
    up_is_deleted                   BOOLEAN,
    up_created_at                   TIMESTAMPTZ,
    up_updated_at                   TIMESTAMPTZ,
    up_deleted_at                   TIMESTAMPTZ,
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
            v.up_id,
            v.up_user_id,
            v.up_user_first_name,
            v.up_user_last_name,
            v.up_user_email,
            v.up_permission_id,
            v.up_perm_name,
            v.up_perm_code,
            v.up_perm_resource,
            v.up_perm_action,
            v.up_perm_scope,
            v.up_grant_type,
            v.up_is_active,
            v.up_is_deleted,
            v.up_created_at,
            v.up_updated_at,
            v.up_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_user_permissions v
        WHERE 1=1';

    -- ── Single record ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.up_id = %L', p_id);
    ELSE

        -- ── Filters ──
        IF p_filter_user_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.up_user_id = %L', p_filter_user_id);
        END IF;

        IF p_filter_permission_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.up_permission_id = %L', p_filter_permission_id);
        END IF;

        IF p_filter_grant_type IS NOT NULL THEN
            v_where := v_where || format(' AND v.up_grant_type = %L', p_filter_grant_type);
        END IF;

        IF p_filter_perm_resource IS NOT NULL THEN
            v_where := v_where || format(' AND v.up_perm_resource = %L', p_filter_perm_resource);
        END IF;

        IF p_filter_perm_action IS NOT NULL THEN
            v_where := v_where || format(' AND v.up_perm_action = %L', p_filter_perm_action);
        END IF;

        IF p_filter_perm_scope IS NOT NULL THEN
            v_where := v_where || format(' AND v.up_perm_scope = %L', p_filter_perm_scope);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.up_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.up_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search ──
        IF p_search_term IS NOT NULL AND BTRIM(p_search_term) <> '' THEN
            v_search_param := '%' || BTRIM(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.up_user_first_name ILIKE %1$L
                    OR v.up_user_last_name ILIKE %1$L
                    OR v.up_user_email::TEXT ILIKE %1$L
                    OR v.up_perm_name::TEXT ILIKE %1$L
                    OR v.up_perm_code::TEXT ILIKE %1$L
                    OR v.up_perm_resource ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'           THEN 'v.up_id'
                WHEN 'user_id'      THEN 'v.up_user_id'
                WHEN 'user_name'    THEN 'v.up_user_first_name'
                WHEN 'perm_name'    THEN 'v.up_perm_name'
                WHEN 'perm_code'    THEN 'v.up_perm_code'
                WHEN 'resource'     THEN 'v.up_perm_resource'
                WHEN 'grant_type'   THEN 'v.up_grant_type'
                WHEN 'created_at'   THEN 'v.up_created_at'
                ELSE 'v.up_id'
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

-- Test 1: All overrides for a user
-- SELECT * FROM udf_get_user_permissions(p_filter_user_id := 5);

-- Test 2: All denied permissions
-- SELECT * FROM udf_get_user_permissions(p_filter_grant_type := 'deny');

-- Test 3: Search by user name or permission
-- SELECT * FROM udf_get_user_permissions(p_search_term := 'course');

-- ══════════════════════════════════════════════════════════════════════════════
