-- ============================================================
-- Table: roles
-- Purpose: Master roles table for RBAC system
-- ============================================================
-- Replaces the hardcoded CHECK on users.role with a dynamic,
-- hierarchical, expandable role system.
-- parent_role_id enables role inheritance (sa → admin → moderator)
-- level: lower number = higher privilege (0 = super_admin)
-- is_system_role: TRUE = cannot be deleted (core roles)
-- ============================================================


CREATE TABLE roles (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Identity ──
    name                    CITEXT          NOT NULL,
    code                    CITEXT          NOT NULL,
    slug                    CITEXT,
    description             TEXT,

    -- ── Hierarchy ──
    parent_role_id          BIGINT          REFERENCES roles(id) ON DELETE SET NULL,
    level                   SMALLINT        NOT NULL DEFAULT 99,

    -- ── System Flags ──
    is_system_role          BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Display ──
    display_order           INT             NOT NULL DEFAULT 0,
    icon                    TEXT,
    color                   TEXT,

    -- ── Audit ──
    created_by              BIGINT,
    updated_by              BIGINT,

    -- ── Soft Delete ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    is_deleted              BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Timestamps ──
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at              TIMESTAMPTZ
);


-- ── Partial Unique Indexes ──

CREATE UNIQUE INDEX uq_roles_name
    ON roles (name)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX uq_roles_code
    ON roles (code)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX uq_roles_slug
    ON roles (slug)
    WHERE is_deleted = FALSE AND slug IS NOT NULL;


-- ── Indexes ──

CREATE INDEX idx_roles_parent ON roles (parent_role_id)
    WHERE is_deleted = FALSE AND parent_role_id IS NOT NULL;

CREATE INDEX idx_roles_level ON roles (level)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_roles_system ON roles (is_system_role)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_roles_active ON roles (is_active)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_roles_display_order ON roles (display_order)
    WHERE is_deleted = FALSE;


-- ── Trigger: auto-slug ──
CREATE TRIGGER trg_roles_slug
    BEFORE INSERT OR UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_slug('name');

-- ── Trigger: updated_at ──
CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

INSERT INTO roles (name, code, level, is_system_role, display_order, icon, description) VALUES
    ('Super Admin',       'super_admin',      0, TRUE,  1,  'shield',           'Full system access. Cannot be deleted or modified.'),
    ('Admin',             'admin',            1, TRUE,  2,  'settings',         'Platform administration. Manages users, courses, settings.'),
    ('Moderator',         'moderator',        2, TRUE,  3,  'eye',              'Content moderation. Approves blogs, reviews, discussions.'),
    ('Content Manager',   'content_manager',  2, TRUE,  4,  'file-text',        'Manages courses, FAQs, policies, and blog content.'),
    ('Finance Admin',     'finance_admin',    2, TRUE,  5,  'dollar-sign',      'Manages orders, refunds, wallets, and financial reports.'),
    ('Support Agent',     'support_agent',    3, TRUE,  6,  'headphones',       'Handles support tickets and user inquiries.'),
    ('Instructor',        'instructor',       4, TRUE,  7,  'book-open',        'Creates and manages courses, assessments, and batches.'),
    ('Student',           'student',          5, TRUE,  8,  'graduation-cap',   'Enrolls in courses, takes assessments, earns certificates.');

-- ── Set parent_role_id for hierarchy ──
-- sa → NULL (top level)
-- admin → sa
-- moderator, content_manager, finance_admin → admin
-- support_agent → admin
-- instructor → NULL (separate branch)
-- student → NULL (separate branch)

UPDATE roles SET parent_role_id = (SELECT id FROM roles WHERE code = 'super_admin') WHERE code = 'admin';
UPDATE roles SET parent_role_id = (SELECT id FROM roles WHERE code = 'admin') WHERE code IN ('moderator', 'content_manager', 'finance_admin', 'support_agent');
