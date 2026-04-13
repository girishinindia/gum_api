-- ============================================================
-- Function: udf_get_social_medias
-- Purpose: Fetch social medias with single, all, search,
--          filter, sorting, and pagination support
-- ============================================================
-- Uses: uv_social_medias view, pg_trgm (ILIKE), pg_trgm
--
-- Modes:
--   1. Single record:  udf_get_social_medias(p_id := 1)
--   2. All records:    udf_get_social_medias()
--   3. Filtered:       udf_get_social_medias(p_filter_platform_type := 'social')
--   4. Search:         udf_get_social_medias(p_search_term := 'LinkedIn')
--   5. Paginated:      udf_get_social_medias(p_page_index := 2, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_social_medias(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'display_order',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters
    p_filter_platform_type      TEXT    DEFAULT NULL,
    p_filter_code               TEXT    DEFAULT NULL,
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    -- NB: DEFAULT FALSE (not NULL). The base view `uv_social_medias`
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
    social_media_id             BIGINT,
    social_media_name           TEXT,
    social_media_code           TEXT,
    social_media_base_url       TEXT,
    social_media_icon_url       TEXT,
    social_media_placeholder    TEXT,
    social_media_platform_type  TEXT,
    social_media_display_order  INT,
    social_media_created_by     BIGINT,
    social_media_updated_by     BIGINT,
    social_media_is_active      BOOLEAN,
    social_media_is_deleted     BOOLEAN,
    social_media_created_at     TIMESTAMPTZ,
    social_media_updated_at     TIMESTAMPTZ,
    social_media_deleted_at     TIMESTAMPTZ,
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
            v.social_media_id,
            v.social_media_name::TEXT,
            v.social_media_code::TEXT,
            v.social_media_base_url,
            v.social_media_icon_url,
            v.social_media_placeholder,
            v.social_media_platform_type,
            v.social_media_display_order,
            v.social_media_created_by,
            v.social_media_updated_by,
            v.social_media_is_active,
            v.social_media_is_deleted,
            v.social_media_created_at,
            v.social_media_updated_at,
            v.social_media_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_social_medias v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.social_media_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.social_media_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.social_media_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_platform_type IS NOT NULL THEN
            v_where := v_where || format(' AND v.social_media_platform_type = %L', p_filter_platform_type);
        END IF;

        IF p_filter_code IS NOT NULL THEN
            v_where := v_where || format(' AND v.social_media_code = %L', p_filter_code);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.social_media_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.social_media_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on name) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.social_media_name::TEXT ILIKE %1$L
                    OR v.social_media_code::TEXT ILIKE %1$L
                    OR v.social_media_platform_type ILIKE %1$L
                    OR v.social_media_base_url ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'               THEN 'v.social_media_id'
                WHEN 'name'             THEN 'v.social_media_name'
                WHEN 'code'             THEN 'v.social_media_code'
                WHEN 'platform_type'    THEN 'v.social_media_platform_type'
                WHEN 'display_order'    THEN 'v.social_media_display_order'
                WHEN 'is_active'        THEN 'v.social_media_is_active'
                WHEN 'is_deleted'       THEN 'v.social_media_is_deleted'
                WHEN 'created_at'       THEN 'v.social_media_created_at'
                WHEN 'updated_at'       THEN 'v.social_media_updated_at'
                ELSE 'v.social_media_display_order'
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
-- SELECT * FROM udf_get_social_medias(p_id := 1);

-- 2. All active social medias sorted by display order (default)
-- SELECT * FROM udf_get_social_medias(p_filter_is_active := TRUE);

-- 3. Filter by platform type (social)
-- SELECT * FROM udf_get_social_medias(p_filter_platform_type := 'social', p_filter_is_active := TRUE);

-- 4. Filter by platform type (professional)
-- SELECT * FROM udf_get_social_medias(p_filter_platform_type := 'professional', p_filter_is_active := TRUE);

-- 5. Filter by code
-- SELECT * FROM udf_get_social_medias(p_filter_code := 'linkedin');

-- 6. Search by term (searches name, code, platform_type, base_url)
-- SELECT * FROM udf_get_social_medias(p_search_term := 'Facebook');

-- 7. Search for code-based platforms
-- SELECT * FROM udf_get_social_medias(p_filter_platform_type := 'code');

-- 8. All social medias sorted by name
-- SELECT * FROM udf_get_social_medias(p_sort_column := 'name', p_sort_direction := 'ASC');

-- 9. All social medias sorted by platform type
-- SELECT * FROM udf_get_social_medias(p_sort_column := 'platform_type');

-- 10. All social medias sorted by creation date (most recent first)
-- SELECT * FROM udf_get_social_medias(p_sort_column := 'created_at', p_sort_direction := 'DESC');

-- 11. Paginated: page 1, 10 per page, sorted by display order (default)
-- SELECT * FROM udf_get_social_medias(p_page_index := 1, p_page_size := 10);

-- 12. Paginated: page 2, 5 per page, sorted by name
-- SELECT * FROM udf_get_social_medias(p_sort_column := 'name', p_page_index := 2, p_page_size := 5);

-- 13. Combined: social platform type + active + sorted by display order
-- SELECT * FROM udf_get_social_medias(p_filter_platform_type := 'social', p_filter_is_active := TRUE, p_sort_column := 'display_order');

-- 14. Combined: search + filter by platform type
-- SELECT * FROM udf_get_social_medias(p_filter_platform_type := 'professional', p_search_term := 'linked');

-- 15. Combined: active + paginated (5 per page)
-- SELECT * FROM udf_get_social_medias(p_filter_is_active := TRUE, p_page_index := 1, p_page_size := 5);

-- 16. Soft-deleted records only
-- SELECT * FROM udf_get_social_medias(p_filter_is_deleted := TRUE);

-- 17. All records, no filter, no pagination
-- SELECT * FROM udf_get_social_medias();

-- 18. Inactive social medias
-- SELECT * FROM udf_get_social_medias(p_filter_is_active := FALSE);

-- 19. For UI dropdown (active social platforms, sorted by display order, limited to 20)
-- SELECT social_media_id, social_media_name, social_media_code FROM udf_get_social_medias(p_filter_is_active := TRUE, p_filter_platform_type := 'social', p_page_size := 20);

-- 20. Count total active social medias by platform type
-- SELECT COUNT(1) FROM udf_get_social_medias(p_filter_is_active := TRUE, p_filter_platform_type := 'social');


-- ── Comments ──
