-- ============================================================
-- 06 — Designations, Specializations, Learning Goals,
--       Social Medias, Categories, Sub-Categories
-- ============================================================
-- Depends on: CITEXT extension (already enabled)
--             update_updated_at() trigger function (already exists)
-- ============================================================

-- ─────────────── DESIGNATIONS ───────────────
CREATE TABLE IF NOT EXISTS designations (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            CITEXT          NOT NULL UNIQUE,
    code            CITEXT          UNIQUE,
    level           INT             NOT NULL DEFAULT 1,
    level_band      TEXT            NOT NULL DEFAULT 'entry'
                    CONSTRAINT chk_designations_band
                    CHECK (level_band IN (
                        'intern', 'entry', 'mid', 'senior',
                        'lead', 'manager', 'director', 'executive'
                    )),
    description     TEXT,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order      INT             NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_designations_active     ON designations (is_active);
CREATE INDEX IF NOT EXISTS idx_designations_level_band ON designations (level_band);
CREATE INDEX IF NOT EXISTS idx_designations_level      ON designations (level);

CREATE TRIGGER trg_designations_updated
    BEFORE UPDATE ON designations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────── SPECIALIZATIONS ───────────────
CREATE TABLE IF NOT EXISTS specializations (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            CITEXT          NOT NULL UNIQUE,
    category        TEXT            NOT NULL DEFAULT 'technology'
                    CONSTRAINT chk_specializations_category
                    CHECK (category IN (
                        'technology', 'data', 'design', 'business',
                        'language', 'science', 'mathematics', 'arts',
                        'health', 'exam_prep', 'professional', 'other'
                    )),
    description     TEXT,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order      INT             NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_specializations_active   ON specializations (is_active);
CREATE INDEX IF NOT EXISTS idx_specializations_category ON specializations (category);

CREATE TRIGGER trg_specializations_updated
    BEFORE UPDATE ON specializations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────── LEARNING GOALS ───────────────
CREATE TABLE IF NOT EXISTS learning_goals (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            CITEXT          NOT NULL UNIQUE,
    description     TEXT,
    display_order   INT             NOT NULL DEFAULT 0,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order      INT             NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_goals_active ON learning_goals (is_active);

CREATE TRIGGER trg_learning_goals_updated
    BEFORE UPDATE ON learning_goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────── SOCIAL MEDIAS ───────────────
CREATE TABLE IF NOT EXISTS social_medias (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            CITEXT          NOT NULL UNIQUE,
    code            CITEXT          NOT NULL UNIQUE,
    base_url        TEXT,
    icon            TEXT,
    placeholder     TEXT,
    platform_type   TEXT            NOT NULL DEFAULT 'social'
                    CONSTRAINT chk_social_medias_type
                    CHECK (platform_type IN (
                        'social', 'professional', 'code', 'video',
                        'blog', 'portfolio', 'messaging', 'website', 'other'
                    )),
    display_order   INT             NOT NULL DEFAULT 0,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order      INT             NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_medias_active ON social_medias (is_active);
CREATE INDEX IF NOT EXISTS idx_social_medias_type   ON social_medias (platform_type);

CREATE TRIGGER trg_social_medias_updated
    BEFORE UPDATE ON social_medias
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────── CATEGORIES ───────────────
CREATE TABLE IF NOT EXISTS categories (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            CITEXT          NOT NULL UNIQUE,
    code            CITEXT          NOT NULL UNIQUE,
    slug            CITEXT          NOT NULL UNIQUE,
    display_order   SMALLINT        DEFAULT 0,
    image           TEXT,
    is_new          BOOLEAN         NOT NULL DEFAULT FALSE,
    new_until       DATE,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order      INT             NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_active ON categories (is_active);
CREATE INDEX IF NOT EXISTS idx_categories_slug   ON categories (slug);

CREATE TRIGGER trg_categories_updated
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────── SUB-CATEGORIES ───────────────
CREATE TABLE IF NOT EXISTS sub_categories (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id     BIGINT          NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name            CITEXT          NOT NULL,
    code            CITEXT          NOT NULL,
    slug            CITEXT          NOT NULL,
    display_order   SMALLINT        DEFAULT 0,
    image           TEXT,
    is_new          BOOLEAN         NOT NULL DEFAULT FALSE,
    new_until       DATE,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order      INT             NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT uq_sub_categories_name     UNIQUE (category_id, name),
    CONSTRAINT uq_sub_categories_code     UNIQUE (category_id, code),
    CONSTRAINT uq_sub_categories_slug     UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_sub_categories_active      ON sub_categories (is_active);
CREATE INDEX IF NOT EXISTS idx_sub_categories_category_id ON sub_categories (category_id);
CREATE INDEX IF NOT EXISTS idx_sub_categories_slug        ON sub_categories (slug);

CREATE TRIGGER trg_sub_categories_updated
    BEFORE UPDATE ON sub_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────── PERMISSIONS (6 per resource × 6 = 36) ───────────────
INSERT INTO permissions (resource, action, display_name, description) VALUES
  -- Designation
  ('designation','create','Create Designation','Add new designation'),
  ('designation','update','Update Designation','Edit designation details'),
  ('designation','delete','Delete Designation','Remove designation'),
  ('designation','read','Read Designations','View designation list'),
  ('designation','activate','Activate Designation','Activate designation'),
  ('designation','deactivate','Deactivate Designation','Deactivate designation'),
  -- Specialization
  ('specialization','create','Create Specialization','Add new specialization'),
  ('specialization','update','Update Specialization','Edit specialization details'),
  ('specialization','delete','Delete Specialization','Remove specialization'),
  ('specialization','read','Read Specializations','View specialization list'),
  ('specialization','activate','Activate Specialization','Activate specialization'),
  ('specialization','deactivate','Deactivate Specialization','Deactivate specialization'),
  -- Learning Goal
  ('learning_goal','create','Create Learning Goal','Add new learning goal'),
  ('learning_goal','update','Update Learning Goal','Edit learning goal details'),
  ('learning_goal','delete','Delete Learning Goal','Remove learning goal'),
  ('learning_goal','read','Read Learning Goals','View learning goal list'),
  ('learning_goal','activate','Activate Learning Goal','Activate learning goal'),
  ('learning_goal','deactivate','Deactivate Learning Goal','Deactivate learning goal'),
  -- Social Media
  ('social_media','create','Create Social Media','Add new social media platform'),
  ('social_media','update','Update Social Media','Edit social media details'),
  ('social_media','delete','Delete Social Media','Remove social media platform'),
  ('social_media','read','Read Social Medias','View social media list'),
  ('social_media','activate','Activate Social Media','Activate social media'),
  ('social_media','deactivate','Deactivate Social Media','Deactivate social media'),
  -- Category
  ('category','create','Create Category','Add new category'),
  ('category','update','Update Category','Edit category details'),
  ('category','delete','Delete Category','Remove category'),
  ('category','read','Read Categories','View category list'),
  ('category','activate','Activate Category','Activate category'),
  ('category','deactivate','Deactivate Category','Deactivate category'),
  -- Sub-Category
  ('sub_category','create','Create Sub-Category','Add new sub-category'),
  ('sub_category','update','Update Sub-Category','Edit sub-category details'),
  ('sub_category','delete','Delete Sub-Category','Remove sub-category'),
  ('sub_category','read','Read Sub-Categories','View sub-category list'),
  ('sub_category','activate','Activate Sub-Category','Activate sub-category'),
  ('sub_category','deactivate','Deactivate Sub-Category','Deactivate sub-category')
ON CONFLICT (resource, action) DO NOTHING;
