-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_get_sub_categories
-- PURPOSE:  Fetch sub-categories with single, all, search, filter, sorting, and pagination support
-- RETURNS:  TABLE with sub-category fields including total_count for pagination
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_get_sub_categories(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'display_order',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters
    p_filter_category_id        BIGINT  DEFAULT NULL,
    p_filter_is_new             BOOLEAN DEFAULT NULL,
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    -- NB: DEFAULT FALSE (not NULL). The base view `uv_sub_categories`
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
    sub_category_id             BIGINT,
    sub_category_category_id    BIGINT,
    sub_category_code           TEXT,
    sub_category_slug           TEXT,
    sub_category_display_order  SMALLINT,
    sub_category_icon_url       TEXT,
    sub_category_image_url      TEXT,
    sub_category_is_new         BOOLEAN,
    sub_category_new_until      DATE,
    sub_category_created_by     BIGINT,
    sub_category_updated_by     BIGINT,
    sub_category_is_active      BOOLEAN,
    sub_category_is_deleted     BOOLEAN,
    sub_category_created_at     TIMESTAMPTZ,
    sub_category_updated_at     TIMESTAMPTZ,
    sub_category_deleted_at     TIMESTAMPTZ,
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
            v.sub_category_id,
            v.sub_category_category_id,
            v.sub_category_code::TEXT,
            v.sub_category_slug::TEXT,
            v.sub_category_display_order,
            v.sub_category_icon_url,
            v.sub_category_image_url,
            v.sub_category_is_new,
            v.sub_category_new_until,
            v.sub_category_created_by,
            v.sub_category_updated_by,
            v.sub_category_is_active,
            v.sub_category_is_deleted,
            v.sub_category_created_at,
            v.sub_category_updated_at,
            v.sub_category_deleted_at,
            COUNT(*) OVER() AS total_count
        FROM uv_sub_categories v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.sub_category_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_category_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_category_is_active = %L', p_is_active);
        END IF;

        -- ── Exact match filters ──
        IF p_filter_category_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_category_category_id = %L', p_filter_category_id);
        END IF;

        IF p_filter_is_new IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_category_is_new = %L', p_filter_is_new);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_category_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_category_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE — uses pg_trgm GIN index on code + slug) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.sub_category_code::TEXT ILIKE %1$L
                    OR v.sub_category_slug::TEXT ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'               THEN 'v.sub_category_id'
                WHEN 'code'             THEN 'v.sub_category_code'
                WHEN 'slug'             THEN 'v.sub_category_slug'
                WHEN 'display_order'    THEN 'v.sub_category_display_order'
                WHEN 'is_active'        THEN 'v.sub_category_is_active'
                WHEN 'is_deleted'       THEN 'v.sub_category_is_deleted'
                WHEN 'created_at'       THEN 'v.sub_category_created_at'
                WHEN 'updated_at'       THEN 'v.sub_category_updated_at'
                ELSE 'v.sub_category_display_order'
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
-- FUNCTION: udf_get_sub_category_translations
-- PURPOSE:  Fetch sub-category translations with full SEO fields, parent context,
--           filter, search, sorting, and pagination support
-- RETURNS:  TABLE with all translation columns plus parent sub_category fields
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_get_sub_category_translations(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_sub_category_id           BIGINT  DEFAULT NULL,
    p_language_id               BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'created_at',
    p_sort_direction            TEXT    DEFAULT 'DESC',

    -- Filters
    p_filter_sub_category_is_active BOOLEAN DEFAULT NULL,
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    -- DEFAULT FALSE: see note in udf_get_sub_categories above.
    p_filter_is_deleted         BOOLEAN DEFAULT FALSE,

    -- Search
    p_search_term               TEXT    DEFAULT NULL,

    -- Pagination
    p_page_index                INT     DEFAULT 1,
    p_page_size                 INT     DEFAULT NULL
)
RETURNS TABLE (
    sub_cat_trans_id                BIGINT,
    sub_cat_trans_sub_category_id   BIGINT,
    sub_cat_trans_language_id       BIGINT,
    sub_cat_trans_name              TEXT,
    sub_cat_trans_description       TEXT,
    sub_cat_trans_is_new_title      TEXT,
    sub_cat_trans_icon              TEXT,
    sub_cat_trans_image             TEXT,
    sub_cat_trans_tags              JSONB,
    sub_cat_trans_meta_title        TEXT,
    sub_cat_trans_meta_description  TEXT,
    sub_cat_trans_meta_keywords     TEXT,
    sub_cat_trans_canonical_url     TEXT,
    sub_cat_trans_og_site_name      TEXT,
    sub_cat_trans_og_title          TEXT,
    sub_cat_trans_og_description    TEXT,
    sub_cat_trans_og_type           TEXT,
    sub_cat_trans_og_image          TEXT,
    sub_cat_trans_og_url            TEXT,
    sub_cat_trans_twitter_site      TEXT,
    sub_cat_trans_twitter_title     TEXT,
    sub_cat_trans_twitter_description TEXT,
    sub_cat_trans_twitter_image     TEXT,
    sub_cat_trans_twitter_card      TEXT,
    sub_cat_trans_robots_directive  TEXT,
    sub_cat_trans_focus_keyword     TEXT,
    sub_cat_trans_structured_data   JSONB,
    sub_cat_trans_created_by        BIGINT,
    sub_cat_trans_updated_by        BIGINT,
    sub_cat_trans_is_active         BOOLEAN,
    sub_cat_trans_is_deleted        BOOLEAN,
    sub_cat_trans_created_at        TIMESTAMPTZ,
    sub_cat_trans_updated_at        TIMESTAMPTZ,
    sub_cat_trans_deleted_at        TIMESTAMPTZ,
    sub_category_code               TEXT,
    sub_category_slug               TEXT,
    sub_category_icon_url           TEXT,
    sub_category_image_url          TEXT,
    sub_category_is_active          BOOLEAN,
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
    v_sql := '
        SELECT
            v.sub_cat_trans_id,
            v.sub_cat_trans_sub_category_id,
            v.sub_cat_trans_language_id,
            v.sub_cat_trans_name::TEXT,
            v.sub_cat_trans_description,
            v.sub_cat_trans_is_new_title,
            v.sub_cat_trans_icon,
            v.sub_cat_trans_image,
            v.sub_cat_trans_tags,
            v.sub_cat_trans_meta_title,
            v.sub_cat_trans_meta_description,
            v.sub_cat_trans_meta_keywords,
            v.sub_cat_trans_canonical_url,
            v.sub_cat_trans_og_site_name,
            v.sub_cat_trans_og_title,
            v.sub_cat_trans_og_description,
            v.sub_cat_trans_og_type,
            v.sub_cat_trans_og_image,
            v.sub_cat_trans_og_url,
            v.sub_cat_trans_twitter_site,
            v.sub_cat_trans_twitter_title,
            v.sub_cat_trans_twitter_description,
            v.sub_cat_trans_twitter_image,
            v.sub_cat_trans_twitter_card,
            v.sub_cat_trans_robots_directive,
            v.sub_cat_trans_focus_keyword,
            v.sub_cat_trans_structured_data,
            v.sub_cat_trans_created_by,
            v.sub_cat_trans_updated_by,
            v.sub_cat_trans_is_active,
            v.sub_cat_trans_is_deleted,
            v.sub_cat_trans_created_at,
            v.sub_cat_trans_updated_at,
            v.sub_cat_trans_deleted_at,
            v.sub_category_code::TEXT,
            v.sub_category_slug::TEXT,
            v.sub_category_icon_url,
            v.sub_category_image_url,
            v.sub_category_is_active,
            COUNT(*) OVER() AS total_count
        FROM uv_sub_category_translations v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.sub_cat_trans_id = %L', p_id);

    ELSE
        -- ── Exact match filters ──
        IF p_sub_category_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_cat_trans_sub_category_id = %L', p_sub_category_id);
        END IF;

        IF p_language_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_cat_trans_language_id = %L', p_language_id);
        END IF;

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_cat_trans_is_active = %L', p_is_active);
        END IF;

        IF p_filter_sub_category_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_category_is_active = %L', p_filter_sub_category_is_active);
        END IF;

        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_cat_trans_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.sub_cat_trans_is_deleted = %L', p_filter_is_deleted);
        END IF;

        -- ── Search (ILIKE) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.sub_cat_trans_name::TEXT ILIKE %1$L
                    OR v.sub_cat_trans_description ILIKE %1$L
                    OR v.sub_cat_trans_meta_title ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                WHEN 'id'               THEN 'v.sub_cat_trans_id'
                WHEN 'name'             THEN 'v.sub_cat_trans_name'
                WHEN 'language_id'      THEN 'v.sub_cat_trans_language_id'
                WHEN 'sub_category_id'  THEN 'v.sub_cat_trans_sub_category_id'
                WHEN 'created_at'       THEN 'v.sub_cat_trans_created_at'
                ELSE 'v.sub_cat_trans_created_at'
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

-- Test udf_get_sub_categories - single record
-- SELECT * FROM udf_get_sub_categories(p_id := 1);

-- Test udf_get_sub_categories - filter by category
-- SELECT * FROM udf_get_sub_categories(p_filter_category_id := 1);

-- Test udf_get_sub_categories - search
-- SELECT * FROM udf_get_sub_categories(p_search_term := 'dev');

-- Test udf_get_sub_category_translations - single
-- SELECT * FROM udf_get_sub_category_translations(p_id := 1);

-- Test udf_get_sub_category_translations - by sub_category and language
-- SELECT * FROM udf_get_sub_category_translations(p_sub_category_id := 1, p_language_id := 1);
