-- ============================================================
-- Function: udf_get_designations
-- Purpose: Fetch designations with single, all, search,
--          filter, sorting, and pagination support
-- ============================================================
-- Uses: uv_designations view, pg_trgm (ILIKE), pg_trgm
--
-- Modes:
--   1. Single record:  udf_get_designations(p_id := 1)
--   2. All records:    udf_get_designations()
--   3. Search:         udf_get_designations(p_search_term := 'Developer')
--   4. Filter by band: udf_get_designations(p_filter_level_band := 'senior')
--   5. Paginated:      udf_get_designations(p_page_index := 1, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_designations(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'level',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters
    p_filter_level_band         TEXT    DEFAULT NULL,
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    p_filter_is_deleted         BOOLEAN DEFAULT NULL,

    -- Search
    p_search_term               TEXT    DEFAULT NULL,

    -- Pagination
    p_page_index                INT     DEFAULT 1,
    p_page_size                 INT     DEFAULT NULL
)
RETURNS TABLE (
    designation_id              BIGINT,
    designation_name            TEXT,
    designation_code            TEXT,
    designation_level           INT,
    designation_level_band      TEXT,
    designation_description     TEXT,
    designation_created_by      BIGINT,
    designation_updated_by      BIGINT,
    designation_is_active       BOOLEAN,
    designation_is_deleted      BOOLEAN,
    designation_created_at      TIMESTAMPTZ,
    designation_updated_at      TIMESTAMPTZ,
    designation_deleted_at      TIMESTAMPTZ,
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
            v.designation_id,
            v.designation_name::TEXT,
            v.designation_code::TEXT,
            v.designation_level,
            v.designation_level_band,
            v.designation_description,
            v.designation_created_by,
            v.designation_updated_by,
            v.designation_is_active,
            v.designation_is_deleted,
            v.designation_created_at,
            v.designation_updated_at,
            v.designation_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_designations v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.designation_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.designation_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.designation_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_level_band IS NOT NULL THEN
            v_where := v_where || format(' AND v.designation_level_band = %L', p_filter_level_band);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.designation_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.designation_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on name/code) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.designation_name::TEXT ILIKE %1$L
                    OR v.designation_code::TEXT ILIKE %1$L
                    OR v.designation_level_band ILIKE %1$L
                    OR v.designation_description ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'           THEN 'v.designation_id'
                WHEN 'name'         THEN 'v.designation_name'
                WHEN 'code'         THEN 'v.designation_code'
                WHEN 'level'        THEN 'v.designation_level'
                WHEN 'level_band'   THEN 'v.designation_level_band'
                WHEN 'is_active'    THEN 'v.designation_is_active'
                WHEN 'is_deleted'   THEN 'v.designation_is_deleted'
                WHEN 'created_at'   THEN 'v.designation_created_at'
                WHEN 'updated_at'   THEN 'v.designation_updated_at'
                ELSE 'v.designation_level'
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
-- SELECT * FROM udf_get_designations(p_id := 1);

-- 2. All active designations sorted by level (default)
-- SELECT * FROM udf_get_designations(p_filter_is_active := TRUE);

-- 3. Filter by level_band: intern
-- SELECT * FROM udf_get_designations(p_filter_level_band := 'intern');

-- 4. Filter by level_band: entry
-- SELECT * FROM udf_get_designations(p_filter_level_band := 'entry');

-- 5. Filter by level_band: mid
-- SELECT * FROM udf_get_designations(p_filter_level_band := 'mid');

-- 6. Filter by level_band: senior
-- SELECT * FROM udf_get_designations(p_filter_level_band := 'senior');

-- 7. Filter by level_band: lead
-- SELECT * FROM udf_get_designations(p_filter_level_band := 'lead');

-- 8. Filter by level_band: manager
-- SELECT * FROM udf_get_designations(p_filter_level_band := 'manager');

-- 9. Filter by level_band: director
-- SELECT * FROM udf_get_designations(p_filter_level_band := 'director');

-- 10. Filter by level_band: executive
-- SELECT * FROM udf_get_designations(p_filter_level_band := 'executive');

-- 11. Search by term (searches name, code, band, description)
-- SELECT * FROM udf_get_designations(p_search_term := 'Developer');

-- 12. Search for manager roles
-- SELECT * FROM udf_get_designations(p_search_term := 'Manager');

-- 13. Search for lead roles
-- SELECT * FROM udf_get_designations(p_search_term := 'Lead');

-- 14. Paginated: page 1, 10 per page, sorted by name
-- SELECT * FROM udf_get_designations(p_sort_column := 'name', p_page_index := 1, p_page_size := 10);

-- 15. Paginated: page 2, 10 per page, sorted by level descending
-- SELECT * FROM udf_get_designations(p_sort_column := 'level', p_sort_direction := 'DESC', p_page_index := 2, p_page_size := 10);

-- 16. Soft-deleted records only
-- SELECT * FROM udf_get_designations(p_filter_is_deleted := TRUE);

-- 17. All records, no filter, no pagination
-- SELECT * FROM udf_get_designations();

-- 18. Inactive designations
-- SELECT * FROM udf_get_designations(p_filter_is_active := FALSE);

-- 19. Sort by name ascending
-- SELECT * FROM udf_get_designations(p_sort_column := 'name', p_sort_direction := 'ASC');

-- 20. Combined: senior band, active only, search for 'developer', sorted by name
-- SELECT * FROM udf_get_designations(p_filter_level_band := 'senior', p_filter_is_active := TRUE, p_search_term := 'Developer', p_sort_column := 'name');


-- ── Comments ──
