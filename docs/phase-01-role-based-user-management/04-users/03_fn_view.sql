-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_get_users (with role + country joins)
-- PURPOSE: Fetch users with single, all, search, filter, sorting, pagination
-- ══════════════════════════════════════════════════════════════════════════════
-- Queries from uv_users view (which joins users → roles → countries).
-- Password column is NEVER returned.
-- Returns total_count via COUNT(*) OVER() for pagination metadata.
--
-- Modes:
--   1. Single record:  udf_get_users(p_id := 1)
--   2. All records:    udf_get_users()
--   3. Filtered:       udf_get_users(p_filter_is_active := TRUE)
--   4. Search:         udf_get_users(p_search_term := 'girish')
--   5. By role:        udf_get_users(p_filter_role_id := 8)
--   6. By country:     udf_get_users(p_filter_country_id := 1)
--   7. Paginated:      udf_get_users(p_page_index := 2, p_page_size := 10)
--   8. Combined:       All above can be combined
-- ══════════════════════════════════════════════════════════════════════════════


-- Drop old function signatures
DROP FUNCTION IF EXISTS udf_get_users(BIGINT, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, INT, INT);
DROP FUNCTION IF EXISTS udf_get_users(BIGINT, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BIGINT, TEXT, TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS udf_get_users(BIGINT, BOOLEAN, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BIGINT, TEXT, TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS udf_get_users(BIGINT, BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BIGINT, TEXT, TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION udf_get_users(
    -- Single record
    p_id                        BIGINT  DEFAULT NULL,
    p_is_active                 BOOLEAN DEFAULT NULL,

    -- Sorting
    p_sort_column               TEXT    DEFAULT 'id',
    p_sort_direction            TEXT    DEFAULT 'ASC',

    -- Filters — user
    p_filter_is_active          BOOLEAN DEFAULT NULL,
    p_filter_is_deleted         BOOLEAN DEFAULT NULL,
    p_filter_is_email_verified  BOOLEAN DEFAULT NULL,
    p_filter_is_mobile_verified BOOLEAN DEFAULT NULL,

    -- Filters — role
    p_filter_role_id            BIGINT  DEFAULT NULL,
    p_filter_role_code          TEXT    DEFAULT NULL,
    p_filter_role_level         SMALLINT DEFAULT NULL,

    -- Filters — country
    p_filter_country_id         BIGINT  DEFAULT NULL,
    p_filter_country_iso2       TEXT    DEFAULT NULL,
    p_filter_country_nationality TEXT   DEFAULT NULL,

    -- Search
    p_search_term               TEXT    DEFAULT NULL,

    -- Pagination (1-based; clamped to [1, 100] at runtime)
    p_page_index                INT     DEFAULT 1,
    p_page_size                 INT     DEFAULT 20
)
RETURNS TABLE (
    -- User columns
    user_id                     BIGINT,
    user_role_id                BIGINT,
    user_country_id             BIGINT,
    user_first_name             TEXT,
    user_last_name              TEXT,
    user_email                  CITEXT,
    user_mobile                 TEXT,
    user_is_active              BOOLEAN,
    user_is_deleted             BOOLEAN,
    user_is_email_verified      BOOLEAN,
    user_is_mobile_verified     BOOLEAN,
    user_email_verified_at      TIMESTAMPTZ,
    user_mobile_verified_at     TIMESTAMPTZ,
    user_created_at             TIMESTAMPTZ,
    user_updated_at             TIMESTAMPTZ,
    user_deleted_at             TIMESTAMPTZ,
    -- Role columns
    role_name                   CITEXT,
    role_code                   CITEXT,
    role_slug                   CITEXT,
    role_level                  SMALLINT,
    role_is_system_role         BOOLEAN,
    role_icon                   TEXT,
    role_color                  TEXT,
    role_is_active              BOOLEAN,
    role_is_deleted             BOOLEAN,
    -- Country columns
    country_name                TEXT,
    country_iso2                TEXT,
    country_iso3                TEXT,
    country_phone_code          TEXT,
    country_nationality         TEXT,
    country_national_language   TEXT,
    country_languages           JSONB,
    country_currency            TEXT,
    country_currency_name       TEXT,
    country_currency_symbol     TEXT,
    country_flag_image          TEXT,
    country_is_active           BOOLEAN,
    country_is_deleted          BOOLEAN,
    -- Pagination metadata
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
    p_page_index := GREATEST(COALESCE(p_page_index, 1), 1);
    p_page_size  := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);

    -- ── Base query on view (password excluded) ──
    v_sql := '
        SELECT
            v.user_id,
            v.user_role_id,
            v.user_country_id,
            v.user_first_name,
            v.user_last_name,
            v.user_email,
            v.user_mobile,
            v.user_is_active,
            v.user_is_deleted,
            v.user_is_email_verified,
            v.user_is_mobile_verified,
            v.user_email_verified_at,
            v.user_mobile_verified_at,
            v.user_created_at,
            v.user_updated_at,
            v.user_deleted_at,
            v.role_name,
            v.role_code,
            v.role_slug,
            v.role_level,
            v.role_is_system_role,
            v.role_icon,
            v.role_color,
            v.role_is_active,
            v.role_is_deleted,
            v.country_name,
            v.country_iso2,
            v.country_iso3,
            v.country_phone_code,
            v.country_nationality,
            v.country_national_language,
            v.country_languages,
            v.country_currency,
            v.country_currency_name,
            v.country_currency_symbol,
            v.country_flag_image,
            v.country_is_active,
            v.country_is_deleted,
            COUNT(*) OVER() AS total_count
        FROM uv_users v
        WHERE 1=1';


    -- ── Single record by ID ──
    IF p_id IS NOT NULL THEN
        v_where := v_where || format(' AND v.user_id = %L', p_id);

        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.user_is_active = %L', p_is_active);
        END IF;

    ELSE
        -- ── is_active global filter ──
        IF p_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.user_is_active = %L', p_is_active);
        END IF;

        -- ── User filters ──
        IF p_filter_is_active IS NOT NULL THEN
            v_where := v_where || format(' AND v.user_is_active = %L', p_filter_is_active);
        END IF;

        IF p_filter_is_deleted IS NOT NULL THEN
            v_where := v_where || format(' AND v.user_is_deleted = %L', p_filter_is_deleted);
        END IF;

        IF p_filter_is_email_verified IS NOT NULL THEN
            v_where := v_where || format(' AND v.user_is_email_verified = %L', p_filter_is_email_verified);
        END IF;

        IF p_filter_is_mobile_verified IS NOT NULL THEN
            v_where := v_where || format(' AND v.user_is_mobile_verified = %L', p_filter_is_mobile_verified);
        END IF;

        -- ── Role filters ──
        IF p_filter_role_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.user_role_id = %L', p_filter_role_id);
        END IF;

        IF p_filter_role_code IS NOT NULL THEN
            v_where := v_where || format(' AND v.role_code = %L', p_filter_role_code);
        END IF;

        IF p_filter_role_level IS NOT NULL THEN
            v_where := v_where || format(' AND v.role_level = %L', p_filter_role_level);
        END IF;

        -- ── Country filters ──
        IF p_filter_country_id IS NOT NULL THEN
            v_where := v_where || format(' AND v.user_country_id = %L', p_filter_country_id);
        END IF;

        IF p_filter_country_iso2 IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_iso2 = %L', p_filter_country_iso2);
        END IF;

        IF p_filter_country_nationality IS NOT NULL THEN
            v_where := v_where || format(' AND v.country_nationality = %L', p_filter_country_nationality);
        END IF;

        -- ── Search (ILIKE — searches user + role + country fields) ──
        IF p_search_term IS NOT NULL AND btrim(p_search_term) <> '' THEN
            v_search_param := '%' || btrim(p_search_term) || '%';
            v_where := v_where || format(
                ' AND (
                    v.user_first_name ILIKE %1$L
                    OR v.user_last_name ILIKE %1$L
                    OR v.user_email::TEXT ILIKE %1$L
                    OR v.user_mobile ILIKE %1$L
                    OR v.role_name::TEXT ILIKE %1$L
                    OR v.role_code::TEXT ILIKE %1$L
                    OR v.country_name ILIKE %1$L
                    OR v.country_iso2 ILIKE %1$L
                    OR v.country_phone_code ILIKE %1$L
                    OR v.country_nationality ILIKE %1$L
                )', v_search_param
            );
        END IF;

        -- ── Sorting (whitelisted columns only — prevents injection) ──
        v_order := ' ORDER BY ' ||
            CASE p_sort_column
                -- User columns
                WHEN 'id'                  THEN 'v.user_id'
                WHEN 'first_name'          THEN 'v.user_first_name'
                WHEN 'last_name'           THEN 'v.user_last_name'
                WHEN 'email'               THEN 'v.user_email'
                WHEN 'mobile'              THEN 'v.user_mobile'
                WHEN 'is_active'           THEN 'v.user_is_active'
                WHEN 'is_deleted'          THEN 'v.user_is_deleted'
                WHEN 'is_email_verified'   THEN 'v.user_is_email_verified'
                WHEN 'is_mobile_verified'  THEN 'v.user_is_mobile_verified'
                WHEN 'created_at'          THEN 'v.user_created_at'
                WHEN 'updated_at'          THEN 'v.user_updated_at'
                -- Role columns
                WHEN 'role_name'           THEN 'v.role_name'
                WHEN 'role_code'           THEN 'v.role_code'
                WHEN 'role_level'          THEN 'v.role_level'
                -- Country columns
                WHEN 'country_name'        THEN 'v.country_name'
                WHEN 'country_iso2'        THEN 'v.country_iso2'
                WHEN 'country_phone_code'  THEN 'v.country_phone_code'
                WHEN 'country_nationality' THEN 'v.country_nationality'
                ELSE 'v.user_id'
            END
            || ' ' ||
            CASE WHEN upper(p_sort_direction) = 'DESC' THEN 'DESC' ELSE 'ASC' END;

        -- ── Pagination (clamped values set at top of function) ──
        v_offset := (p_page_index - 1) * p_page_size;
        v_limit  := format(' LIMIT %s OFFSET %s', p_page_size, v_offset);

    END IF;

    -- ── Build final SQL ──
    v_sql := v_sql || v_where || v_order || v_limit;

    -- ── Execute and return ──
    RETURN QUERY EXECUTE v_sql;

END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Single record by ID
-- SELECT * FROM udf_get_users(p_id := 1);

-- 2. All active users sorted by first name
-- SELECT * FROM udf_get_users(p_filter_is_active := TRUE, p_sort_column := 'first_name');

-- 3. Filter by role (Student — id 8)
-- SELECT * FROM udf_get_users(p_filter_role_id := 8);

-- 4. Filter by role code
-- SELECT * FROM udf_get_users(p_filter_role_code := 'instructor');

-- 5. Filter by role level (all level 5 = student-tier)
-- SELECT * FROM udf_get_users(p_filter_role_level := 5);

-- 6. Filter by country (India — id 1)
-- SELECT * FROM udf_get_users(p_filter_country_id := 1);

-- 7. Filter by country ISO2 (US)
-- SELECT * FROM udf_get_users(p_filter_country_iso2 := 'US');

-- 8. Filter by nationality
-- SELECT * FROM udf_get_users(p_filter_country_nationality := 'Indian');

-- 9. Search by term (searches name, email, mobile, role, country fields)
-- SELECT * FROM udf_get_users(p_search_term := 'admin');

-- 10. Sort by role name
-- SELECT * FROM udf_get_users(p_sort_column := 'role_name', p_sort_direction := 'ASC');

-- 11. Paginated: page 2, 10 per page, sorted by created_at DESC
-- SELECT * FROM udf_get_users(p_sort_column := 'created_at', p_sort_direction := 'DESC', p_page_index := 2, p_page_size := 10);

-- 12. Combined: students from India + search
-- SELECT * FROM udf_get_users(p_filter_role_code := 'student', p_filter_country_id := 1, p_search_term := 'girish');

-- 13. Soft-deleted records only
-- SELECT * FROM udf_get_users(p_filter_is_deleted := TRUE);

-- 14. All records, no filter, no pagination
-- SELECT * FROM udf_get_users();

-- ══════════════════════════════════════════════════════════════════════════════
