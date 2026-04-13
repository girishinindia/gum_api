-- ============================================================
-- Function: udf_get_skills
-- Purpose: Fetch skills with single, all, search, filter,
--          sorting, and pagination support
-- ============================================================
-- Uses: uv_skills view, pg_trgm (ILIKE), pg_trgm
--
-- Modes:
--   1. Single record:  udf_get_skills(p_id := 1)
--   2. All records:    udf_get_skills()
--   3. Filtered:       udf_get_skills(p_filter_category := 'technical')
--   4. Search:         udf_get_skills(p_search_term := 'Python')
--   5. Paginated:      udf_get_skills(p_page_index := 2, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_skills(
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
    skill_id                    BIGINT,
    skill_name                  TEXT,
    skill_category              TEXT,
    skill_description           TEXT,
    skill_icon_url              TEXT,
    skill_created_by            BIGINT,
    skill_updated_by            BIGINT,
    skill_is_active             BOOLEAN,
    skill_is_deleted            BOOLEAN,
    skill_created_at            TIMESTAMPTZ,
    skill_updated_at            TIMESTAMPTZ,
    skill_deleted_at            TIMESTAMPTZ,
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
            v.skill_id,
            v.skill_name::TEXT,
            v.skill_category,
            v.skill_description,
            v.skill_icon_url,
            v.skill_created_by,
            v.skill_updated_by,
            v.skill_is_active,
            v.skill_is_deleted,
            v.skill_created_at,
            v.skill_updated_at,
            v.skill_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_skills v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.skill_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.skill_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.skill_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_category IS NOT NULL THEN
            v_where := v_where || format(' AND v.skill_category = %L', p_filter_category);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.skill_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.skill_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on name) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.skill_name::TEXT ILIKE %1$L
                    OR v.skill_category ILIKE %1$L
                    OR v.skill_description ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'           THEN 'v.skill_id'
                WHEN 'name'         THEN 'v.skill_name'
                WHEN 'category'     THEN 'v.skill_category'
                WHEN 'is_active'    THEN 'v.skill_is_active'
                WHEN 'is_deleted'   THEN 'v.skill_is_deleted'
                WHEN 'created_at'   THEN 'v.skill_created_at'
                WHEN 'updated_at'   THEN 'v.skill_updated_at'
                ELSE 'v.skill_id'
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
-- SELECT * FROM udf_get_skills(p_id := 1);

-- 2. All active skills sorted by name
-- SELECT * FROM udf_get_skills(p_filter_is_active := TRUE, p_sort_column := 'name');

-- 3. Filter by category (technical)
-- SELECT * FROM udf_get_skills(p_filter_category := 'technical', p_sort_column := 'name');

-- 4. Filter by category (framework)
-- SELECT * FROM udf_get_skills(p_filter_category := 'framework', p_sort_column := 'name');

-- 5. Filter by category (soft_skill)
-- SELECT * FROM udf_get_skills(p_filter_category := 'soft_skill', p_sort_column := 'name');

-- 6. Filter by category (tool)
-- SELECT * FROM udf_get_skills(p_filter_category := 'tool');

-- 7. Filter by category (domain)
-- SELECT * FROM udf_get_skills(p_filter_category := 'domain');

-- 8. Filter by category (certification)
-- SELECT * FROM udf_get_skills(p_filter_category := 'certification');

-- 9. Search by term (searches name, category, description)
-- SELECT * FROM udf_get_skills(p_search_term := 'Python');

-- 10. Search frameworks
-- SELECT * FROM udf_get_skills(p_search_term := 'React');

-- 11. Paginated: page 1, 10 per page, sorted by name
-- SELECT * FROM udf_get_skills(p_sort_column := 'name', p_page_index := 1, p_page_size := 10);

-- 12. Paginated: page 2, 10 per page, sorted by category then name
-- SELECT * FROM udf_get_skills(p_sort_column := 'category', p_page_index := 2, p_page_size := 10);

-- 13. Combined: active + technical + search
-- SELECT * FROM udf_get_skills(p_filter_category := 'technical', p_search_term := 'Java', p_filter_is_active := TRUE);

-- 14. Soft-deleted records only
-- SELECT * FROM udf_get_skills(p_filter_is_deleted := TRUE);

-- 15. All records, no filter, no pagination
-- SELECT * FROM udf_get_skills();

-- 16. Inactive skills
-- SELECT * FROM udf_get_skills(p_filter_is_active := FALSE);


-- ── Comments ──
