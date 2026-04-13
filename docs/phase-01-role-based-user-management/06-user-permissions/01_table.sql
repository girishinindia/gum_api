-- ══════════════════════════════════════════════════════════════════════════════
-- Table: user_permissions
-- Purpose: Many-to-many junction between users and permissions (overrides)
-- ══════════════════════════════════════════════════════════════════════════════
-- User-level permission overrides on top of role_permissions.
-- Use cases:
--   1. Grant extra permissions to a specific user beyond their role
--   2. Revoke specific permissions from a user (via is_active = FALSE)
-- Soft delete only — no hard DELETEs on business tables.
-- ══════════════════════════════════════════════════════════════════════════════


CREATE TABLE user_permissions (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Foreign Keys ──
    user_id                 BIGINT          NOT NULL
                            REFERENCES users(id) ON DELETE RESTRICT,

    permission_id           BIGINT          NOT NULL
                            REFERENCES permissions(id) ON DELETE RESTRICT,

    -- ── Grant Type ──
    -- 'grant' = extra permission, 'deny' = explicitly revoked
    grant_type              TEXT            NOT NULL DEFAULT 'grant'
                            CONSTRAINT chk_user_permissions_grant_type
                            CHECK (grant_type IN ('grant', 'deny')),

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
CREATE UNIQUE INDEX uq_user_permissions_user_perm
    ON user_permissions (user_id, permission_id)
    WHERE is_deleted = FALSE;


-- ── Indexes ──

CREATE INDEX idx_user_permissions_user
    ON user_permissions (user_id)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_user_permissions_permission
    ON user_permissions (permission_id)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_user_permissions_grant_type
    ON user_permissions (grant_type)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_user_permissions_active
    ON user_permissions (is_active)
    WHERE is_deleted = FALSE;


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_user_permissions_updated_at
    BEFORE UPDATE ON user_permissions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();
