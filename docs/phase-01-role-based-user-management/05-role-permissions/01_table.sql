-- ══════════════════════════════════════════════════════════════════════════════
-- Table: role_permissions
-- Purpose: Many-to-many junction between roles and permissions
-- ══════════════════════════════════════════════════════════════════════════════
-- Each row grants a specific permission to a specific role.
-- Soft delete only — no hard DELETEs on business tables.
-- ══════════════════════════════════════════════════════════════════════════════


CREATE TABLE role_permissions (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Foreign Keys ──
    role_id                 BIGINT          NOT NULL
                            REFERENCES roles(id) ON DELETE RESTRICT,

    permission_id           BIGINT          NOT NULL
                            REFERENCES permissions(id) ON DELETE RESTRICT,

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,

    -- ── Soft Delete ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    is_deleted              BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Timestamps ──
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at              TIMESTAMPTZ
);


-- ── Partial Unique Index (prevent duplicate active assignments) ──
CREATE UNIQUE INDEX uq_role_permissions_role_perm
    ON role_permissions (role_id, permission_id)
    WHERE is_deleted = FALSE;


-- ── Indexes ──

CREATE INDEX idx_role_permissions_role
    ON role_permissions (role_id)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_role_permissions_permission
    ON role_permissions (permission_id)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_role_permissions_active
    ON role_permissions (is_active)
    WHERE is_deleted = FALSE;


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_role_permissions_updated_at
    BEFORE UPDATE ON role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();
