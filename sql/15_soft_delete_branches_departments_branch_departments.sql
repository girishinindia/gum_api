-- Migration 15: Soft delete for branches, departments, branch_departments
-- Adds deleted_at column, permissions, and syncs table_summary

ALTER TABLE branches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE branch_departments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

INSERT INTO permissions (resource, action, display_name, description, is_active)
VALUES
    ('branch',            'soft_delete', 'Soft Delete Branch',            'Move a branch to trash',              TRUE),
    ('branch',            'restore',     'Restore Branch',                'Restore a branch from trash',         TRUE),
    ('department',        'soft_delete', 'Soft Delete Department',        'Move a department to trash',          TRUE),
    ('department',        'restore',     'Restore Department',            'Restore a department from trash',     TRUE),
    ('branch_department', 'soft_delete', 'Soft Delete Branch Department', 'Move a branch department to trash',   TRUE),
    ('branch_department', 'restore',     'Restore Branch Department',     'Restore a branch department from trash', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('super_admin', 'admin')
  AND p.resource IN ('branch', 'department', 'branch_department')
  AND p.action IN ('soft_delete', 'restore')
ON CONFLICT DO NOTHING;

SELECT udf_sync_table_summary('branches');
SELECT udf_sync_table_summary('departments');
SELECT udf_sync_table_summary('branch_departments');
