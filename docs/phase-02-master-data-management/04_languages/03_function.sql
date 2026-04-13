-- ============================================================
-- Function: udf_get_languages
-- Purpose: Fetch languages with single, all, search, filter,
--          sorting, and pagination support
-- ============================================================
-- Uses: uv_languages view, pg_trgm (ILIKE), pg_trgm
--
-- Modes:
--   1. Single record:  udf_get_languages(p_id := 1)
--   2. All records:    udf_get_languages()
--   3. Filtered:       udf_get_languages(p_filter_script := 'Devanagari')
--   4. Search:         udf_get_languages(p_search_term := 'Hindi')
--   5. Paginated:      udf_get_languages(p_page_index := 2, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_languages(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'id',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters
    p_filter_script             TEXT    DEFAULT NULL,
    p_filter_iso_code           TEXT    DEFAULT NULL,
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    p_filter_is_deleted         BOOLEAN DEFAULT NULL,

    -- Search
    p_search_term               TEXT    DEFAULT NULL,

    -- Pagination
    p_page_index                INT     DEFAULT 1,
    p_page_size                 INT     DEFAULT NULL
)
RETURNS TABLE (
    language_id                 BIGINT,
    language_name               TEXT,
    language_native_name        TEXT,
    language_iso_code           TEXT,
    language_script             TEXT,
    language_created_by         BIGINT,
    language_updated_by         BIGINT,
    language_is_active          BOOLEAN,
    language_is_deleted         BOOLEAN,
    language_created_at         TIMESTAMPTZ,
    language_updated_at         TIMESTAMPTZ,
    language_deleted_at         TIMESTAMPTZ,
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
            v.language_id,
            v.language_name::TEXT,
            v.language_native_name,
            v.language_iso_code,
            v.language_script,
            v.language_created_by,
            v.language_updated_by,
            v.language_is_active,
            v.language_is_deleted,
            v.language_created_at,
            v.language_updated_at,
            v.language_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_languages v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.language_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.language_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.language_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_script IS NOT NULL THEN
            v_where := v_where || format(' AND v.language_script = %L', p_filter_script);
        END IF;

        IF p_filter_iso_code IS NOT NULL THEN
            v_where := v_where || format(' AND v.language_iso_code = %L', p_filter_iso_code);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.language_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.language_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on name) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.language_name::TEXT ILIKE %1$L
                    OR v.language_native_name ILIKE %1$L
                    OR v.language_iso_code ILIKE %1$L
                    OR v.language_script ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'           THEN 'v.language_id'
                WHEN 'name'         THEN 'v.language_name'
                WHEN 'native_name'  THEN 'v.language_native_name'
                WHEN 'iso_code'     THEN 'v.language_iso_code'
                WHEN 'script'       THEN 'v.language_script'
                WHEN 'is_active'    THEN 'v.language_is_active'
                WHEN 'is_deleted'   THEN 'v.language_is_deleted'
                WHEN 'created_at'   THEN 'v.language_created_at'
                WHEN 'updated_at'   THEN 'v.language_updated_at'
                ELSE 'v.language_id'
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
-- SELECT * FROM udf_get_languages(p_id := 1);

-- 2. All active languages sorted by name
-- SELECT * FROM udf_get_languages(p_filter_is_active := TRUE, p_sort_column := 'name');

-- 3. Filter by script (Devanagari — Hindi, Marathi, Sanskrit, etc.)
-- SELECT * FROM udf_get_languages(p_filter_script := 'Devanagari', p_sort_column := 'name');

-- 4. Filter by script (Latin)
-- SELECT * FROM udf_get_languages(p_filter_script := 'Latin', p_sort_column := 'name');

-- 5. Filter by ISO code
-- SELECT * FROM udf_get_languages(p_filter_iso_code := 'hi');

-- 6. Search by term (searches name, native_name, iso_code, script)
-- SELECT * FROM udf_get_languages(p_search_term := 'Hindi');

-- 7. Search by native name
-- SELECT * FROM udf_get_languages(p_search_term := 'हिन्दी');

-- 8. Paginated: page 1, 10 per page, sorted by name
-- SELECT * FROM udf_get_languages(p_sort_column := 'name', p_page_index := 1, p_page_size := 10);

-- 9. Paginated: page 2, 10 per page
-- SELECT * FROM udf_get_languages(p_sort_column := 'name', p_page_index := 2, p_page_size := 10);

-- 10. Combined: active + Devanagari script
-- SELECT * FROM udf_get_languages(p_filter_script := 'Devanagari', p_filter_is_active := TRUE);

-- 11. Soft-deleted records only
-- SELECT * FROM udf_get_languages(p_filter_is_deleted := TRUE);

-- 12. All records, no filter, no pagination
-- SELECT * FROM udf_get_languages();

-- 13. Inactive languages
-- SELECT * FROM udf_get_languages(p_filter_is_active := FALSE);

-- 14. Search sign languages
-- SELECT * FROM udf_get_languages(p_search_term := 'Sign');

-- 15. Sort by script descending
-- SELECT * FROM udf_get_languages(p_sort_column := 'script', p_sort_direction := 'DESC');


-- ── Comments ──
