-- ============================================================
-- 04_skills_languages.sql
-- Skills & Languages tables, indexes, triggers, and permissions
-- Run AFTER 03_states_cities.sql
-- ============================================================

-- Enable CITEXT extension (case-insensitive text)
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


-- ============================================================
-- 1. SKILLS
-- ============================================================

CREATE TABLE skills (
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Skill Info ──
    name                CITEXT          NOT NULL UNIQUE,
    category            TEXT            NOT NULL DEFAULT 'technical'
                        CONSTRAINT chk_skills_category
                        CHECK (category IN (
                            'technical',
                            'soft_skill',
                            'tool',
                            'framework',
                            'language',
                            'domain',
                            'certification',
                            'other'
                        )),
    description         TEXT,
    icon                TEXT,                                 -- CDN URL for skill icon image

    -- ── Meta ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order          SMALLINT        NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skills_category   ON skills(category);
CREATE INDEX idx_skills_active     ON skills(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_skills_sort       ON skills(sort_order, name);

CREATE TRIGGER tr_skills_updated_at BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 2. LANGUAGES
-- ============================================================

CREATE TABLE languages (
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Language Info ──
    name                CITEXT          NOT NULL UNIQUE,
    native_name         TEXT,                                 -- हिन्दी, 日本語, العربية
    iso_code            VARCHAR(10),                          -- ISO 639-1: en, hi, ja
    script              TEXT,                                 -- Latin, Devanagari, Kanji, Arabic
    for_material        BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Meta ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order          SMALLINT        NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_languages_iso     ON languages(iso_code);
CREATE INDEX idx_languages_active  ON languages(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_languages_sort    ON languages(sort_order, name);
CREATE INDEX idx_languages_material ON languages(for_material) WHERE for_material = TRUE;

CREATE TRIGGER tr_languages_updated_at BEFORE UPDATE ON languages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 3. PERMISSIONS — Skills
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('skill', 'create',   'Create Skill',                  'Add new skill'),
    ('skill', 'read',     'View Skills',                   'View skill list'),
    ('skill', 'update',   'Edit Skill',                    'Update skill info/icon'),
    ('skill', 'delete',   'Delete Skill',                  'Remove skill'),
    ('skill', 'activate', 'Activate/Deactivate Skill',     'Enable or disable skills');


-- ============================================================
-- 4. PERMISSIONS — Languages
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('language', 'create',   'Create Language',                  'Add new language'),
    ('language', 'read',     'View Languages',                   'View language list'),
    ('language', 'update',   'Edit Language',                    'Update language info'),
    ('language', 'delete',   'Delete Language',                  'Remove language'),
    ('language', 'activate', 'Activate/Deactivate Language',     'Enable or disable languages');
