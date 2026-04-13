-- ============================================================
-- Table: cities
-- Purpose: Master list of cities linked to states
-- ============================================================


CREATE TABLE cities (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationship ──
    state_id            BIGINT          NOT NULL REFERENCES states(id) ON DELETE RESTRICT,

    -- ── City Info ──
    name                TEXT            NOT NULL,
    phonecode           TEXT,                                -- local phone code
    timezone            TEXT,                                -- IANA timezone, e.g. 'Asia/Kolkata'
    website             TEXT,                                -- Official city website URL

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

-- All cities for a state (most common: dropdown after state selected)
CREATE INDEX idx_cities_state ON cities (state_id)
    WHERE is_deleted = FALSE;

-- Name search
CREATE INDEX idx_cities_name ON cities (name)
    WHERE is_deleted = FALSE;

-- Active cities for a state (dropdowns)
CREATE INDEX idx_cities_state_active ON cities (state_id, name)
    WHERE is_active = TRUE AND is_deleted = FALSE;

-- Timezone lookup
CREATE INDEX idx_cities_timezone ON cities (timezone)
    WHERE timezone IS NOT NULL AND is_deleted = FALSE;

-- Soft-deleted
CREATE INDEX idx_cities_deleted ON cities (deleted_at)
    WHERE is_deleted = TRUE;


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_cities_updated_at
    BEFORE UPDATE ON cities
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Comments ──


-- ══════════════════════════════════════════════
-- Seed Data (12 cities for testing)
-- ══════════════════════════════════════════════

INSERT INTO cities (state_id, name, phonecode, timezone, website, is_active)
VALUES
    -- Maharashtra (state_id 1)
    (1, 'Mumbai',       '022',  'Asia/Kolkata',         'https://mumbai.gov.in',       TRUE),
    (1, 'Pune',         '020',  'Asia/Kolkata',         'https://pune.gov.in',         TRUE),
    (1, 'Nagpur',       '0712', 'Asia/Kolkata',         'https://nagpur.gov.in',       TRUE),
    -- Karnataka (state_id 2)
    (2, 'Bengaluru',    '080',  'Asia/Kolkata',         'https://bengaluru.gov.in',    TRUE),
    (2, 'Mysuru',       '0821', 'Asia/Kolkata',         NULL,                          TRUE),
    -- Tamil Nadu (state_id 3)
    (3, 'Chennai',      '044',  'Asia/Kolkata',         'https://chennai.gov.in',      TRUE),
    -- California (state_id 7)
    (7, 'Los Angeles',  '213',  'America/Los_Angeles',  'https://lacity.org',          TRUE),
    (7, 'San Francisco','415',  'America/Los_Angeles',  'https://sf.gov',              TRUE),
    -- Texas (state_id 8)
    (8, 'Houston',      '713',  'America/Chicago',      'https://houstontx.gov',       TRUE),
    (8, 'Dallas',       '214',  'America/Chicago',      NULL,                          TRUE),
    -- England (state_id 9)
    (9, 'London',       '020',  'Europe/London',        'https://london.gov.uk',       TRUE),
    -- Scotland (state_id 10, is_active = FALSE)
    (10,'Edinburgh',    '0131', 'Europe/London',        'https://edinburgh.gov.uk',    FALSE)
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All cities
-- SELECT * FROM cities;

-- 2. Cities for a specific state (Maharashtra = 1)
-- SELECT * FROM cities WHERE state_id = 1 AND is_deleted = FALSE ORDER BY name;

-- 3. Active cities only
-- SELECT * FROM cities WHERE is_active = TRUE AND is_deleted = FALSE;

-- 4. Cities by timezone
-- SELECT * FROM cities WHERE timezone = 'Asia/Kolkata' AND is_deleted = FALSE;

-- 5. Cities by phonecode
-- SELECT * FROM cities WHERE phonecode = '020';

-- 6. Inactive cities
-- SELECT * FROM cities WHERE is_active = FALSE;

-- 7. Count cities per state
-- SELECT state_id, COUNT(*) FROM cities WHERE is_deleted = FALSE GROUP BY state_id ORDER BY COUNT(*) DESC;

-- 8. Cities with websites
-- SELECT name, website FROM cities WHERE website IS NOT NULL AND is_deleted = FALSE;
