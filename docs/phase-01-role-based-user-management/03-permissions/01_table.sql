-- ============================================================
-- Table: permissions
-- Purpose: Granular permission catalog for RBAC
-- ============================================================
-- Each permission = resource + action + scope
-- Example: resource=course, action=create, scope=global
-- Code format: resource.action[.scope]
-- scope: global (all records), own (only own records), assigned (assigned records)
--
-- NOTE: Seed data is in 08_seed.sql (uses udf_auto_create_resource_permissions)
-- ============================================================


CREATE TABLE permissions (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Identity ──
    name                    CITEXT          NOT NULL,
    code                    CITEXT          NOT NULL,
    description             TEXT,

    -- ── Categorization ──
    resource                TEXT            NOT NULL,
    action                  TEXT            NOT NULL
                            CONSTRAINT chk_permissions_action
                            CHECK (action IN (
                                'create', 'read', 'update', 'delete',
                                'approve', 'reject', 'publish', 'unpublish',
                                'export', 'import', 'assign', 'manage',
                                'restore', 'ban', 'unban', 'verify'
                            )),

    -- ── Scope ──
    scope                   TEXT            NOT NULL DEFAULT 'global'
                            CONSTRAINT chk_permissions_scope
                            CHECK (scope IN ('global', 'own', 'assigned')),

    -- ── Display ──
    display_order           INT             NOT NULL DEFAULT 0,

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

CREATE UNIQUE INDEX uq_permissions_code
    ON permissions (code)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX uq_permissions_resource_action_scope
    ON permissions (resource, action, scope)
    WHERE is_deleted = FALSE;


-- ── Indexes ──

CREATE INDEX idx_permissions_resource ON permissions (resource)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_permissions_action ON permissions (action)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_permissions_scope ON permissions (scope)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_permissions_active ON permissions (is_active)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_permissions_created_at ON permissions (created_at DESC);

-- ── Full-Text Search (pg_trgm) ──
CREATE INDEX idx_permissions_content_trgm
    ON permissions
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(code::TEXT, '') || ' ' || COALESCE(resource, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_permissions_updated_at
    BEFORE UPDATE ON permissions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();
