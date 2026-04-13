-- ============================================================
-- Function: udf_get_education_levels
-- Purpose: Fetch education levels with single, all, search,
--          filter, sorting, and pagination support
-- ============================================================
-- Uses: uv_education_levels view, pg_trgm (ILIKE), pg_trgm
--
-- Modes:
--   1. Single record:  udf_get_education_levels(p_id := 19)
--   2. All records:    udf_get_education_levels()
--   3. Filtered:       udf_get_education_levels(p_filter_category := 'undergraduate')
--   4. Search:         udf_get_education_levels(p_search_term := 'Bachelor')
--   5. Paginated:      udf_get_education_levels(p_page_index := 2, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_education_levels(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'level_order',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters
    p_filter_category           TEXT    DEFAULT NULL,
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    p_filter_is_deleted         BOOLEAN DEFAULT NULL,

    -- Search
    p_search_term               TEXT    DEFAULT NULL,

    -- Pagination
    p_page_index                INT     DEFAULT 1,
    p_page_size                 INT     DEFAULT NULL
)
RETURNS TABLE (
    education_level_id                  BIGINT,
    education_level_name                TEXT,
    education_level_abbreviation        TEXT,
    education_level_order               INT,
    education_level_category            TEXT,
    education_level_description         TEXT,
    education_level_typical_duration    TEXT,
    education_level_typical_age_range   TEXT,
    education_level_created_by          BIGINT,
    education_level_updated_by          BIGINT,
    education_level_is_active           BOOLEAN,
    education_level_is_deleted          BOOLEAN,
    education_level_created_at          TIMESTAMPTZ,
    education_level_updated_at          TIMESTAMPTZ,
    education_level_deleted_at          TIMESTAMPTZ,
    total_count                         BIGINT
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
            v.education_level_id,
            v.education_level_name::TEXT,
            v.education_level_abbreviation,
            v.education_level_order,
            v.education_level_category,
            v.education_level_description,
            v.education_level_typical_duration,
            v.education_level_typical_age_range,
            v.education_level_created_by,
            v.education_level_updated_by,
            v.education_level_is_active,
            v.education_level_is_deleted,
            v.education_level_created_at,
            v.education_level_updated_at,
            v.education_level_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_education_levels v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.education_level_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.education_level_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.education_level_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_category IS NOT NULL THEN
            v_where := v_where || format(' AND v.education_level_category = %L', p_filter_category);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.education_level_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.education_level_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on name) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.education_level_name::TEXT ILIKE %1$L
                    OR v.education_level_abbreviation ILIKE %1$L
                    OR v.education_level_category ILIKE %1$L
                    OR v.education_level_description ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'               THEN 'v.education_level_id'
                WHEN 'name'             THEN 'v.education_level_name'
                WHEN 'abbreviation'     THEN 'v.education_level_abbreviation'
                WHEN 'level_order'      THEN 'v.education_level_order'
                WHEN 'category'         THEN 'v.education_level_category'
                WHEN 'is_active'        THEN 'v.education_level_is_active'
                WHEN 'is_deleted'       THEN 'v.education_level_is_deleted'
                WHEN 'created_at'       THEN 'v.education_level_created_at'
                WHEN 'updated_at'       THEN 'v.education_level_updated_at'
                ELSE 'v.education_level_order'
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

-- 1. Single record by ID (B.Tech.)
-- SELECT * FROM udf_get_education_levels(p_id := 19);

-- 2. All active education levels sorted by order (for dropdowns)
-- SELECT * FROM udf_get_education_levels(p_filter_is_active := TRUE, p_sort_column := 'level_order');

-- 3. Filter by category (undergraduate)
-- SELECT * FROM udf_get_education_levels(p_filter_category := 'undergraduate', p_sort_column := 'level_order');

-- 4. Filter by category (postgraduate)
-- SELECT * FROM udf_get_education_levels(p_filter_category := 'postgraduate', p_sort_column := 'level_order');

-- 5. Filter by category (doctoral)
-- SELECT * FROM udf_get_education_levels(p_filter_category := 'doctoral', p_sort_column := 'level_order');

-- 6. Filter by category (professional — CA, CS, CMA, CFA)
-- SELECT * FROM udf_get_education_levels(p_filter_category := 'professional', p_sort_column := 'level_order');

-- 7. Filter by category (school)
-- SELECT * FROM udf_get_education_levels(p_filter_category := 'school', p_sort_column := 'level_order');

-- 8. Filter by category (diploma)
-- SELECT * FROM udf_get_education_levels(p_filter_category := 'diploma', p_sort_column := 'level_order');

-- 9. Filter by category (informal — bootcamp, self-taught, MOOC)
-- SELECT * FROM udf_get_education_levels(p_filter_category := 'informal', p_sort_column := 'level_order');

-- 10. Search by term (searches name, abbreviation, category, description)
-- SELECT * FROM udf_get_education_levels(p_search_term := 'Bachelor');

-- 11. Search by abbreviation
-- SELECT * FROM udf_get_education_levels(p_search_term := 'MBA');

-- 12. Search for engineering degrees
-- SELECT * FROM udf_get_education_levels(p_search_term := 'engineering');

-- 13. Paginated: page 1, 10 per page, sorted by order
-- SELECT * FROM udf_get_education_levels(p_sort_column := 'level_order', p_page_index := 1, p_page_size := 10);

-- 14. Paginated: page 2, 10 per page
-- SELECT * FROM udf_get_education_levels(p_sort_column := 'level_order', p_page_index := 2, p_page_size := 10);

-- 15. Combined: active + undergraduate + search
-- SELECT * FROM udf_get_education_levels(p_filter_category := 'undergraduate', p_search_term := 'Tech', p_filter_is_active := TRUE);

-- 16. Soft-deleted records only
-- SELECT * FROM udf_get_education_levels(p_filter_is_deleted := TRUE);

-- 17. All records, no filter, no pagination (sorted by level_order)
-- SELECT * FROM udf_get_education_levels();

-- 18. Sort by name alphabetically
-- SELECT * FROM udf_get_education_levels(p_sort_column := 'name', p_sort_direction := 'ASC');


-- ── Comments ──
