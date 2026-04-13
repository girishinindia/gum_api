-- ============================================================
-- Function: udf_getstates
-- Purpose: Fetch states with single, all, search, filter,
--          sorting, and pagination support
-- ============================================================
-- Uses: uv_states view, pg_trgm (ILIKE), GIN (JSONB @>)
--
-- Modes:
--   1. Single record:  udf_getstates(p_id := 1)
--   2. All records:    udf_getstates()
--   3. Filtered:       udf_getstates(p_filter_country_iso3 := 'IND')
--   4. Search:         udf_getstates(p_search_term := 'Maharashtra')
--   5. Paginated:      udf_getstates(p_page_index := 2, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_getstates(
    p_id                         BIGINT   DEFAULT NULL,
    p_country_is_active          BOOLEAN  DEFAULT NULL,
    p_state_is_active            BOOLEAN  DEFAULT NULL,

    -- Sorting parameters
    p_sort_table                 TEXT     DEFAULT 'state',
    p_sort_column                TEXT     DEFAULT 'id',
    p_sort_direction             TEXT     DEFAULT 'ASC',

    -- Country filters
    p_filter_country_iso3        TEXT     DEFAULT NULL,
    p_filter_country_languages   TEXT     DEFAULT NULL,
    p_filter_country_is_active   BOOLEAN  DEFAULT NULL,
    p_filter_country_is_deleted  BOOLEAN  DEFAULT NULL,

    -- State filters
    p_filter_state_languages     TEXT     DEFAULT NULL,
    p_filter_state_is_active     BOOLEAN  DEFAULT NULL,
    p_filter_state_is_deleted    BOOLEAN  DEFAULT NULL,

    -- Searching parameters
    p_search_term                TEXT     DEFAULT NULL,

    -- Pagination parameters
    p_page_index                 INT      DEFAULT 1,
    p_page_size                  INT      DEFAULT NULL
)
RETURNS TABLE (
    state_id                 BIGINT,
    state_country_id         BIGINT,
    state_name               TEXT,
    state_languages          JSONB,
    state_website            TEXT,
    state_is_active          BOOLEAN,
    state_is_deleted         BOOLEAN,
    state_created_at         TIMESTAMPTZ,
    state_updated_at         TIMESTAMPTZ,
    state_deleted_at         TIMESTAMPTZ,

    country_id               BIGINT,
    country_name             TEXT,
    country_iso2             TEXT,
    country_iso3             TEXT,
    country_phone_code       TEXT,
    country_currency         TEXT,
    country_currency_name    TEXT,
    country_currency_symbol  TEXT,
    country_national_language TEXT,
    country_nationality      TEXT,
    country_languages        JSONB,
    country_tld              TEXT,
    country_flag_image       TEXT,
    country_is_active        BOOLEAN,
    country_is_deleted       BOOLEAN,
    country_created_at       TIMESTAMPTZ,
    country_updated_at       TIMESTAMPTZ,
    country_deleted_at       TIMESTAMPTZ,

    total_count              BIGINT
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
    v_sql := 'SELECT *, COUNT(*) OVER() AS total_count FROM uv_states WHERE 1=1';

    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND state_id = %L', p_id);

        IF p_country_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND country_is_active = %L', p_country_is_active);
        END IF;

        IF p_state_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND state_is_active = %L', p_state_is_active);
        END IF;

    ELSE
        -- ── Top-level active flags ──
        IF p_country_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND country_is_active = %L', p_country_is_active);
        END IF;

        IF p_state_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND state_is_active = %L', p_state_is_active);
        END IF;

        -- ── Country filters ──
        IF p_filter_country_iso3 IS NOT NULL THEN
            v_where := v_where || format(' AND country_iso3 = %L', p_filter_country_iso3);
        END IF;

        IF p_filter_country_languages IS NOT NULL THEN
            v_where := v_where || format(
                ' AND country_languages @> %L::jsonb',
                format('["%s"]', p_filter_country_languages)
            );
        END IF;

        IF p_filter_country_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND country_is_active = %L', p_filter_country_is_active);
        END IF;

        IF p_filter_country_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND country_is_deleted = %L', p_filter_country_is_deleted);
        END IF;

        -- ── State filters ──
        IF p_filter_state_languages IS NOT NULL THEN
            v_where := v_where || format(
                ' AND state_languages @> %L::jsonb',
                format('["%s"]', p_filter_state_languages)
            );
        END IF;

        IF p_filter_state_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND state_is_active = %L', p_filter_state_is_active);
        END IF;

        IF p_filter_state_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND state_is_deleted = %L', p_filter_state_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    country_iso3 ILIKE %1$L
                    OR country_name ILIKE %1$L
                    OR state_name ILIKE %1$L
                    OR state_languages::TEXT ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        IF p_sort_table = 'country' THEN
            v_order := ' ORDER BY ' ||
                CASE p_sort_column
                    WHEN 'name'       THEN 'country_name'
                    WHEN 'iso3'       THEN 'country_iso3'
                    WHEN 'is_active'  THEN 'country_is_active'
                    WHEN 'is_deleted' THEN 'country_is_deleted'
                    ELSE 'country_id'
                END;
        ELSE
            v_order := ' ORDER BY ' ||
                CASE p_sort_column
                    WHEN 'id'         THEN 'state_id'
                    WHEN 'name'       THEN 'state_name'
                    WHEN 'is_active'  THEN 'state_is_active'
                    WHEN 'is_deleted' THEN 'state_is_deleted'
                    ELSE 'state_id'
                END;
        END IF;

        v_order := v_order || ' ' ||
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
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. Single record by ID
-- SELECT * FROM udf_getstates(p_id := 1);

-- 2. All states
-- SELECT * FROM udf_getstates();

-- 3. All active states with active countries
-- SELECT * FROM udf_getstates(p_country_is_active := TRUE, p_state_is_active := TRUE);

-- 4. Filter by country ISO3 (India)
-- SELECT * FROM udf_getstates(p_filter_country_iso3 := 'IND', p_sort_column := 'name');

-- 5. Filter by country ISO3 (USA)
-- SELECT * FROM udf_getstates(p_filter_country_iso3 := 'USA');

-- 6. Filter by state language (Hindi-speaking states)
-- SELECT * FROM udf_getstates(p_filter_state_languages := 'Hindi', p_sort_column := 'name');

-- 7. Filter by country language (English-speaking countries' states)
-- SELECT * FROM udf_getstates(p_filter_country_languages := 'English');

-- 8. Search by term
-- SELECT * FROM udf_getstates(p_search_term := 'Maharashtra');

-- 9. Search across country and state names
-- SELECT * FROM udf_getstates(p_search_term := 'India');

-- 10. Paginated: page 1, 5 per page, sorted by name
-- SELECT * FROM udf_getstates(p_sort_column := 'name', p_page_index := 1, p_page_size := 5);

-- 11. Sort by country name
-- SELECT * FROM udf_getstates(p_sort_table := 'country', p_sort_column := 'name');

-- 12. Soft-deleted states only
-- SELECT * FROM udf_getstates(p_filter_state_is_deleted := TRUE);

-- 13. Inactive states only
-- SELECT * FROM udf_getstates(p_filter_state_is_active := FALSE);

-- 14. Combined: active Indian states, sorted by name, page 1
-- SELECT * FROM udf_getstates(p_filter_country_iso3 := 'IND', p_state_is_active := TRUE, p_sort_column := 'name', p_page_size := 5);


-- ── Comments ──
