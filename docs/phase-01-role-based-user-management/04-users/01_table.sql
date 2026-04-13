-- ============================================================
-- Table: users
-- Purpose: Single user table for all authentication
-- ============================================================
-- role_id FK → roles table (DEFAULT 8 = student)
--   1-to-Many: One role → many users
-- country_id FK → countries table (DEFAULT 1 = India)
-- sa@growupmore.com = primary super admin, cannot be deleted
-- Login via email OR mobile
-- ============================================================


CREATE TABLE users (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationships ──
    role_id             BIGINT          NOT NULL DEFAULT 8                       -- FK to roles (default Student)
                                        REFERENCES roles(id) ON DELETE RESTRICT,
    country_id          BIGINT          NOT NULL DEFAULT 1                       -- FK to countries (default India)
                                        REFERENCES countries(id) ON DELETE RESTRICT,

    -- ── Name ──
    first_name          TEXT            NOT NULL,
    last_name           TEXT            NOT NULL,

    -- ── Login Credentials ──
    email               CITEXT          UNIQUE,
    mobile              TEXT            UNIQUE,
    password            TEXT            NOT NULL,           -- bcrypt/argon2 hash

    -- ── Audit ──
    created_by          BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by          BIGINT          REFERENCES users(id) ON DELETE SET NULL,

    -- ── Status ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Verification ──
    is_email_verified   BOOLEAN         NOT NULL DEFAULT FALSE,
    is_mobile_verified  BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Timestamps ──
    email_verified_at   TIMESTAMPTZ,
    mobile_verified_at  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ,

    -- ── At least one login method required ──
    CONSTRAINT chk_users_login_method CHECK (email IS NOT NULL OR mobile IS NOT NULL)
);


-- ── Indexes ──

CREATE INDEX idx_users_role ON users (role_id)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_users_country ON users (country_id)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_users_email ON users (email)
    WHERE email IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX idx_users_mobile ON users (mobile)
    WHERE mobile IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX idx_users_active ON users (is_active)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_users_deleted ON users (deleted_at)
    WHERE is_deleted = TRUE;

CREATE INDEX idx_users_created_at ON users (created_at DESC);


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_users_content_trgm
    ON users
    USING GIN ((COALESCE(first_name::TEXT, '') || ' ' || COALESCE(last_name::TEXT, '') || ' ' || COALESCE(email::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Primary Super Admin ──

-- Password 'Admin@123' hashed using pgcrypto (bf = bcrypt)
-- IMPORTANT: Change this password immediately after first login!
INSERT INTO users (
    role_id,
    country_id,
    first_name,
    last_name,
    email,
    password,
    is_active,
    is_email_verified,
    is_mobile_verified
)
VALUES (
    1,                              -- Super Admin role
    1,                              -- India
    'Super',
    'Admin',
    'sa@growupmore.com',
    crypt('Admin@123', gen_salt('bf')),  -- ✅ Correct bcrypt hash
    TRUE,
    TRUE,
    TRUE
)
ON CONFLICT (email) DO UPDATE
SET password = crypt('Admin@123', gen_salt('bf')),
    is_active = TRUE,
    is_email_verified = TRUE,
    is_mobile_verified = TRUE;