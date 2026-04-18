-- Migration 16: Soft delete for users, roles
-- Adds deleted_at column, permissions, and syncs table_summary

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

INSERT INTO permissions (resource, action, display_name, description, is_active)
VALUES
    ('user', 'soft_delete', 'Soft Delete User',  'Move a user to trash',          TRUE),
    ('user', 'restore',     'Restore User',       'Restore a user from trash',     TRUE),
    ('role', 'soft_delete', 'Soft Delete Role',   'Move a role to trash',          TRUE),
    ('role', 'restore',     'Restore Role',       'Restore a role from trash',     TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('super_admin', 'admin')
  AND p.resource IN ('user', 'role')
  AND p.action IN ('soft_delete', 'restore')
ON CONFLICT DO NOTHING;

SELECT udf_sync_table_summary('users');
SELECT udf_sync_table_summary('roles');
