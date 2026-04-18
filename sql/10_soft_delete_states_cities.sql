-- ============================================================
-- 10_soft_delete_states_cities.sql
-- Soft Delete & Restore for States and Cities
-- Adds deleted_at column, seeds permissions, assigns to roles.
-- table_summary functions already handle deleted_at dynamically.
-- Run AFTER: 09_soft_delete_countries.sql
-- Applied as Supabase migration: soft_delete_states_cities
-- ============================================================


-- ============================================================
-- 1. ADD deleted_at TO states AND cities
-- ============================================================

ALTER TABLE states ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;


-- ============================================================
-- 2. SEED permissions for state and city soft_delete/restore
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description, is_active)
VALUES
    ('state', 'soft_delete', 'Soft Delete State',  'Move a state to trash (soft delete)', TRUE),
    ('state', 'restore',     'Restore State',      'Restore a state from trash',          TRUE),
    ('city',  'soft_delete', 'Soft Delete City',   'Move a city to trash (soft delete)',   TRUE),
    ('city',  'restore',     'Restore City',       'Restore a city from trash',            TRUE)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 3. ASSIGN to super_admin and admin roles
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('super_admin', 'admin')
  AND p.resource IN ('state', 'city')
  AND p.action IN ('soft_delete', 'restore')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 4. SYNC table_summary for both tables
-- ============================================================

SELECT udf_sync_table_summary('states');
SELECT udf_sync_table_summary('cities');
