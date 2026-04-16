-- ============================================================
-- 01_rbac.sql — Permissions for EXISTING tables only
-- Super_admin (level 100) = auto-all via code bypass
-- Run FIRST in Supabase SQL Editor
-- ============================================================


-- ── ROLES ──
CREATE TABLE roles (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,
    display_name    VARCHAR(100) NOT NULL,
    description     TEXT,
    level           SMALLINT NOT NULL DEFAULT 0,
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT roles_level_range CHECK (level >= 0 AND level <= 100),
    CONSTRAINT roles_name_format CHECK (name ~ '^[a-z][a-z0-9_]*$')
);
CREATE INDEX idx_roles_level ON roles(level DESC);


-- ── PERMISSIONS ──
CREATE TABLE permissions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resource        VARCHAR(50) NOT NULL,
    action          VARCHAR(30) NOT NULL,
    display_name    VARCHAR(150) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT permissions_unique UNIQUE (resource, action),
    CONSTRAINT permissions_resource_format CHECK (resource ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT chk_permission_action CHECK (action = ANY(ARRAY[
        'create','read','update','delete','publish','unpublish',
        'manage_role','manage_permission','export','import',
        'enroll','unenroll','reorder','duplicate','refund','approve','reject',
        'activate','deactivate'
    ]))
);
CREATE INDEX idx_permissions_resource ON permissions(resource);


-- ── ROLE_PERMISSIONS ──
CREATE TABLE role_permissions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_id         BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    conditions      JSONB DEFAULT NULL,
    granted_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_id)
);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);


-- ── USER_ROLES ──
CREATE TABLE user_roles (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    role_id         BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    scope           VARCHAR(20) NOT NULL DEFAULT 'global'
                    CHECK (scope = ANY(ARRAY['global','branch','course','category'])),
    scope_id        BIGINT DEFAULT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at      TIMESTAMPTZ DEFAULT NULL,
    granted_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_active ON user_roles(user_id, is_active) WHERE is_active = TRUE;
-- COALESCE doesn't work in UNIQUE constraint, only in UNIQUE INDEX
CREATE UNIQUE INDEX idx_user_roles_unique ON user_roles(user_id, role_id, scope, COALESCE(scope_id, 0));


-- ── USER_PERMISSIONS ──
CREATE TABLE user_permissions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    permission_id   BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    type            VARCHAR(10) NOT NULL DEFAULT 'grant'
                    CHECK (type = ANY(ARRAY['grant','deny'])),
    scope           VARCHAR(20) NOT NULL DEFAULT 'global'
                    CHECK (scope = ANY(ARRAY['global','branch','course','category'])),
    scope_id        BIGINT DEFAULT NULL,
    reason          TEXT,
    expires_at      TIMESTAMPTZ DEFAULT NULL,
    granted_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);
CREATE UNIQUE INDEX idx_user_permissions_unique ON user_permissions(user_id, permission_id, scope, COALESCE(scope_id, 0));


-- ── RESOURCE_ACCESS ──
CREATE TABLE resource_access (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    access_level    VARCHAR(20) NOT NULL DEFAULT 'owner',
    granted_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT resource_access_unique UNIQUE (resource_type, resource_id, user_id)
);
CREATE INDEX idx_resource_access_user ON resource_access(user_id);
CREATE INDEX idx_resource_access_resource ON resource_access(resource_type, resource_id);


-- ── TRIGGERS ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER tr_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_user_roles_updated_at BEFORE UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── HELPER FUNCTIONS ──

CREATE OR REPLACE FUNCTION get_user_role_level(p_user_id BIGINT)
RETURNS SMALLINT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(MAX(r.level), 0)::SMALLINT
    FROM user_roles ur JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id AND ur.is_active = TRUE AND r.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
$$;

CREATE OR REPLACE FUNCTION check_permission(
    p_user_id BIGINT, p_resource VARCHAR(50), p_action VARCHAR(30),
    p_scope VARCHAR(20) DEFAULT 'global', p_scope_id BIGINT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_denied BOOLEAN; v_granted BOOLEAN; v_level SMALLINT;
BEGIN
    -- Super admin (level 100) = auto-grant EVERYTHING
    SELECT MAX(r.level) INTO v_level FROM user_roles ur JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id AND ur.is_active = TRUE AND r.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
    IF v_level >= 100 THEN RETURN TRUE; END IF;

    -- Check explicit DENY (always wins)
    SELECT TRUE INTO v_denied FROM user_permissions up JOIN permissions p ON up.permission_id = p.id
    WHERE up.user_id = p_user_id AND p.resource = p_resource AND p.action = p_action
        AND up.type = 'deny' AND p.is_active = TRUE AND (up.expires_at IS NULL OR up.expires_at > NOW())
        AND (up.scope = 'global' OR (up.scope = p_scope AND (up.scope_id IS NULL OR up.scope_id = p_scope_id)))
    LIMIT 1; IF v_denied THEN RETURN FALSE; END IF;

    -- Check explicit GRANT
    SELECT TRUE INTO v_granted FROM user_permissions up JOIN permissions p ON up.permission_id = p.id
    WHERE up.user_id = p_user_id AND p.resource = p_resource AND p.action = p_action
        AND up.type = 'grant' AND p.is_active = TRUE AND (up.expires_at IS NULL OR up.expires_at > NOW())
        AND (up.scope = 'global' OR (up.scope = p_scope AND (up.scope_id IS NULL OR up.scope_id = p_scope_id)))
    LIMIT 1; IF v_granted THEN RETURN TRUE; END IF;

    -- Check role-based (with level inheritance)
    SELECT TRUE INTO v_granted FROM user_roles ur
    JOIN roles ur_role ON ur.role_id = ur_role.id
    JOIN roles cr ON cr.level <= ur_role.level
    JOIN role_permissions rp ON rp.role_id = cr.id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id AND p.resource = p_resource AND p.action = p_action
        AND ur.is_active = TRUE AND ur_role.is_active = TRUE AND cr.is_active = TRUE AND p.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND (ur.scope = 'global' OR (ur.scope = p_scope AND (ur.scope_id IS NULL OR ur.scope_id = p_scope_id)))
    LIMIT 1;
    RETURN COALESCE(v_granted, FALSE);
END; $$;

CREATE OR REPLACE FUNCTION user_owns_resource(p_user_id BIGINT, p_resource_type VARCHAR(50), p_resource_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS(SELECT 1 FROM resource_access
        WHERE user_id = p_user_id AND resource_type = p_resource_type
            AND resource_id = p_resource_id AND access_level IN ('owner','editor'));
$$;


-- ============================================================
-- SEED: Roles
-- ============================================================

INSERT INTO roles (name, display_name, description, level, is_system) VALUES
    ('super_admin', 'Super Administrator', 'Full access — Girish only',              100, TRUE),
    ('admin',       'Administrator',       'Manage users, countries, logs',            80, TRUE),
    ('faculty',     'Faculty Member',      'Manage assigned content',                  60, TRUE),
    ('moderator',   'Moderator',           'Review content and support',               40, TRUE),
    ('student',     'Student',             'Learn and track progress',                 20, TRUE),
    ('guest',       'Guest',               'View public content only',                  0, TRUE);


-- ============================================================
-- SEED: Permissions (existing tables only)
-- ============================================================

-- users
INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('user', 'create',      'Create User',       'Admin-create user bypassing registration'),
    ('user', 'read',        'View Users',        'View user profiles and list'),
    ('user', 'update',      'Edit User',         'Update profile/status/locale'),
    ('user', 'delete',      'Delete User',       'Deactivate or remove user'),
    ('user', 'export',      'Export Users',      'Export user list'),
    ('user', 'manage_role', 'Manage User Roles', 'Assign/remove roles'),
    ('user', 'activate',    'Activate/Deactivate User', 'Suspend or reactivate user accounts');

-- roles
INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('role', 'create',   'Create Role',   'Create custom roles'),
    ('role', 'read',     'View Roles',    'View roles and their permissions'),
    ('role', 'update',   'Edit Role',     'Modify role + manage role permissions'),
    ('role', 'delete',   'Delete Role',   'Remove non-system roles'),
    ('role', 'activate', 'Activate/Deactivate Role', 'Enable or disable roles');

-- permissions
INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('permission', 'read',              'View Permissions',   'View all permissions'),
    ('permission', 'manage_permission', 'Manage Permissions', 'Grant/deny direct user permissions'),
    ('permission', 'activate',          'Activate/Deactivate Permission', 'Enable or disable individual permissions');

-- login_sessions
INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('session', 'read',   'View Sessions',   'View active login sessions'),
    ('session', 'delete', 'Revoke Sessions', 'Force-logout sessions');

-- countries
INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('country', 'create',   'Create Country',  'Add new country'),
    ('country', 'read',     'View Countries',  'View country list'),
    ('country', 'update',   'Edit Country',    'Update country info/currency/flag'),
    ('country', 'delete',   'Delete Country',  'Remove country'),
    ('country', 'import',   'Import Countries','Bulk import from file'),
    ('country', 'export',   'Export Countries','Export list CSV/Excel'),
    ('country', 'activate', 'Activate/Deactivate Country', 'Enable or disable countries');

-- activity_logs
INSERT INTO permissions (resource, action, display_name, description) VALUES
    ('activity_log', 'read',   'View Activity Logs',   'View all audit/activity logs'),
    ('activity_log', 'export', 'Export Activity Logs', 'Export logs CSV/Excel'),
    ('activity_log', 'delete', 'Purge Activity Logs',  'Delete old log records');


-- ============================================================
-- SEED: Role→Permission mapping
-- Only super_admin gets permissions. Other roles start empty.
-- Super_admin assigns to others DYNAMICALLY via API.
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'super_admin';

-- admin, faculty, moderator, student, guest = EMPTY (by design)
-- Super admin assigns via:
--   POST /api/v1/roles/:id/permissions/bulk
