-- ============================================================
-- View: uv_cities
-- Purpose: All cities with full state and country info
--          via raw states and countries tables
-- ============================================================


CREATE OR REPLACE VIEW uv_cities
WITH (security_invoker = true) AS
SELECT
    -- City columns
    ci.id                   AS city_id,
    ci.state_id             AS city_state_id,
    ci.name                 AS city_name,
    ci.phonecode            AS city_phonecode,
    ci.timezone             AS city_timezone,
    ci.website              AS city_website,
    ci.is_active            AS city_is_active,
    ci.is_deleted           AS city_is_deleted,
    ci.created_at           AS city_created_at,
    ci.updated_at           AS city_updated_at,
    ci.deleted_at           AS city_deleted_at,

    -- State columns (from states table)
    s.id                            AS state_id,
    s.country_id                    AS state_country_id,
    s.name                          AS state_name,
    s.languages                     AS state_languages,
    s.website                       AS state_website,
    s.is_active                     AS state_is_active,
    s.is_deleted                    AS state_is_deleted,
    s.created_at                    AS state_created_at,
    s.updated_at                    AS state_updated_at,
    s.deleted_at                    AS state_deleted_at,

    -- Country columns (from countries table via states)
    c.id                            AS country_id,
    c.name                          AS country_name,
    c.iso2                          AS country_iso2,
    c.iso3                          AS country_iso3,
    c.phone_code                    AS country_phone_code,
    c.currency                      AS country_currency,
    c.currency_name                 AS country_currency_name,
    c.currency_symbol               AS country_currency_symbol,
    c.national_language             AS country_national_language,
    c.nationality                   AS country_nationality,
    c.languages                     AS country_languages,
    c.tld                           AS country_tld,
    c.flag_image                    AS country_flag_image,
    c.is_active                     AS country_is_active,
    c.is_deleted                    AS country_is_deleted,
    c.created_at                    AS country_created_at,
    c.updated_at                    AS country_updated_at,
    c.deleted_at                    AS country_deleted_at
FROM cities ci
INNER JOIN states s
    ON ci.state_id = s.id
INNER JOIN countries c
    ON s.country_id = c.id;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All cities via view
-- SELECT * FROM uv_cities;

-- 2. Single city by ID
-- SELECT * FROM uv_cities WHERE city_id = 1;

-- 3. Cities for a specific state (Maharashtra)
-- SELECT city_name, state_name, country_name FROM uv_cities WHERE state_name = 'Maharashtra' ORDER BY city_name;

-- 4. Cities for a specific country (India)
-- SELECT city_name, state_name FROM uv_cities WHERE country_iso3 = 'IND' ORDER BY state_name, city_name;

-- 5. Active cities with active states and active countries
-- SELECT city_name, state_name, country_name FROM uv_cities
-- WHERE city_is_active = TRUE AND state_is_active = TRUE AND country_is_active = TRUE ORDER BY city_name;

-- 6. Cities by timezone
-- SELECT city_name, city_timezone, country_name FROM uv_cities WHERE city_timezone = 'America/Los_Angeles';

-- 7. Cities in states speaking Hindi
-- SELECT city_name, state_name, state_languages FROM uv_cities WHERE state_languages @> '["Hindi"]'::jsonb;

-- 8. Inactive cities
-- SELECT city_name, city_is_active, state_name, country_name FROM uv_cities WHERE city_is_active = FALSE;

-- 9. Count cities per state via view
-- SELECT state_name, country_name, COUNT(*) AS city_count FROM uv_cities WHERE city_is_deleted = FALSE GROUP BY state_name, country_name ORDER BY city_count DESC;

-- 10. Cities with currency info
-- SELECT city_name, country_currency, country_currency_symbol FROM uv_cities WHERE country_currency = 'USD';
