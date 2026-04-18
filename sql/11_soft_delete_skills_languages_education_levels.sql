-- ============================================================
-- 11_soft_delete_skills_languages_education_levels.sql
-- Soft Delete & Restore for Skills, Languages, Education Levels
-- Adds deleted_at column, seeds permissions, assigns to roles.
-- table_summary functions already handle deleted_at dynamically.
-- Run AFTER: 10_soft_delete_states_cities.sql
-- Applied as Supabase migration: soft_delete_skills_languages_education_levels
-- ============================================================


-- ============================================================
-- 1. ADD deleted_at TO skills, languages, education_levels
-- ============================================================

ALTER TABLE skills ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE languages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE education_levels ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;


-- ============================================================
-- 2. SEED permissions
-- ============================================================

INSERT INTO permissions (resource, action, display_name, description, is_active)
VALUES
    ('skill',           'soft_delete', 'Soft Delete Skill',           'Move a skill to trash',                    TRUE),
    ('skill',           'restore',     'Restore Skill',               'Restore a skill from trash',               TRUE),
    ('language',        'soft_delete', 'Soft Delete Language',        'Move a language to trash',                 TRUE),
    ('language',        'restore',     'Restore Language',            'Restore a language from trash',            TRUE),
    ('education_level', 'soft_delete', 'Soft Delete Education Level', 'Move an education level to trash',         TRUE),
    ('education_level', 'restore',     'Restore Education Level',     'Restore an education level from trash',    TRUE)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 3. ASSIGN to super_admin and admin roles
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('super_admin', 'admin')
  AND p.resource IN ('skill', 'language', 'education_level')
  AND p.action IN ('soft_delete', 'restore')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 4. SYNC table_summary
-- ============================================================

SELECT udf_sync_table_summary('skills');
SELECT udf_sync_table_summary('languages');
SELECT udf_sync_table_summary('education_levels');
