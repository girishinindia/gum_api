-- ============================================================
-- View: uv_states
-- Purpose: All states with full country info via uv_countries
-- ============================================================


CREATE OR REPLACE VIEW uv_states
WITH (security_invoker = true) AS
SELECT
    -- State columns
    s.id                    AS state_id,
    s.country_id            AS state_country_id,
    s.name                  AS state_name,
    s.languages             AS state_languages,
    s.website               AS state_website,
    s.is_active             AS state_is_active,
    s.is_deleted            AS state_is_deleted,
    s.created_at            AS state_created_at,
    s.updated_at            AS state_updated_at,
    s.deleted_at            AS state_deleted_at,

    -- Country columns (from countries table)
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
FROM states s
INNER JOIN countries c
    ON s.country_id = c.id;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All states via view
-- SELECT * FROM uv_states;

-- 2. Single state by ID
-- SELECT * FROM uv_states WHERE state_id = 1;

-- 3. States for a specific country (India)
-- SELECT state_name, country_name FROM uv_states WHERE country_iso3 = 'IND' ORDER BY state_name;

-- 4. Active states with active countries
-- SELECT state_name, country_name FROM uv_states WHERE state_is_active = TRUE AND country_is_active = TRUE ORDER BY state_name;

-- 5. States speaking a specific language
-- SELECT state_name, state_languages FROM uv_states WHERE state_languages @> '["Hindi"]'::jsonb;

-- 6. States with country currency info
-- SELECT state_name, country_name, country_currency, country_currency_symbol FROM uv_states WHERE country_currency = 'INR';

-- 7. Inactive states
-- SELECT state_name, state_is_active, country_name FROM uv_states WHERE state_is_active = FALSE;

-- 8. Count states per country via view
-- SELECT country_name, COUNT(*) AS state_count FROM uv_states WHERE state_is_deleted = FALSE GROUP BY country_name ORDER BY state_count DESC;
