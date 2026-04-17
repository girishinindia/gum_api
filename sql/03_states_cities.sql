-- ============================================================
-- 03_states_cities.sql
-- States & Cities tables, indexes, triggers, and permissions
-- Run AFTER 02_auth_countries_logs.sql
-- ============================================================


-- ============================================================
-- 1. STATES
-- ============================================================

CREATE TABLE states (
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationship ──
    country_id          BIGINT          NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,

    -- ── State Info ──
    name                TEXT            NOT NULL,
    state_code          VARCHAR(10),                          -- e.g. "GJ", "MH", "CA"

    -- ── Meta ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order          SMALLINT        NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- ── Constraints ──
    UNIQUE(country_id, name)
);

CREATE INDEX idx_states_country    ON states(country_id);
CREATE INDEX idx_states_active     ON states(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_states_sort       ON states(sort_order, name);

CREATE TRIGGER tr_states_updated_at BEFORE UPDATE ON states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 2. CITIES
-- ============================================================

CREATE TABLE cities (
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationship ──
    state_id            BIGINT          NOT NULL REFERENCES states(id) ON DELETE RESTRICT,

    -- ── City Info ──
    name                TEXT            NOT NULL,
    phonecode           TEXT,                                 -- local phone code
    timezone            TEXT,                                 -- IANA timezone, e.g. Asia/Kolkata

    -- ── Meta ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order          SMALLINT        NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- ── Constraints ──
    UNIQUE(state_id, name)
);

CREATE INDEX idx_cities_state      ON cities(state_id);
CREATE INDEX idx_cities_active     ON cities(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_cities_sort       ON cities(sort_order, name);

CREATE TRIGGER tr_cities_updated_at BEFORE UPDATE ON cities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 3. PERMISSIONS — States
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('state', 'create',   'Create State',                  'Add new state/province'),
    ('state', 'read',     'View States',                   'View state list'),
    ('state', 'update',   'Edit State',                    'Update state info'),
    ('state', 'delete',   'Delete State',                  'Remove state'),
    ('state', 'activate', 'Activate/Deactivate State',     'Enable or disable states');


-- ============================================================
-- 4. PERMISSIONS — Cities
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('city', 'create',   'Create City',                  'Add new city'),
    ('city', 'read',     'View Cities',                  'View city list'),
    ('city', 'update',   'Edit City',                    'Update city info'),
    ('city', 'delete',   'Delete City',                  'Remove city'),
    ('city', 'activate', 'Activate/Deactivate City',     'Enable or disable cities');
