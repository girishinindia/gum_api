-- ═══════════════════════════════════════════════════════════════
--  07 – Category Translations & Sub-Category Translations
-- ═══════════════════════════════════════════════════════════════

-- ─────────────── CATEGORY TRANSLATIONS ───────────────
CREATE TABLE IF NOT EXISTS category_translations (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationships ──
    category_id             BIGINT          NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    language_id             BIGINT          NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,

    -- ── Content ──
    name                    CITEXT          NOT NULL,
    description             TEXT,
    is_new_title            TEXT,

    -- ── Media ──
    image                   TEXT,

    -- ── Tags ──
    tags                    JSONB           DEFAULT '[]'::JSONB,

    -- ── SEO: Meta ──
    meta_title              TEXT,
    meta_description        TEXT,
    meta_keywords           TEXT,
    canonical_url           TEXT,

    -- ── SEO: Open Graph ──
    og_site_name            TEXT,
    og_title                TEXT,
    og_description          TEXT,
    og_type                 TEXT,
    og_image                TEXT,
    og_url                  TEXT,

    -- ── SEO: Twitter Card ──
    twitter_site            TEXT,
    twitter_title           TEXT,
    twitter_description     TEXT,
    twitter_image           TEXT,
    twitter_card            TEXT            DEFAULT 'summary_large_image',

    -- ── SEO: Other ──
    robots_directive        TEXT            DEFAULT 'index,follow',
    focus_keyword           TEXT,

    -- ── Full-Text Search ──
    search_vector           TSVECTOR        GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(meta_title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(meta_description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(focus_keyword, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(tags::TEXT, '')), 'D')
    ) STORED,

    -- ── Structured Data ──
    structured_data         JSONB           DEFAULT '[]'::JSONB,

    -- ── Status & Ordering ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order              INT             NOT NULL DEFAULT 0,

    -- ── Timestamps ──
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    -- ── Unique: one translation per category per language ──
    CONSTRAINT uq_category_translation UNIQUE (category_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_cat_trans_active       ON category_translations (is_active);
CREATE INDEX IF NOT EXISTS idx_cat_trans_category     ON category_translations (category_id);
CREATE INDEX IF NOT EXISTS idx_cat_trans_language     ON category_translations (language_id);
CREATE INDEX IF NOT EXISTS idx_cat_trans_search       ON category_translations USING GIN (search_vector);

CREATE TRIGGER trg_category_translations_updated
    BEFORE UPDATE ON category_translations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─────────────── SUB-CATEGORY TRANSLATIONS ───────────────
CREATE TABLE IF NOT EXISTS sub_category_translations (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationships ──
    sub_category_id         BIGINT          NOT NULL REFERENCES sub_categories(id) ON DELETE RESTRICT,
    language_id             BIGINT          NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,

    -- ── Content ──
    name                    CITEXT          NOT NULL,
    description             TEXT,
    is_new_title            TEXT,

    -- ── Media ──
    image                   TEXT,

    -- ── Tags ──
    tags                    JSONB           DEFAULT '[]'::JSONB,

    -- ── SEO: Meta ──
    meta_title              TEXT,
    meta_description        TEXT,
    meta_keywords           TEXT,
    canonical_url           TEXT,

    -- ── SEO: Open Graph ──
    og_site_name            TEXT,
    og_title                TEXT,
    og_description          TEXT,
    og_type                 TEXT,
    og_image                TEXT,
    og_url                  TEXT,

    -- ── SEO: Twitter Card ──
    twitter_site            TEXT,
    twitter_title           TEXT,
    twitter_description     TEXT,
    twitter_image           TEXT,
    twitter_card            TEXT            DEFAULT 'summary_large_image',

    -- ── SEO: Other ──
    robots_directive        TEXT            DEFAULT 'index,follow',
    focus_keyword           TEXT,

    -- ── Full-Text Search ──
    search_vector           TSVECTOR        GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(meta_title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(meta_description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(focus_keyword, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(tags::TEXT, '')), 'D')
    ) STORED,

    -- ── Structured Data ──
    structured_data         JSONB           DEFAULT '[]'::JSONB,

    -- ── Status & Ordering ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order              INT             NOT NULL DEFAULT 0,

    -- ── Timestamps ──
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    -- ── Unique: one translation per sub-category per language ──
    CONSTRAINT uq_sub_category_translation UNIQUE (sub_category_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_cat_trans_active        ON sub_category_translations (is_active);
CREATE INDEX IF NOT EXISTS idx_sub_cat_trans_sub_category  ON sub_category_translations (sub_category_id);
CREATE INDEX IF NOT EXISTS idx_sub_cat_trans_language      ON sub_category_translations (language_id);
CREATE INDEX IF NOT EXISTS idx_sub_cat_trans_search        ON sub_category_translations USING GIN (search_vector);

CREATE TRIGGER trg_sub_category_translations_updated
    BEFORE UPDATE ON sub_category_translations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─────────────── PERMISSIONS (6 per resource × 2 = 12) ───────────────
INSERT INTO permissions (resource, action, display_name, description) VALUES
  -- Category Translation
  ('category_translation','create','Create Category Translation','Add new category translation'),
  ('category_translation','update','Update Category Translation','Edit category translation details'),
  ('category_translation','delete','Delete Category Translation','Remove category translation'),
  ('category_translation','read','Read Category Translations','View category translation list'),
  ('category_translation','activate','Activate Category Translation','Activate category translation'),
  ('category_translation','deactivate','Deactivate Category Translation','Deactivate category translation'),
  -- Sub-Category Translation
  ('sub_category_translation','create','Create Sub-Category Translation','Add new sub-category translation'),
  ('sub_category_translation','update','Update Sub-Category Translation','Edit sub-category translation details'),
  ('sub_category_translation','delete','Delete Sub-Category Translation','Remove sub-category translation'),
  ('sub_category_translation','read','Read Sub-Category Translations','View sub-category translation list'),
  ('sub_category_translation','activate','Activate Sub-Category Translation','Activate sub-category translation'),
  ('sub_category_translation','deactivate','Deactivate Sub-Category Translation','Deactivate sub-category translation')
ON CONFLICT (resource, action) DO NOTHING;
