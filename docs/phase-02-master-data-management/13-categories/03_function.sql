-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_get_categories
-- PURPOSE:  Fetch categories with single, all, search, filter, sorting, and pagination support
-- RETURNS:  TABLE with category fields including total_count for pagination
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_get_categories(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'display_order',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters
    p_filter_is_new             BOOLEAN DEFAULT NULL,
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    -- NB: DEFAULT FALSE (not NULL). The base view `uv_categories`
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
    category_id                 BIGINT,
    category_code               TEXT,
    category_slug               TEXT,
    category_display_order      SMALLINT,
    category_icon_url           TEXT,
    category_image_url          TEXT,
    category_is_new             BOOLEAN,
    category_new_until          DATE,
    category_created_by         BIGINT,
    category_updated_by         BIGINT,
    category_is_active          BOOLEAN,
    category_is_deleted         BOOLEAN,
    category_created_at         TIMESTAMPTZ,
    category_updated_at         TIMESTAMPTZ,
    category_deleted_at         TIMESTAMPTZ,
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
            v.category_id,
            v.category_code::TEXT,
            v.category_slug::TEXT,
            v.category_display_order,
            v.category_icon_url,
            v.category_image_url,
            v.category_is_new,
            v.category_new_until,
            v.category_created_by,
            v.category_updated_by,
            v.category_is_active,
            v.category_is_deleted,
            v.category_created_at,
            v.category_updated_at,
            v.category_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_categories v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.category_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.category_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.category_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_is_new IS NOT NULL THEN
            v_where := v_where || format(' AND v.category_is_new = %L', p_filter_is_new);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.category_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.category_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on code + slug) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.category_code::TEXT ILIKE %1$L
                    OR v.category_slug::TEXT ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'               THEN 'v.category_id'
                WHEN 'code'             THEN 'v.category_code'
                WHEN 'slug'             THEN 'v.category_slug'
                WHEN 'display_order'    THEN 'v.category_display_order'
                WHEN 'is_active'        THEN 'v.category_is_active'
                WHEN 'is_deleted'       THEN 'v.category_is_deleted'
                WHEN 'created_at'       THEN 'v.category_created_at'
                WHEN 'updated_at'       THEN 'v.category_updated_at'
                ELSE 'v.category_display_order'
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

    -- ── Execute and return ──
    RETURN QUERY EXECUTE v_sql;

END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_get_category_translations
-- PURPOSE:  Fetch category translations with full SEO fields, parent category context,
--           filter, search, sorting, and pagination support
-- RETURNS:  TABLE with all translation columns plus parent category fields
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_get_category_translations(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_category_id               BIGINT  DEFAULT NULL,
    p_language_id               BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'created_at',
    p_sort_direction            TEXT    DEFAULT 'DESC',

    -- Filters
    p_filter_category_is_active BOOLEAN DEFAULT NULL,
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    -- DEFAULT FALSE: see note in udf_get_categories above.
    p_filter_is_deleted         BOOLEAN DEFAULT FALSE,

    -- Search
    p_search_term               TEXT    DEFAULT NULL,

    -- Pagination
    p_page_index                INT     DEFAULT 1,
    p_page_size                 INT     DEFAULT NULL
)
RETURNS TABLE (
    cat_trans_id                BIGINT,
    cat_trans_category_id       BIGINT,
    cat_trans_language_id       BIGINT,
    cat_trans_name              TEXT,
    cat_trans_description       TEXT,
    cat_trans_is_new_title      TEXT,
    cat_trans_icon              TEXT,
    cat_trans_image             TEXT,
    cat_trans_tags              JSONB,
    cat_trans_meta_title        TEXT,
    cat_trans_meta_description  TEXT,
    cat_trans_meta_keywords     TEXT,
    cat_trans_canonical_url     TEXT,
    cat_trans_og_site_name      TEXT,
    cat_trans_og_title          TEXT,
    cat_trans_og_description    TEXT,
    cat_trans_og_type           TEXT,
    cat_trans_og_image          TEXT,
    cat_trans_og_url            TEXT,
    cat_trans_twitter_site      TEXT,
    cat_trans_twitter_title     TEXT,
    cat_trans_twitter_description TEXT,
    cat_trans_twitter_image     TEXT,
    cat_trans_twitter_card      TEXT,
    cat_trans_robots_directive  TEXT,
    cat_trans_focus_keyword     TEXT,
    cat_trans_structured_data   JSONB,
    cat_trans_created_by        BIGINT,
    cat_trans_updated_by        BIGINT,
    cat_trans_is_active         BOOLEAN,
    cat_trans_is_deleted        BOOLEAN,
    cat_trans_created_at        TIMESTAMPTZ,
    cat_trans_updated_at        TIMESTAMPTZ,
    cat_trans_deleted_at        TIMESTAMPTZ,
    category_code               TEXT,
    category_slug               TEXT,
    category_icon_url           TEXT,
    category_image_url          TEXT,
    category_is_active          BOOLEAN,
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
            v.cat_trans_id,
            v.cat_trans_category_id,
            v.cat_trans_language_id,
            v.cat_trans_name::TEXT,
            v.cat_trans_description,
            v.cat_trans_is_new_title,
            v.cat_trans_icon,
            v.cat_trans_image,
            v.cat_trans_tags,
            v.cat_trans_meta_title,
            v.cat_trans_meta_description,
            v.cat_trans_meta_keywords,
            v.cat_trans_canonical_url,
            v.cat_trans_og_site_name,
            v.cat_trans_og_title,
            v.cat_trans_og_description,
            v.cat_trans_og_type,
            v.cat_trans_og_image,
            v.cat_trans_og_url,
            v.cat_trans_twitter_site,
            v.cat_trans_twitter_title,
            v.cat_trans_twitter_description,
            v.cat_trans_twitter_image,
            v.cat_trans_twitter_card,
            v.cat_trans_robots_directive,
            v.cat_trans_focus_keyword,
            v.cat_trans_structured_data,
            v.cat_trans_created_by,
            v.cat_trans_updated_by,
            v.cat_trans_is_active,
            v.cat_trans_is_deleted,
            v.cat_trans_created_at,
            v.cat_trans_updated_at,
            v.cat_trans_deleted_at,
            v.category_code::TEXT,
            v.category_slug::TEXT,
            v.category_icon_url,
            v.category_image_url,
            v.category_is_active,
            COUNT(*) OVER() AS total_count
        FROM uv_category_translations v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.cat_trans_id = %L', p_id);

    ELSE
        -- ── Exact match filters ──
        IF p_category_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.cat_trans_category_id = %L', p_category_id);
        END IF;

        IF p_language_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.cat_trans_language_id = %L', p_language_id);
        END IF;

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.cat_trans_is_active = %L', p_is_active);
        END IF;

        IF p_filter_category_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.category_is_active = %L', p_filter_category_is_active);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.cat_trans_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.cat_trans_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.cat_trans_name::TEXT ILIKE %1$L
                    OR v.cat_trans_description ILIKE %1$L
                    OR v.cat_trans_meta_title ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'           THEN 'v.cat_trans_id'
                WHEN 'name'         THEN 'v.cat_trans_name'
                WHEN 'language_id'  THEN 'v.cat_trans_language_id'
                WHEN 'category_id'  THEN 'v.cat_trans_category_id'
                WHEN 'created_at'   THEN 'v.cat_trans_created_at'
                ELSE 'v.cat_trans_created_at'
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

    -- ── Execute and return ──
    RETURN QUERY EXECUTE v_sql;

END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════

-- Test udf_get_categories - single record
-- SELECT * FROM udf_get_categories(p_id := 1);

-- Test udf_get_categories - all active
-- SELECT * FROM udf_get_categories(p_filter_is_active := TRUE);

-- Test udf_get_categories - search
-- SELECT * FROM udf_get_categories(p_search_term := 'dev');

-- Test udf_get_category_translations - single
-- SELECT * FROM udf_get_category_translations(p_id := 1);

-- Test udf_get_category_translations - by category and language
-- SELECT * FROM udf_get_category_translations(p_category_id := 1, p_language_id := 1);
