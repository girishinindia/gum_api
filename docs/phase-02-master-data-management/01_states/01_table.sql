-- ============================================================
-- Table: states
-- Purpose: Master list of states/provinces linked to countries
-- ============================================================


CREATE TABLE states (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationship ──
    country_id          BIGINT          NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,

    -- ── State Info ──
    name                TEXT            NOT NULL,
    languages           JSONB           DEFAULT '[]'::JSONB,-- ["Hindi","Marathi","English"]
    website             TEXT,                                -- official state website

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,

    -- ── Status ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Timestamps ──
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ
);


-- ── Indexes ──

-- All states for a country (most common: dropdown after country selected)
CREATE INDEX idx_states_country ON states (country_id)
    WHERE is_deleted = FALSE;

-- Name search
CREATE INDEX idx_states_name ON states (name)
    WHERE is_deleted = FALSE;

-- Active states for a country (dropdowns)
CREATE INDEX idx_states_country_active ON states (country_id, name)
    WHERE is_active = TRUE AND is_deleted = FALSE;

-- Languages JSONB containment (@> operator)
CREATE INDEX idx_states_languages ON states USING GIN (languages);

-- Soft-deleted
CREATE INDEX idx_states_deleted ON states (deleted_at)
    WHERE is_deleted = TRUE;


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_states_updated_at
    BEFORE UPDATE ON states
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Comments ──


-- ══════════════════════════════════════════════
-- Seed Data (10 states for testing — India)
-- ══════════════════════════════════════════════

INSERT INTO states (country_id, name, languages, website, is_active)
VALUES
    (1, 'Maharashtra',     '["Marathi","Hindi","English"]'::jsonb,       'https://maharashtra.gov.in',     TRUE),
    (1, 'Karnataka',       '["Kannada","English","Hindi"]'::jsonb,       'https://karnataka.gov.in',       TRUE),
    (1, 'Tamil Nadu',      '["Tamil","English"]'::jsonb,                 'https://tn.gov.in',              TRUE),
    (1, 'Gujarat',         '["Gujarati","Hindi","English"]'::jsonb,      'https://gujarat.gov.in',         TRUE),
    (1, 'Rajasthan',       '["Hindi","Rajasthani","English"]'::jsonb,    'https://rajasthan.gov.in',       TRUE),
    (1, 'Kerala',          '["Malayalam","English"]'::jsonb,              'https://kerala.gov.in',          TRUE),
    (2, 'California',      '["English","Spanish"]'::jsonb,               'https://ca.gov',                 TRUE),
    (2, 'Texas',           '["English","Spanish"]'::jsonb,               'https://texas.gov',              TRUE),
    (3, 'England',         '["English"]'::jsonb,                         'https://gov.uk',                 TRUE),
    (3, 'Scotland',        '["English","Scots Gaelic"]'::jsonb,          'https://gov.scot',               FALSE)
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All states
-- SELECT * FROM states;

-- 2. States for a specific country (India = 1)
-- SELECT * FROM states WHERE country_id = 1 AND is_deleted = FALSE ORDER BY name;

-- 3. Active states only
-- SELECT * FROM states WHERE is_active = TRUE AND is_deleted = FALSE;

-- 4. States speaking a specific language
-- SELECT * FROM states WHERE languages @> '["Hindi"]'::jsonb;

-- 5. States speaking multiple languages
-- SELECT * FROM states WHERE languages @> '["English","Hindi"]'::jsonb;

-- 6. Inactive states
-- SELECT * FROM states WHERE is_active = FALSE;

-- 7. Count states per country
-- SELECT country_id, COUNT(*) FROM states WHERE is_deleted = FALSE GROUP BY country_id;
