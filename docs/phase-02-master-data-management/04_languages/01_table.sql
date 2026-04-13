-- ============================================================
-- Table: languages
-- Purpose: List of spoken/written languages
-- ============================================================
-- Used by: user_languages (profile linking table)
-- Not programming languages — those are in skills
-- ============================================================


CREATE TABLE languages (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Language Info ──
    name                CITEXT          NOT NULL UNIQUE,
    native_name         TEXT,                               -- हिन्दी, 日本語, العربية
    iso_code            TEXT,                               -- ISO 639-1: en, hi, ja
    script              TEXT,                               -- Latin, Devanagari, Kanji, Arabic

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

CREATE INDEX idx_languages_name ON languages USING gin (name gin_trgm_ops)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_languages_iso ON languages (iso_code)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_languages_active ON languages (is_active)
    WHERE is_deleted = FALSE;


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_languages_content_trgm
    ON languages
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(native_name::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_languages_updated_at
    BEFORE UPDATE ON languages
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

INSERT INTO languages (name, native_name, iso_code, script) VALUES
    -- International
    ('English',         'English',          'en',   'Latin'),
    ('French',          'Français',         'fr',   'Latin'),
    ('Spanish',         'Español',          'es',   'Latin'),
    ('Portuguese',      'Português',        'pt',   'Latin'),
    ('German',          'Deutsch',          'de',   'Latin'),
    ('Italian',         'Italiano',         'it',   'Latin'),
    ('Dutch',           'Nederlands',       'nl',   'Latin'),
    ('Russian',         'Русский',          'ru',   'Cyrillic'),
    ('Chinese',         '中文',              'zh',   'Han'),
    ('Japanese',        '日本語',            'ja',   'Kanji/Kana'),
    ('Korean',          '한국어',            'ko',   'Hangul'),
    ('Arabic',          'العربية',           'ar',   'Arabic'),
    ('Turkish',         'Türkçe',           'tr',   'Latin'),
    ('Thai',            'ไทย',               'th',   'Thai'),
    ('Vietnamese',      'Tiếng Việt',       'vi',   'Latin'),
    ('Indonesian',      'Bahasa Indonesia', 'id',   'Latin'),
    ('Malay',           'Bahasa Melayu',    'ms',   'Latin'),
    ('Swahili',         'Kiswahili',        'sw',   'Latin'),
    ('Persian',         'فارسی',             'fa',   'Arabic'),
    ('Hebrew',          'עברית',             'he',   'Hebrew'),
    ('Polish',          'Polski',           'pl',   'Latin'),
    ('Greek',           'Ελληνικά',         'el',   'Greek'),

    -- Indian Languages
    ('Hindi',           'हिन्दी',            'hi',   'Devanagari'),
    ('Bengali',         'বাংলা',             'bn',   'Bengali'),
    ('Telugu',          'తెలుగు',            'te',   'Telugu'),
    ('Marathi',         'मराठी',             'mr',   'Devanagari'),
    ('Tamil',           'தமிழ்',             'ta',   'Tamil'),
    ('Gujarati',        'ગુજરાતી',           'gu',   'Gujarati'),
    ('Kannada',         'ಕನ್ನಡ',             'kn',   'Kannada'),
    ('Malayalam',       'മലയാളം',           'ml',   'Malayalam'),
    ('Punjabi',         'ਪੰਜਾਬੀ',            'pa',   'Gurmukhi'),
    ('Odia',            'ଓଡ଼ିଆ',             'or',   'Odia'),
    ('Assamese',        'অসমীয়া',           'as',   'Bengali'),
    ('Urdu',            'اردو',              'ur',   'Nastaliq'),
    ('Sanskrit',        'संस्कृतम्',          'sa',   'Devanagari'),
    ('Konkani',         'कोंकणी',            'kok',  'Devanagari'),
    ('Nepali',          'नेपाली',            'ne',   'Devanagari'),
    ('Sindhi',          'سنڌي',              'sd',   'Arabic/Devanagari'),
    ('Kashmiri',        'कॉशुर',             'ks',   'Nastaliq/Devanagari'),
    ('Manipuri',        'মৈতৈলোন্',          'mni',  'Meitei/Bengali'),
    ('Bodo',            'बड़ो',              'brx',  'Devanagari'),
    ('Dogri',           'डोगरी',             'doi',  'Devanagari'),
    ('Maithili',        'मैथिली',            'mai',  'Devanagari'),
    ('Santali',         'ᱥᱟᱱᱛᱟᱲᱤ',          'sat',  'Ol Chiki'),

    -- Sign Languages
    ('Indian Sign Language',    'ISL',      NULL,   'Visual'),
    ('American Sign Language',  'ASL',      NULL,   'Visual');


-- ── Comments ──
