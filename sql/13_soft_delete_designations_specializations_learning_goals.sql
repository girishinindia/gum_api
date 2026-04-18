-- ============================================================
-- 13_soft_delete_designations_specializations_learning_goals.sql
-- Soft Delete & Restore for Designations, Specializations, Learning Goals
-- Adds deleted_at column, seeds permissions, assigns to roles.
-- table_summary functions already handle deleted_at dynamically.
-- Run AFTER: 12_soft_delete_document_types_documents.sql
-- Applied as Supabase migration: soft_delete_designations_specializations_learning_goals
-- ============================================================


-- ============================================================
-- 1. ADD deleted_at TO designations, specializations, learning_goals
-- ============================================================

ALTER TABLE designations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE specializations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE learning_goals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;


-- ============================================================
-- 2. SEED permissions
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description, is_active)
VALUES
    ('designation',    'soft_delete', 'Soft Delete Designation',    'Move a designation to trash',          TRUE),
    ('designation',    'restore',     'Restore Designation',        'Restore a designation from trash',     TRUE),
    ('specialization', 'soft_delete', 'Soft Delete Specialization', 'Move a specialization to trash',      TRUE),
    ('specialization', 'restore',     'Restore Specialization',     'Restore a specialization from trash', TRUE),
    ('learning_goal',  'soft_delete', 'Soft Delete Learning Goal',  'Move a learning goal to trash',       TRUE),
    ('learning_goal',  'restore',     'Restore Learning Goal',      'Restore a learning goal from trash',  TRUE)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 3. ASSIGN to super_admin and admin roles
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('super_admin', 'admin')
  AND p.resource IN ('designation', 'specialization', 'learning_goal')
  AND p.action IN ('soft_delete', 'restore')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 4. SYNC table_summary
-- ============================================================

SELECT udf_sync_table_summary('designations');
SELECT udf_sync_table_summary('specializations');
SELECT udf_sync_table_summary('learning_goals');
