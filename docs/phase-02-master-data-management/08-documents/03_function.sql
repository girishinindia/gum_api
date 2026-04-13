-- ============================================================
-- Function: udf_get_documents
-- Purpose: Fetch documents with single, all, search, filter,
--          sorting, and pagination support
-- ============================================================
-- Uses: uv_documents view, pg_trgm (ILIKE), pg_trgm
--
-- Modes:
--   1. Single record:  udf_get_documents(p_id := 1)
--   2. All records:    udf_get_documents()
--   3. Filtered:       udf_get_documents(p_filter_document_type_id := 1)
--   4. Search:         udf_get_documents(p_search_term := 'Aadhar')
--   5. Paginated:      udf_get_documents(p_page_index := 2, p_page_size := 10)
--   6. Combined:       All above can be combined
--
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
-- ============================================================


CREATE OR REPLACE FUNCTION udf_get_documents(
    -- Single record
    p_id                            BIGINT  DEFAULT NULL,
    p_document_type_is_active       BOOLEAN DEFAULT NULL,
    p_document_is_active            BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_table                    TEXT    DEFAULT 'document',
    p_sort_column                   TEXT    DEFAULT 'id',
    p_sort_direction                TEXT    DEFAULT 'ASC',

    -- Document Type filters
    p_filter_document_type_id       BIGINT  DEFAULT NULL,
    p_filter_document_type_name     TEXT    DEFAULT NULL,
    p_filter_document_type_is_active  BOOLEAN DEFAULT NULL,
    p_filter_document_type_is_deleted BOOLEAN DEFAULT NULL,

    -- Document filters
    p_filter_document_is_active     BOOLEAN DEFAULT NULL,
    p_filter_document_is_deleted    BOOLEAN DEFAULT NULL,

    -- Search
    p_search_term                   TEXT    DEFAULT NULL,

    -- Pagination
    p_page_index                    INT     DEFAULT 1,
    p_page_size                     INT     DEFAULT NULL
)
RETURNS TABLE (
    document_id                     BIGINT,
    document_document_type_id       BIGINT,
    document_name                   TEXT,
    document_description            TEXT,
    document_created_by             BIGINT,
    document_updated_by             BIGINT,
    document_is_active              BOOLEAN,
    document_is_deleted             BOOLEAN,
    document_created_at             TIMESTAMPTZ,
    document_updated_at             TIMESTAMPTZ,
    document_deleted_at             TIMESTAMPTZ,

    document_type_id                BIGINT,
    document_type_name              TEXT,
    document_type_description       TEXT,
    document_type_is_active         BOOLEAN,
    document_type_is_deleted        BOOLEAN,
    document_type_created_at        TIMESTAMPTZ,
    document_type_updated_at        TIMESTAMPTZ,
    document_type_deleted_at        TIMESTAMPTZ,

    total_count                     BIGINT
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
    v_sql := 'SELECT *, COUNT(*) OVER() AS total_count FROM uv_documents WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND document_id = %L', p_id);

        IF p_document_type_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND document_type_is_active = %L', p_document_type_is_active);
        END IF;

        IF p_document_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND document_is_active = %L', p_document_is_active);
        END IF;

    ELSE
        -- ── Top-level active flags ──
        IF p_document_type_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND document_type_is_active = %L', p_document_type_is_active);
        END IF;

        IF p_document_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND document_is_active = %L', p_document_is_active);
        END IF;

        -- ── Document Type filters ──
        IF p_filter_document_type_id IS NOT NULL THEN
            v_where := v_where || format(' AND document_type_id = %L', p_filter_document_type_id);
        END IF;

        IF p_filter_document_type_name IS NOT NULL THEN
            v_where := v_where || format(' AND document_type_name::TEXT = %L', p_filter_document_type_name);
        END IF;

        IF p_filter_document_type_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND document_type_is_active = %L', p_filter_document_type_is_active);
        END IF;

        IF p_filter_document_type_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND document_type_is_deleted = %L', p_filter_document_type_is_deleted);
        END IF;

        -- ── Document filters ──
        IF p_filter_document_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND document_is_active = %L', p_filter_document_is_active);
        END IF;

        IF p_filter_document_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND document_is_deleted = %L', p_filter_document_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    document_name::TEXT ILIKE %1$L
                    OR document_description ILIKE %1$L
                    OR document_type_name::TEXT ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        IF p_sort_table = 'document_type' THEN
            v_order := ' ORDER BY ' ||
                CASE p_sort_column
                    WHEN 'name'       THEN 'document_type_name'
                    WHEN 'is_active'  THEN 'document_type_is_active'
                    WHEN 'is_deleted' THEN 'document_type_is_deleted'
                    ELSE 'document_type_id'
                END;
        ELSE
            v_order := ' ORDER BY ' ||
                CASE p_sort_column
                    WHEN 'id'         THEN 'document_id'
                    WHEN 'name'       THEN 'document_name'
                    WHEN 'is_active'  THEN 'document_is_active'
                    WHEN 'is_deleted' THEN 'document_is_deleted'
                    WHEN 'created_at' THEN 'document_created_at'
                    WHEN 'updated_at' THEN 'document_updated_at'
                    ELSE 'document_id'
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
-- Testing
-- ══════════════════════════════════════════════

-- 1. Single record by ID (Aadhar Card)
-- SELECT * FROM udf_get_documents(p_id := 1);

-- 2. All active documents with active types
-- SELECT * FROM udf_get_documents(p_document_type_is_active := TRUE, p_document_is_active := TRUE);

-- 3. Filter by document type ID (Identity Proof = 1)
-- SELECT * FROM udf_get_documents(p_filter_document_type_id := 1, p_sort_column := 'name');

-- 4. Filter by document type ID (Residence Proof = 2)
-- SELECT * FROM udf_get_documents(p_filter_document_type_id := 2, p_sort_column := 'name');

-- 5. Filter by document type ID (Academic Document = 3)
-- SELECT * FROM udf_get_documents(p_filter_document_type_id := 3, p_sort_column := 'name');

-- 6. Filter by document type ID (Professional Document = 4)
-- SELECT * FROM udf_get_documents(p_filter_document_type_id := 4, p_sort_column := 'name');

-- 7. Filter by document type name
-- SELECT * FROM udf_get_documents(p_filter_document_type_name := 'Certification', p_sort_column := 'name');

-- 8. Search by term (searches document name, description, and type name)
-- SELECT * FROM udf_get_documents(p_search_term := 'Aadhar');

-- 9. Search for certificate-related documents
-- SELECT * FROM udf_get_documents(p_search_term := 'certificate');

-- 10. Search for marksheet
-- SELECT * FROM udf_get_documents(p_search_term := 'marksheet');

-- 11. Search for PAN
-- SELECT * FROM udf_get_documents(p_search_term := 'PAN');

-- 12. Paginated: page 1, 10 per page, sorted by name
-- SELECT * FROM udf_get_documents(p_sort_column := 'name', p_page_index := 1, p_page_size := 10);

-- 13. Paginated: page 2, 10 per page
-- SELECT * FROM udf_get_documents(p_sort_column := 'name', p_page_index := 2, p_page_size := 10);

-- 14. Sort by document type name
-- SELECT * FROM udf_get_documents(p_sort_table := 'document_type', p_sort_column := 'name');

-- 15. Soft-deleted documents only
-- SELECT * FROM udf_get_documents(p_filter_document_is_deleted := TRUE);

-- 16. All records, no filter, no pagination
-- SELECT * FROM udf_get_documents();

-- 17. Combined: active + Identity Proof type + search
-- SELECT * FROM udf_get_documents(p_filter_document_type_id := 1, p_search_term := 'card', p_document_is_active := TRUE);

-- 18. Financial documents only
-- SELECT * FROM udf_get_documents(p_filter_document_type_id := 5, p_sort_column := 'name');


-- ── Comments ──
