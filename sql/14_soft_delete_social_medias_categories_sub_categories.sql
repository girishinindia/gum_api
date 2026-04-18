-- ============================================================
-- 14_soft_delete_social_medias_categories_sub_categories.sql
-- Soft Delete & Restore for Social Medias, Categories, Sub Categories
-- Adds deleted_at column, seeds permissions, assigns to roles.
-- table_summary functions already handle deleted_at dynamically.
-- Run AFTER: 13_soft_delete_designations_specializations_learning_goals.sql
-- Applied as Supabase migration: soft_delete_social_medias_categories_sub_categories
-- ============================================================


-- ============================================================
-- 1. ADD deleted_at TO social_medias, categories, sub_categories
-- ============================================================

ALTER TABLE social_medias ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE sub_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;


-- ============================================================
-- 2. SEED permissions
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description, is_active)
VALUES
    ('social_media',  'soft_delete', 'Soft Delete Social Media',  'Move a social media to trash',        TRUE),
    ('social_media',  'restore',     'Restore Social Media',      'Restore a social media from trash',   TRUE),
    ('category',      'soft_delete', 'Soft Delete Category',      'Move a category to trash',            TRUE),
    ('category',      'restore',     'Restore Category',          'Restore a category from trash',       TRUE),
    ('sub_category',  'soft_delete', 'Soft Delete Sub-Category',  'Move a sub-category to trash',        TRUE),
    ('sub_category',  'restore',     'Restore Sub-Category',      'Restore a sub-category from trash',   TRUE)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 3. ASSIGN to super_admin and admin roles
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('super_admin', 'admin')
  AND p.resource IN ('social_media', 'category', 'sub_category')
  AND p.action IN ('soft_delete', 'restore')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 4. SYNC table_summary
-- ============================================================

SELECT udf_sync_table_summary('social_medias');
SELECT udf_sync_table_summary('categories');
SELECT udf_sync_table_summary('sub_categories');
