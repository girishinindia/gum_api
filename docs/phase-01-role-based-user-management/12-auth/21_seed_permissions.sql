-- ══════════════════════════════════════════════════════════════════════════════
-- FILE: 21_seed_permissions.sql (in 12-auth/)
-- PURPOSE: Seed default permissions ONLY for tables that exist in the schema
--          and auto-assign to Super Admin (all) + Admin (all except delete)
-- ══════════════════════════════════════════════════════════════════════════════
-- Located in 12-auth/ to ensure correct execution order via merge_sql.py:
--   03-permissions/01_table.sql       → permissions table exists
--   04-users/01_table.sql             → users table exists (FK for created_by)
--   05-role-permissions/01_table.sql  → role_permissions table exists
--   12-auth/20_fn_auto_create_resource_permissions.sql → helper function exists
-- ══════════════════════════════════════════════════════════════════════════════
-- Covered resources (only tables that exist today):
--   1. country       — from phase-01/01-countries
--   2. role          — from phase-01/02-roles
--   3. permission    — from phase-01/03-permissions
--   4. user          — from phase-01/04-users
--   5. audit_log     — from phase-00/11_audit_log_table
--
-- Future phase resources (course, batch, enrollment, order, wallet, webinar,
-- ticket, blog, chat, announcement, notification, internship, certificate,
-- coupon, review, discussion, faq, report, settings) are NOT seeded here.
-- Add them in their respective phase folders when those tables are created.
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. COUNTRY MANAGEMENT (resource: country)
-- ══════════════════════════════════════════════════════════════════════════════
-- Standard CRUD: create, read, update, delete, restore
SELECT udf_auto_create_resource_permissions('country', 1, FALSE, 1);


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. USER MANAGEMENT (resource: user)
-- ══════════════════════════════════════════════════════════════════════════════
-- Standard CRUD + own scope (read.own, update.own)
SELECT udf_auto_create_resource_permissions('user', 1, TRUE, 10);

-- Special user actions (ban, unban, verify, export, import)
INSERT INTO permissions (name, code, resource, action, scope, display_order, created_by) VALUES
    ('Ban User',        'user.ban',     'user', 'ban',    'global', 20, 1),
    ('Unban User',      'user.unban',   'user', 'unban',  'global', 21, 1),
    ('Verify User',     'user.verify',  'user', 'verify', 'global', 22, 1),
    ('Export Users',    'user.export',  'user', 'export', 'global', 23, 1),
    ('Import Users',    'user.import',  'user', 'import', 'global', 24, 1);

-- Assign special user permissions to Super Admin (all) and Admin (all — none are delete)
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 1
FROM permissions p
CROSS JOIN roles r
WHERE p.resource = 'user'
  AND p.action IN ('ban', 'unban', 'verify', 'export', 'import')
  AND p.is_deleted = FALSE
  AND r.level IN (0, 1)
  AND r.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id AND rp.is_deleted = FALSE
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. ROLE MANAGEMENT (resource: role)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO permissions (name, code, resource, action, scope, display_order, created_by) VALUES
    ('View Roles',          'role.read',    'role', 'read',   'global', 30, 1),
    ('Create Role',         'role.create',  'role', 'create', 'global', 31, 1),
    ('Update Role',         'role.update',  'role', 'update', 'global', 32, 1),
    ('Delete Role',         'role.delete',  'role', 'delete', 'global', 33, 1),
    ('Restore Role',        'role.restore', 'role', 'restore','global', 34, 1),
    ('Assign Role to User', 'role.assign',  'role', 'assign', 'global', 35, 1);

-- Super Admin: all role permissions
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 1
FROM permissions p
CROSS JOIN roles r
WHERE p.resource = 'role' AND p.is_deleted = FALSE
  AND r.level = 0 AND r.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id AND rp.is_deleted = FALSE
  );

-- Admin: all role permissions EXCEPT delete
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 1
FROM permissions p
CROSS JOIN roles r
WHERE p.resource = 'role'
  AND p.action <> 'delete'
  AND p.is_deleted = FALSE
  AND r.level = 1 AND r.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id AND rp.is_deleted = FALSE
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. PERMISSION MANAGEMENT (resource: permission)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO permissions (name, code, resource, action, scope, display_order, created_by) VALUES
    ('View Permissions',        'permission.read',    'permission', 'read',   'global', 40, 1),
    ('Create Permission',       'permission.create',  'permission', 'create', 'global', 41, 1),
    ('Update Permission',       'permission.update',  'permission', 'update', 'global', 42, 1),
    ('Delete Permission',       'permission.delete',  'permission', 'delete', 'global', 43, 1),
    ('Restore Permission',      'permission.restore', 'permission', 'restore','global', 44, 1),
    ('Assign Permission',       'permission.assign',  'permission', 'assign', 'global', 45, 1),
    ('Manage Permissions',      'permission.manage',  'permission', 'manage', 'global', 46, 1);

-- Super Admin: all permission management rights
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 1
FROM permissions p
CROSS JOIN roles r
WHERE p.resource = 'permission' AND p.is_deleted = FALSE
  AND r.level = 0 AND r.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id AND rp.is_deleted = FALSE
  );

-- Admin: all permission management EXCEPT delete
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 1
FROM permissions p
CROSS JOIN roles r
WHERE p.resource = 'permission'
  AND p.action <> 'delete'
  AND p.is_deleted = FALSE
  AND r.level = 1 AND r.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id AND rp.is_deleted = FALSE
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. AUDIT LOG MANAGEMENT (resource: audit_log)
-- ══════════════════════════════════════════════════════════════════════════════
-- Audit logs are immutable — only read and export make sense
INSERT INTO permissions (name, code, resource, action, scope, display_order, created_by) VALUES
    ('View Audit Logs',     'audit_log.read',   'audit_log', 'read',   'global', 50, 1),
    ('Export Audit Logs',   'audit_log.export', 'audit_log', 'export', 'global', 51, 1);

-- Super Admin + Admin both get full audit log access (no delete, so Admin included)
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 1
FROM permissions p
CROSS JOIN roles r
WHERE p.resource = 'audit_log' AND p.is_deleted = FALSE
  AND r.level IN (0, 1) AND r.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id AND rp.is_deleted = FALSE
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Total permissions seeded (expected: ~30)
-- SELECT COUNT(*) AS total_permissions FROM permissions WHERE is_deleted = FALSE;

-- Super Admin permission count (should equal total_permissions)
-- SELECT COUNT(*) AS sa_perms FROM role_permissions rp
--   JOIN roles r ON rp.role_id = r.id WHERE r.level = 0 AND rp.is_deleted = FALSE;

-- Admin permission count (should be total_permissions minus all 'delete' actions)
-- SELECT COUNT(*) AS admin_perms FROM role_permissions rp
--   JOIN roles r ON rp.role_id = r.id WHERE r.level = 1 AND rp.is_deleted = FALSE;

-- Verify Admin has NO delete permissions
-- SELECT p.code FROM role_permissions rp
--   JOIN roles r ON rp.role_id = r.id
--   JOIN permissions p ON rp.permission_id = p.id
--   WHERE r.level = 1 AND p.action = 'delete' AND rp.is_deleted = FALSE;
-- Should return 0 rows

-- View all permissions grouped by resource
-- SELECT resource, COUNT(*) FROM permissions WHERE is_deleted = FALSE GROUP BY resource ORDER BY resource;

-- ══════════════════════════════════════════════════════════════════════════════
