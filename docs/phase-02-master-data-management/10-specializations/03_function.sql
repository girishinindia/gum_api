-- ============================================================
-- Function: udf_get_specializations
-- Purpose: Fetch specializations with single, all, search,
--          filter, sorting, and pagination support
-- ============================================================
-- Uses: uv_specializations view, pg_trgm (ILIKE), pg_trgm
--
-- Modes:
--   1. Single record:  udf_get_specializations(p_id := 1)
--   2. All records:    udf_get_specializations()
--   3. Filtered:       udf_get_specializations(p_filter_category := 'technology')
--   4. Search:         udf_get_specializations(p_search_term := 'Python')
--   5. Paginated:      udf_get_specializations(p_page_index := 2, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_specializations(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'id',
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
    specialization_id                    BIGINT,
    specialization_name                  TEXT,
    specialization_category              TEXT,
    specialization_description           TEXT,
    specialization_icon_url              TEXT,
    specialization_created_by            BIGINT,
    specialization_updated_by            BIGINT,
    specialization_is_active             BOOLEAN,
    specialization_is_deleted            BOOLEAN,
    specialization_created_at            TIMESTAMPTZ,
    specialization_updated_at            TIMESTAMPTZ,
    specialization_deleted_at            TIMESTAMPTZ,
    total_count                          BIGINT
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
            v.specialization_id,
            v.specialization_name::TEXT,
            v.specialization_category,
            v.specialization_description,
            v.specialization_icon_url,
            v.specialization_created_by,
            v.specialization_updated_by,
            v.specialization_is_active,
            v.specialization_is_deleted,
            v.specialization_created_at,
            v.specialization_updated_at,
            v.specialization_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_specializations v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.specialization_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.specialization_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.specialization_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_category IS NOT NULL THEN
            v_where := v_where || format(' AND v.specialization_category = %L', p_filter_category);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.specialization_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.specialization_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on name) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.specialization_name::TEXT ILIKE %1$L
                    OR v.specialization_category ILIKE %1$L
                    OR v.specialization_description ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'           THEN 'v.specialization_id'
                WHEN 'name'         THEN 'v.specialization_name'
                WHEN 'category'     THEN 'v.specialization_category'
                WHEN 'is_active'    THEN 'v.specialization_is_active'
                WHEN 'is_deleted'   THEN 'v.specialization_is_deleted'
                WHEN 'created_at'   THEN 'v.specialization_created_at'
                WHEN 'updated_at'   THEN 'v.specialization_updated_at'
                ELSE 'v.specialization_id'
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
-- Testing (18+ Queries)
-- ══════════════════════════════════════════════

-- 1. Single record by ID
-- SELECT * FROM udf_get_specializations(p_id := 1);

-- 2. All active specializations sorted by name
-- SELECT * FROM udf_get_specializations(p_filter_is_active := TRUE, p_sort_column := 'name');

-- 3. Filter by category (technology)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'technology', p_sort_column := 'name');

-- 4. Filter by category (data)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'data', p_sort_column := 'name');

-- 5. Filter by category (design)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'design', p_sort_column := 'name');

-- 6. Filter by category (business)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'business', p_sort_column := 'name');

-- 7. Filter by category (language)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'language', p_sort_column := 'name');

-- 8. Filter by category (science)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'science', p_sort_column := 'name');

-- 9. Filter by category (mathematics)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'mathematics', p_sort_column := 'name');

-- 10. Filter by category (arts)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'arts', p_sort_column := 'name');

-- 11. Filter by category (health)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'health', p_sort_column := 'name');

-- 12. Filter by category (exam_prep)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'exam_prep', p_sort_column := 'name');

-- 13. Filter by category (professional)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'professional', p_sort_column := 'name');

-- 14. Filter by category (other)
-- SELECT * FROM udf_get_specializations(p_filter_category := 'other', p_sort_column := 'name');

-- 15. Search by term (searches name, category, description)
-- SELECT * FROM udf_get_specializations(p_search_term := 'Data');

-- 16. Paginated: page 1, 10 per page, sorted by name
-- SELECT * FROM udf_get_specializations(p_sort_column := 'name', p_page_index := 1, p_page_size := 10);

-- 17. Combined: active + technology + search
-- SELECT * FROM udf_get_specializations(p_filter_category := 'technology', p_search_term := 'Python', p_filter_is_active := TRUE);

-- 18. Soft-deleted records only
-- SELECT * FROM udf_get_specializations(p_filter_is_deleted := TRUE);

-- 19. All records, no filter, no pagination
-- SELECT * FROM udf_get_specializations();

-- 20. Inactive specializations
-- SELECT * FROM udf_get_specializations(p_filter_is_active := FALSE);


-- ── Comments ──
