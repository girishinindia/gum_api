-- ============================================================
-- Function: udf_get_learning_goals
-- Purpose: Fetch learning goals with single, all, search,
--          filter, sorting, and pagination support
-- ============================================================
-- Uses: uv_learning_goals view, pg_trgm (ILIKE), pg_trgm
--
-- Modes:
--   1. Single record:  udf_get_learning_goals(p_id := 1)
--   2. All records:    udf_get_learning_goals()
--   3. Filtered:       udf_get_learning_goals(p_filter_is_active := TRUE)
--   4. Search:         udf_get_learning_goals(p_search_term := 'communication')
--   5. Paginated:      udf_get_learning_goals(p_page_index := 2, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_learning_goals(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'display_order',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    -- NB: DEFAULT FALSE (not NULL). The base view `uv_learning_goals`
    -- no longer hard-filters soft-deleted rows, so the list path
    -- must default-exclude them here to keep prior behavior.
    -- p_id lookups skip this branch entirely and return soft-
    -- deleted rows, which is the intended behavior.
    p_filter_is_deleted         BOOLEAN DEFAULT FALSE,

    -- Search
    p_search_term               TEXT    DEFAULT NULL,

    -- Pagination
    p_page_index                INT     DEFAULT 1,
    p_page_size                 INT     DEFAULT NULL
)
RETURNS TABLE (
    learning_goal_id            BIGINT,
    learning_goal_name          TEXT,
    learning_goal_description   TEXT,
    learning_goal_icon_url      TEXT,
    learning_goal_display_order INT,
    learning_goal_created_by    BIGINT,
    learning_goal_updated_by    BIGINT,
    learning_goal_is_active     BOOLEAN,
    learning_goal_is_deleted    BOOLEAN,
    learning_goal_created_at    TIMESTAMPTZ,
    learning_goal_updated_at    TIMESTAMPTZ,
    learning_goal_deleted_at    TIMESTAMPTZ,
    total_count                 BIGINT
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

    -- ── Base query on view ──
    v_sql := '
        SELECT
            v.learning_goal_id,
            v.learning_goal_name::TEXT,
            v.learning_goal_description,
            v.learning_goal_icon_url,
            v.learning_goal_display_order,
            v.learning_goal_created_by,
            v.learning_goal_updated_by,
            v.learning_goal_is_active,
            v.learning_goal_is_deleted,
            v.learning_goal_created_at,
            v.learning_goal_updated_at,
            v.learning_goal_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_learning_goals v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.learning_goal_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.learning_goal_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.learning_goal_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.learning_goal_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.learning_goal_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on name) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.learning_goal_name::TEXT ILIKE %1$L
                    OR v.learning_goal_description ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'               THEN 'v.learning_goal_id'
                WHEN 'name'             THEN 'v.learning_goal_name'
                WHEN 'display_order'    THEN 'v.learning_goal_display_order'
                WHEN 'is_active'        THEN 'v.learning_goal_is_active'
                WHEN 'is_deleted'       THEN 'v.learning_goal_is_deleted'
                WHEN 'created_at'       THEN 'v.learning_goal_created_at'
                WHEN 'updated_at'       THEN 'v.learning_goal_updated_at'
                ELSE 'v.learning_goal_display_order'
            END
            || ' ' ||
            CASE WHEN upper(p_sort_direction) = 'DESC' THEN 'DESC' ELSE 'ASC' END;

        -- ── Pagination ──
        IF p_page_size IS NOT NULL THEN
            v_offset := (GREATEST(p_page_index, 1) - 1) * p_page_size;
            v_limit  := format(' LIMIT %s OFFSET %s', p_page_size, v_offset);
        END IF;

    END IF;

    -- ── Build final SQL ──
    v_sql := v_sql || v_where || v_order || v_limit;

    -- ── Debug (uncomment to see generated SQL) ──
    -- RAISE NOTICE 'SQL: %', v_sql;

    -- ── Execute and return ──
    RETURN QUERY EXECUTE v_sql;

END;
$$;


-- ══════════════════════════════════════════════
-- Testing
-- ══════════════════════════════════════════════

-- 1. Single record by ID
-- SELECT * FROM udf_get_learning_goals(p_id := 1);

-- 2. All active learning goals sorted by display order (default)
-- SELECT * FROM udf_get_learning_goals(p_filter_is_active := TRUE);

-- 3. Search by term (searches name and description)
-- SELECT * FROM udf_get_learning_goals(p_search_term := 'communication');

-- 4. All learning goals sorted by name
-- SELECT * FROM udf_get_learning_goals(p_sort_column := 'name', p_sort_direction := 'ASC');

-- 5. All learning goals sorted by creation date (most recent first)
-- SELECT * FROM udf_get_learning_goals(p_sort_column := 'created_at', p_sort_direction := 'DESC');

-- 6. Paginated: page 1, 10 per page, sorted by display order (default)
-- SELECT * FROM udf_get_learning_goals(p_page_index := 1, p_page_size := 10);

-- 7. Paginated: page 2, 5 per page, sorted by name
-- SELECT * FROM udf_get_learning_goals(p_sort_column := 'name', p_page_index := 2, p_page_size := 5);

-- 8. Combined: active only + search + sorted by display order
-- SELECT * FROM udf_get_learning_goals(p_filter_is_active := TRUE, p_search_term := 'goal', p_sort_column := 'display_order');

-- 9. Combined: active + paginated (5 per page)
-- SELECT * FROM udf_get_learning_goals(p_filter_is_active := TRUE, p_page_index := 1, p_page_size := 5);

-- 10. Soft-deleted records only
-- SELECT * FROM udf_get_learning_goals(p_filter_is_deleted := TRUE);

-- 11. All records, no filter, no pagination (all learning goals)
-- SELECT * FROM udf_get_learning_goals();

-- 12. Inactive learning goals
-- SELECT * FROM udf_get_learning_goals(p_filter_is_active := FALSE);

-- 13. For UI dropdown (active only, sorted by display order, limited to 10)
-- SELECT learning_goal_id, learning_goal_name FROM udf_get_learning_goals(p_filter_is_active := TRUE, p_page_size := 10);

-- 14. Count total active learning goals
-- SELECT COUNT(1) FROM udf_get_learning_goals(p_filter_is_active := TRUE);

-- 15. Search + active filter (common use case)
-- SELECT * FROM udf_get_learning_goals(p_filter_is_active := TRUE, p_search_term := 'technical');


-- ── Comments ──
