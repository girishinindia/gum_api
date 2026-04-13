-- ============================================================
-- Function: udf_get_document_types
-- Purpose: Fetch document types with single, all, search,
--          filter, sorting, and pagination support
-- ============================================================
-- Uses: uv_document_types view, pg_trgm (ILIKE), pg_trgm
--
-- Modes:
--   1. Single record:  udf_get_document_types(p_id := 1)
--   2. All records:    udf_get_document_types()
--   3. Search:         udf_get_document_types(p_search_term := 'Identity')
--   4. Paginated:      udf_get_document_types(p_page_index := 1, p_page_size := 5)
--   5. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_document_types(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'id',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    p_filter_is_deleted         BOOLEAN DEFAULT NULL,

    -- Search
    p_search_term               TEXT    DEFAULT NULL,

    -- Pagination
    p_page_index                INT     DEFAULT 1,
    p_page_size                 INT     DEFAULT NULL
)
RETURNS TABLE (
    document_type_id            BIGINT,
    document_type_name          TEXT,
    document_type_description   TEXT,
    document_type_created_by    BIGINT,
    document_type_updated_by    BIGINT,
    document_type_is_active     BOOLEAN,
    document_type_is_deleted    BOOLEAN,
    document_type_created_at    TIMESTAMPTZ,
    document_type_updated_at    TIMESTAMPTZ,
    document_type_deleted_at    TIMESTAMPTZ,
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
            v.document_type_id,
            v.document_type_name::TEXT,
            v.document_type_description,
            v.document_type_created_by,
            v.document_type_updated_by,
            v.document_type_is_active,
            v.document_type_is_deleted,
            v.document_type_created_at,
            v.document_type_updated_at,
            v.document_type_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_document_types v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.document_type_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.document_type_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.document_type_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.document_type_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.document_type_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on name) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.document_type_name::TEXT ILIKE %1$L
                    OR v.document_type_description ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'           THEN 'v.document_type_id'
                WHEN 'name'         THEN 'v.document_type_name'
                WHEN 'is_active'    THEN 'v.document_type_is_active'
                WHEN 'is_deleted'   THEN 'v.document_type_is_deleted'
                WHEN 'created_at'   THEN 'v.document_type_created_at'
                WHEN 'updated_at'   THEN 'v.document_type_updated_at'
                ELSE 'v.document_type_id'
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

-- 1. Single record by ID (Identity Proof)
-- SELECT * FROM udf_get_document_types(p_id := 1);

-- 2. All active document types sorted by name
-- SELECT * FROM udf_get_document_types(p_filter_is_active := TRUE, p_sort_column := 'name');

-- 3. Search by term (searches name and description)
-- SELECT * FROM udf_get_document_types(p_search_term := 'Identity');

-- 4. Search for certificate-related types
-- SELECT * FROM udf_get_document_types(p_search_term := 'certificate');

-- 5. Search for financial types
-- SELECT * FROM udf_get_document_types(p_search_term := 'financial');

-- 6. Paginated: page 1, 5 per page, sorted by name
-- SELECT * FROM udf_get_document_types(p_sort_column := 'name', p_page_index := 1, p_page_size := 5);

-- 7. Paginated: page 2, 5 per page
-- SELECT * FROM udf_get_document_types(p_sort_column := 'name', p_page_index := 2, p_page_size := 5);

-- 8. Soft-deleted records only
-- SELECT * FROM udf_get_document_types(p_filter_is_deleted := TRUE);

-- 9. All records, no filter, no pagination
-- SELECT * FROM udf_get_document_types();

-- 10. Inactive document types
-- SELECT * FROM udf_get_document_types(p_filter_is_active := FALSE);

-- 11. Sort by name descending
-- SELECT * FROM udf_get_document_types(p_sort_column := 'name', p_sort_direction := 'DESC');


-- ── Comments ──
