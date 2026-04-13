-- ============================================================
-- Table: countries
-- Purpose: Master list of countries with ISO codes and currency
-- ============================================================


CREATE TABLE countries (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Country Info ──
    name                TEXT            NOT NULL,
    iso2                TEXT            NOT NULL UNIQUE,     -- ISO 3166-1 alpha-2 (IN, US, GB)
    iso3                TEXT            NOT NULL UNIQUE,     -- ISO 3166-1 alpha-3 (IND, USA, GBR)
    phone_code          TEXT,                                -- international dialing code: +91, +1
    nationality         TEXT,                                -- Indian, American, British
    national_language   TEXT,                                -- Hindi, English, French
    languages           JSONB           DEFAULT '[]'::JSONB,-- ["Hindi","English","Tamil"]
    tld                 TEXT,                                -- top-level domain: .in, .us, .uk

    -- ── Currency ──
    currency            TEXT,                                -- currency code: INR, USD, GBP
    currency_name       TEXT,                                -- Indian Rupee, US Dollar
    currency_symbol     TEXT,                                -- ₹, $, £

    -- ── Flag ──
    flag_image          TEXT,                                -- flag image path (max 100KB)

    -- ── Audit ──
    -- FK to users(id) is added later in 04-users/08_add_audit_fks.sql
    -- (users table doesn't exist yet at this point in the load order).
    created_by              BIGINT,
    updated_by              BIGINT,

    -- ── Status ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Timestamps ──
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ
);


-- ── Indexes ──

-- Name search (most common lookup)
CREATE INDEX idx_countries_name ON countries (name)
    WHERE is_deleted = FALSE;

-- Name fuzzy search (pg_trgm for ILIKE / similarity)
CREATE INDEX idx_countries_name_trgm ON countries USING GIN (name gin_trgm_ops);

-- Phone code lookup
CREATE INDEX idx_countries_phone ON countries (phone_code)
    WHERE phone_code IS NOT NULL AND is_deleted = FALSE;

-- Currency lookup
CREATE INDEX idx_countries_currency ON countries (currency)
    WHERE currency IS NOT NULL AND is_deleted = FALSE;

-- Nationality lookup
CREATE INDEX idx_countries_nationality ON countries (nationality)
    WHERE nationality IS NOT NULL AND is_deleted = FALSE;

-- Languages JSONB containment (@> operator)
CREATE INDEX idx_countries_languages ON countries USING GIN (languages);

-- Active countries (dropdowns)
CREATE INDEX idx_countries_active ON countries (name)
    WHERE is_active = TRUE AND is_deleted = FALSE;

-- Soft-deleted
CREATE INDEX idx_countries_deleted ON countries (deleted_at)
    WHERE is_deleted = TRUE;


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_countries_updated_at
    BEFORE UPDATE ON countries
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Comments ──


-- ══════════════════════════════════════════════
-- Seed Data (10 countries for testing)
-- ══════════════════════════════════════════════

INSERT INTO countries (name, iso2, iso3, phone_code, nationality, national_language, languages, tld, currency, currency_name, currency_symbol, flag_image, is_active)
VALUES
    ('India',           'IN', 'IND', '+91',  'Indian',    'Hindi',   '["Hindi","English","Tamil","Telugu","Bengali"]'::jsonb, '.in', 'INR', 'Indian Rupee',       '₹', '/flags/in.svg', TRUE),
    ('United States',   'US', 'USA', '+1',   'American',  'English', '["English","Spanish"]'::jsonb,                         '.us', 'USD', 'US Dollar',          '$', '/flags/us.svg', TRUE),
    ('United Kingdom',  'GB', 'GBR', '+44',  'British',   'English', '["English","Welsh","Scots Gaelic"]'::jsonb,             '.uk', 'GBP', 'Pound Sterling',     '£', '/flags/gb.svg', TRUE),
    ('Canada',          'CA', 'CAN', '+1',   'Canadian',  'English', '["English","French"]'::jsonb,                          '.ca', 'CAD', 'Canadian Dollar',    'C$', '/flags/ca.svg', TRUE),
    ('Australia',       'AU', 'AUS', '+61',  'Australian','English', '["English"]'::jsonb,                                   '.au', 'AUD', 'Australian Dollar',  'A$', '/flags/au.svg', TRUE),
    ('Germany',         'DE', 'DEU', '+49',  'German',    'German',  '["German"]'::jsonb,                                    '.de', 'EUR', 'Euro',               '€',  '/flags/de.svg', TRUE),
    ('France',          'FR', 'FRA', '+33',  'French',    'French',  '["French"]'::jsonb,                                    '.fr', 'EUR', 'Euro',               '€',  '/flags/fr.svg', TRUE),
    ('Japan',           'JP', 'JPN', '+81',  'Japanese',  'Japanese','["Japanese"]'::jsonb,                                   '.jp', 'JPY', 'Japanese Yen',       '¥',  '/flags/jp.svg', TRUE),
    ('Brazil',          'BR', 'BRA', '+55',  'Brazilian', 'Portuguese','["Portuguese"]'::jsonb,                               '.br', 'BRL', 'Brazilian Real',     'R$', '/flags/br.svg', TRUE),
    ('United Arab Emirates','AE','ARE','+971','Emirati',  'Arabic',  '["Arabic","English","Hindi","Urdu"]'::jsonb,            '.ae', 'AED', 'UAE Dirham',         'د.إ','/flags/ae.svg', FALSE)
ON CONFLICT (iso2) DO NOTHING;


-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All countries
-- SELECT * FROM countries;

-- 2. Active countries only
-- SELECT * FROM countries WHERE is_active = TRUE AND is_deleted = FALSE;

-- 3. Find by ISO2
-- SELECT * FROM countries WHERE iso2 = 'IN';

-- 4. Find by ISO3
-- SELECT * FROM countries WHERE iso3 = 'IND';

-- 5. Fuzzy name search (uses pg_trgm GIN index)
-- SELECT * FROM countries WHERE name ILIKE '%united%';

-- 6. Find countries speaking a specific language (JSONB containment)
-- SELECT * FROM countries WHERE languages @> '["English"]'::jsonb;

-- 7. Find countries speaking multiple languages
-- SELECT * FROM countries WHERE languages @> '["English","French"]'::jsonb;

-- 8. Filter by currency
-- SELECT * FROM countries WHERE currency = 'EUR';

-- 9. Filter by phone code (shared codes: US & Canada both +1)
-- SELECT * FROM countries WHERE phone_code = '+1';

-- 10. Soft-deleted countries
-- SELECT * FROM countries WHERE is_deleted = TRUE;

-- 11. Count by currency
-- SELECT currency, COUNT(*) FROM countries WHERE is_deleted = FALSE GROUP BY currency ORDER BY COUNT(*) DESC;

-- 12. Count languages per country
-- SELECT name, jsonb_array_length(languages) AS lang_count FROM countries ORDER BY lang_count DESC;
