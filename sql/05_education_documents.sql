-- ============================================================
-- 05_education_documents.sql
-- Education Levels, Document Types, Documents tables
-- Run AFTER 04_skills_languages.sql
-- ============================================================


-- ============================================================
-- 1. EDUCATION LEVELS
-- ============================================================

CREATE TABLE education_levels (
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Education Level Info ──
    name                CITEXT          NOT NULL UNIQUE,
    abbreviation        TEXT,                                 -- B.Tech, MBA, PhD
    level_order         INT             NOT NULL DEFAULT 0,   -- 1=lowest, higher=advanced
    level_category      TEXT            NOT NULL DEFAULT 'other'
                        CONSTRAINT chk_education_levels_category
                        CHECK (level_category IN (
                            'pre_school',
                            'school',
                            'diploma',
                            'undergraduate',
                            'postgraduate',
                            'doctoral',
                            'professional',
                            'informal',
                            'other'
                        )),
    description         TEXT,

    -- ── Meta ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order          SMALLINT        NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_education_levels_category ON education_levels(level_category);
CREATE INDEX idx_education_levels_active   ON education_levels(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_education_levels_sort     ON education_levels(sort_order, name);
CREATE INDEX idx_education_levels_order    ON education_levels(level_order);

CREATE TRIGGER tr_education_levels_updated_at BEFORE UPDATE ON education_levels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 2. DOCUMENT TYPES
-- ============================================================

CREATE TABLE document_types (
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Document Type Info ──
    name                CITEXT          NOT NULL UNIQUE,
    description         TEXT,

    -- ── Meta ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order          SMALLINT        NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_types_active ON document_types(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_document_types_sort   ON document_types(sort_order, name);

CREATE TRIGGER tr_document_types_updated_at BEFORE UPDATE ON document_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 3. DOCUMENTS (templates / master documents, NOT user uploads)
-- ============================================================

CREATE TABLE documents (
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationship ──
    document_type_id    BIGINT          NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,

    -- ── Document Info ──
    name                CITEXT          NOT NULL,
    description         TEXT,
    file_url            TEXT,                                 -- CDN URL for uploaded file

    -- ── Meta ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order          SMALLINT        NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- ── Constraints ──
    UNIQUE(document_type_id, name)
);

CREATE INDEX idx_documents_type    ON documents(document_type_id);
CREATE INDEX idx_documents_active  ON documents(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_documents_sort    ON documents(sort_order, name);

CREATE TRIGGER tr_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 4. PERMISSIONS — Education Levels
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('education_level', 'create',   'Create Education Level',              'Add new education level'),
    ('education_level', 'read',     'View Education Levels',               'View education level list'),
    ('education_level', 'update',   'Edit Education Level',                'Update education level info'),
    ('education_level', 'delete',   'Delete Education Level',              'Remove education level'),
    ('education_level', 'activate', 'Activate/Deactivate Education Level', 'Enable or disable education levels');


-- ============================================================
-- 5. PERMISSIONS — Document Types
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('document_type', 'create',   'Create Document Type',              'Add new document type'),
    ('document_type', 'read',     'View Document Types',               'View document type list'),
    ('document_type', 'update',   'Edit Document Type',                'Update document type info'),
    ('document_type', 'delete',   'Delete Document Type',              'Remove document type'),
    ('document_type', 'activate', 'Activate/Deactivate Document Type', 'Enable or disable document types');


-- ============================================================
-- 6. PERMISSIONS — Documents
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('document', 'create',   'Create Document',              'Add new document'),
    ('document', 'read',     'View Documents',               'View document list'),
    ('document', 'update',   'Edit Document',                'Update document info/file'),
    ('document', 'delete',   'Delete Document',              'Remove document'),
    ('document', 'activate', 'Activate/Deactivate Document', 'Enable or disable documents');
