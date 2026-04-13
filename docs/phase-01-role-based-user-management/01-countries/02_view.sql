-- ============================================================
-- Views: countries
-- ============================================================


CREATE OR REPLACE VIEW uv_countries
WITH (security_invoker = true) AS
SELECT
    c.id                    AS country_id,
    c.name                  AS country_name,
    c.iso2                  AS country_iso2,
    c.iso3                  AS country_iso3,
    c.phone_code            AS country_phone_code,
    c.nationality           AS country_nationality,
    c.national_language     AS country_national_language,
    c.languages             AS country_languages,
    c.tld                   AS country_tld,
    c.currency              AS country_currency,
    c.currency_name         AS country_currency_name,
    c.currency_symbol       AS country_currency_symbol,
    c.flag_image            AS country_flag_image,
    c.is_active             AS country_is_active,
    c.is_deleted            AS country_is_deleted,
    c.created_at            AS country_created_at,
    c.updated_at            AS country_updated_at,
    c.deleted_at            AS country_deleted_at
FROM countries c;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All countries via view
-- SELECT * FROM uv_countries;

-- 2. Single country by ID
-- SELECT * FROM uv_countries WHERE country_id = 1;

-- 3. Active countries sorted by name
-- SELECT * FROM uv_countries WHERE country_is_active = TRUE AND country_is_deleted = FALSE ORDER BY country_name;

-- 4. Filter by currency via view
-- SELECT country_name, country_currency, country_currency_symbol FROM uv_countries WHERE country_currency = 'EUR';

-- 5. Search by name via view
-- SELECT country_name, country_iso2, country_phone_code FROM uv_countries WHERE country_name ILIKE '%india%';

-- 6. Countries with specific language
-- SELECT country_name, country_languages FROM uv_countries WHERE country_languages @> '["English"]'::jsonb;

-- 7. Inactive countries
-- SELECT country_name, country_is_active FROM uv_countries WHERE country_is_active = FALSE;
