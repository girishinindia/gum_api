-- ============================================================
-- Function: udf_get_countries
-- Purpose: Fetch countries with single, all, search, filter,
--          sorting, and pagination support
-- ============================================================
-- Uses: uv_countries view, pg_trgm (ILIKE), GIN (JSONB @>)
--
-- Modes:
--   1. Single record:  udf_get_countries(p_id := 1)
--   2. All records:    udf_get_countries()
--   3. Filtered:       udf_get_countries(p_filter_currency := 'EUR')
--   4. Search:         udf_get_countries(p_search_term := 'India')
--   5. Paginated:      udf_get_countries(p_page_index := 2, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_countries(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'id',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters
    p_filter_iso2               TEXT    DEFAULT NULL,
    p_filter_iso3               TEXT    DEFAULT NULL,
    p_filter_phone_code         TEXT    DEFAULT NULL,
    p_filter_currency           TEXT    DEFAULT NULL,
    p_filter_nationality        TEXT    DEFAULT NULL,
    p_filter_national_language  TEXT    DEFAULT NULL,
    p_filter_languages          TEXT    DEFAULT NULL,
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    p_filter_is_deleted         BOOLEAN DEFAULT NULL,

    -- Search
    p_search_term               TEXT    DEFAULT NULL,

    -- Pagination (1-based; clamped to [1, 100] at runtime)
    p_page_index                INT     DEFAULT 1,
    p_page_size                 INT     DEFAULT 20
)
RETURNS TABLE (
    country_id                  BIGINT,
    country_name                TEXT,
    country_iso2                TEXT,
    country_iso3                TEXT,
    country_phone_code          TEXT,
    country_nationality         TEXT,
    country_national_language   TEXT,
    country_languages           JSONB,
    country_tld                 TEXT,
    country_currency            TEXT,
    country_currency_name       TEXT,
    country_currency_symbol     TEXT,
    country_flag_image          TEXT,
    country_is_active           BOOLEAN,
    country_is_deleted          BOOLEAN,
    country_created_at          TIMESTAMPTZ,
    country_updated_at          TIMESTAMPTZ,
    country_deleted_at          TIMESTAMPTZ,
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

    -- ── Pagination safety clamp ─────────────────────────────
    -- Negative / zero / NULL values are clamped to safe defaults.
    -- Hard cap of 100 per page to prevent runaway queries.
    p_page_index := GREATEST(COALESCE(p_page_index, 1), 1);
    p_page_size  := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);

    -- ── Base query on view ──
    v_sql := '
        SELECT
            v.country_id,
            v.country_name,
            v.country_iso2,
            v.country_iso3,
            v.country_phone_code,
            v.country_nationality,
            v.country_national_language,
            v.country_languages,
            v.country_tld,
            v.country_currency,
            v.country_currency_name,
            v.country_currency_symbol,
            v.country_flag_image,
            v.country_is_active,
            v.country_is_deleted,
            v.country_created_at,
            v.country_updated_at,
            v.country_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_countries v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.country_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_iso2 IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_iso2 = %L', p_filter_iso2);
        END IF;

        IF p_filter_iso3 IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_iso3 = %L', p_filter_iso3);
        END IF;

        IF p_filter_phone_code IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_phone_code = %L', p_filter_phone_code);
        END IF;

        IF p_filter_currency IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_currency = %L', p_filter_currency);
        END IF;

        IF p_filter_nationality IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_nationality = %L', p_filter_nationality);
        END IF;

        IF p_filter_national_language IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_national_language = %L', p_filter_national_language);
        END IF;

        -- ── JSONB containment filter (uses GIN index) ──
        IF p_filter_languages IS NOT NULL THEN
            v_where := v_where || format(
                ' AND v.country_languages @> %L::jsonb',
                format('["%s"]', p_filter_languages)
            );
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on name) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.country_name ILIKE %1$L
                    OR v.country_iso3::TEXT ILIKE %1$L
                    OR v.country_phone_code ILIKE %1$L
                    OR v.country_currency ILIKE %1$L
                    OR v.country_currency_name ILIKE %1$L
                    OR v.country_nationality ILIKE %1$L
                    OR v.country_national_language ILIKE %1$L
                    OR v.country_languages::TEXT ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'                 THEN 'v.country_id'
                WHEN 'name'               THEN 'v.country_name'
                WHEN 'iso2'               THEN 'v.country_iso2'
                WHEN 'iso3'               THEN 'v.country_iso3'
                WHEN 'phone_code'         THEN 'v.country_phone_code'
                WHEN 'currency'           THEN 'v.country_currency'
                WHEN 'nationality'        THEN 'v.country_nationality'
                WHEN 'national_language'  THEN 'v.country_national_language'
                WHEN 'is_active'          THEN 'v.country_is_active'
                WHEN 'is_deleted'         THEN 'v.country_is_deleted'
                WHEN 'created_at'         THEN 'v.country_created_at'
                WHEN 'updated_at'         THEN 'v.country_updated_at'
                ELSE 'v.country_id'
            END
            || ' ' ||
            CASE WHEN upper(p_sort_direction) = 'DESC' THEN 'DESC' ELSE 'ASC' END;

        -- ── Pagination (clamped values set at top of function) ──
        v_offset := (p_page_index - 1) * p_page_size;
        v_limit  := format(' LIMIT %s OFFSET %s', p_page_size, v_offset);

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
-- SELECT * FROM udf_get_countries(p_id := 1);

-- 2. All active countries sorted by name
-- SELECT * FROM udf_get_countries(p_filter_is_active := TRUE, p_sort_column := 'name');

-- 3. Filter by ISO3
-- SELECT * FROM udf_get_countries(p_filter_iso3 := 'IND');

-- 4. Filter by currency (EUR)
-- SELECT * FROM udf_get_countries(p_filter_currency := 'EUR', p_sort_column := 'name');

-- 5. Filter inactive, non-deleted countries
-- SELECT * FROM udf_get_countries(p_filter_is_active := FALSE, p_filter_is_deleted := FALSE);

-- 6. Search by term (searches name, iso3, phone_code, currency, nationality, languages)
-- SELECT * FROM udf_get_countries(p_search_term := 'India');

-- 7. Filter by language (JSONB containment)
-- SELECT * FROM udf_get_countries(p_filter_languages := 'French', p_sort_column := 'name');

-- 8. Filter by nationality
-- SELECT * FROM udf_get_countries(p_filter_nationality := 'Indian');

-- 9. Paginated: page 2, 5 per page, sorted by name
-- SELECT * FROM udf_get_countries(p_sort_column := 'name', p_page_index := 2, p_page_size := 5);

-- 10. Combined: active + phone_code + search
-- SELECT * FROM udf_get_countries(p_search_term := 'Canada', p_filter_phone_code := '+1', p_filter_is_active := TRUE);

-- 11. Soft-deleted records only
-- SELECT * FROM udf_get_countries(p_filter_is_deleted := TRUE);

-- 12. Search currency name (Krona)
-- SELECT * FROM udf_get_countries(p_search_term := 'Krona', p_sort_column := 'name');

-- 13. All records, no filter, no pagination
-- SELECT * FROM udf_get_countries();


-- ── Comments ──
