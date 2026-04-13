-- ══════════════════════════════════════════════════════════════════════════════
-- FILE: phase-02-master-data-management/06_seed_permissions.sql
-- PURPOSE: Seed default permissions for every phase-02 master-data resource
--          and auto-assign to Super Admin (all) + Admin (all except delete).
-- ══════════════════════════════════════════════════════════════════════════════
-- Prerequisites (guaranteed by merge_sql.py execution order):
--   phase-01/03-permissions/01_table.sql                      → permissions table
--   phase-01/05-role-permissions/01_table.sql                 → role_permissions table
--   phase-01/12-auth/20_fn_auto_create_resource_permissions   → helper function
--   phase-02/01_states/01_table.sql                           → states table
--   phase-02/02_cities/01_table.sql                           → cities table
--   phase-02/03_skills/01_table.sql                           → skills table
--   phase-02/04_languages/01_table.sql                        → languages table
--   phase-02/05_education-levels/01_table.sql                 → education_levels table
--   phase-02/07-document-types/01_table.sql                   → document_types table
--   phase-02/08-documents/01_table.sql                        → documents table
--   phase-02/09-designations/01_table.sql                     → designations table
--   phase-02/10-specializations/01_table.sql                  → specializations table
--   phase-02/11-learning-goals/01_table.sql                   → learning_goals table
--   phase-02/12-social-medias/01_table.sql                    → social_medias table
--   phase-02/13-categories/01_table.sql                       → categories table
--   phase-02/14-sub-categories/01_table.sql                   → sub_categories table
-- ══════════════════════════════════════════════════════════════════════════════
-- Resources seeded here (permission codes follow resource.action convention):
--   1.  state             state.{create,read,update,delete,restore}
--   2.  city              city.{create,read,update,delete,restore}
--   3.  skill             skill.{create,read,update,delete,restore}
--   4.  language          language.{create,read,update,delete,restore}
--   5.  education_level   education_level.{create,read,update,delete,restore}
--   6.  document_type     document_type.{create,read,update,delete,restore}
--   7.  document          document.{create,read,update,delete,restore}
--   8.  designation       designation.{create,read,update,delete,restore}
--   9.  specialization    specialization.{create,read,update,delete,restore}
--   10. learning_goal     learning_goal.{create,read,update,delete,restore}
--   11. social_media      social_media.{create,read,update,delete,restore}
--   12. category          category.{create,read,update,delete,restore}
--   13. sub_category      sub_category.{create,read,update,delete,restore}
--
-- The helper `udf_auto_create_resource_permissions(resource, created_by,
--   include_own, start_order)` already handles both directives:
--     • Super Admin (role.level = 0) receives ALL generated permissions
--     • Admin       (role.level = 1) receives everything EXCEPT action='delete'
--
-- The `display_order` numbers (100..224) are chosen to sit above phase-01
-- numbering (audit_log ended at 51) with a clear gap per resource.
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. STATE MANAGEMENT (resource: state)
-- ══════════════════════════════════════════════════════════════════════════════
-- Standard CRUD + restore. No own-scope — admins manage reference data globally.
SELECT udf_auto_create_resource_permissions('state', 1, FALSE, 100);


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. CITY MANAGEMENT (resource: city)
-- ══════════════════════════════════════════════════════════════════════════════
SELECT udf_auto_create_resource_permissions('city', 1, FALSE, 110);


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. SKILL MANAGEMENT (resource: skill)
-- ══════════════════════════════════════════════════════════════════════════════
SELECT udf_auto_create_resource_permissions('skill', 1, FALSE, 120);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. LANGUAGE MANAGEMENT (resource: language)
-- ══════════════════════════════════════════════════════════════════════════════
SELECT udf_auto_create_resource_permissions('language', 1, FALSE, 130);


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. EDUCATION LEVEL MANAGEMENT (resource: education_level)
-- ══════════════════════════════════════════════════════════════════════════════
-- The resource key uses snake_case so it matches the DB table name and the
-- existing phase-01 convention (`audit_log`). The API exposes it at
-- `/api/v1/education-levels` (kebab-case path) while the permission code
-- remains `education_level.*` — the route layer is responsible for the mapping.
SELECT udf_auto_create_resource_permissions('education_level', 1, FALSE, 140);


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. DOCUMENT TYPE MANAGEMENT (resource: document_type)
-- ══════════════════════════════════════════════════════════════════════════════
-- Resource key is snake_case to match table name; API path is `/document-types`.
SELECT udf_auto_create_resource_permissions('document_type', 1, FALSE, 150);


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. DOCUMENT MANAGEMENT (resource: document)
-- ══════════════════════════════════════════════════════════════════════════════
SELECT udf_auto_create_resource_permissions('document', 1, FALSE, 160);


-- ══════════════════════════════════════════════════════════════════════════════
-- 8. DESIGNATION MANAGEMENT (resource: designation)
-- ══════════════════════════════════════════════════════════════════════════════
SELECT udf_auto_create_resource_permissions('designation', 1, FALSE, 170);


-- ══════════════════════════════════════════════════════════════════════════════
-- 9. SPECIALIZATION MANAGEMENT (resource: specialization)
-- ══════════════════════════════════════════════════════════════════════════════
-- Icons (PNG/JPEG → WebP, ≤100 KB) are managed through a dedicated upload
-- endpoint (`POST/DELETE /specializations/:id/icon`). Icon mutation still
-- requires `specialization.update` — no separate permission is minted.
SELECT udf_auto_create_resource_permissions('specialization', 1, FALSE, 180);


-- ══════════════════════════════════════════════════════════════════════════════
-- 10. LEARNING GOAL MANAGEMENT (resource: learning_goal)
-- ══════════════════════════════════════════════════════════════════════════════
-- Resource key is snake_case; API path is `/learning-goals`. Icons (PNG/JPEG →
-- WebP, ≤100 KB) flow through a dedicated upload endpoint
-- (`POST/DELETE /learning-goals/:id/icon`) — uploads still require
-- `learning_goal.update`, no separate permission is minted.
SELECT udf_auto_create_resource_permissions('learning_goal', 1, FALSE, 190);


-- ══════════════════════════════════════════════════════════════════════════════
-- 11. SOCIAL MEDIA MANAGEMENT (resource: social_media)
-- ══════════════════════════════════════════════════════════════════════════════
-- Resource key is snake_case; API path is `/social-medias`. Icons (PNG/JPEG →
-- WebP, ≤100 KB) flow through `POST/DELETE /social-medias/:id/icon` — still
-- gated by `social_media.update`, no separate permission is minted.
SELECT udf_auto_create_resource_permissions('social_media', 1, FALSE, 200);


-- ══════════════════════════════════════════════════════════════════════════════
-- 12. CATEGORY MANAGEMENT (resource: category)
-- ══════════════════════════════════════════════════════════════════════════════
-- Two-table module (categories + category_translations) exposed as a single
-- resource. Translation mutations are gated by `category.update`. Icons and
-- images (PNG/JPEG → WebP, ≤100 KB) flow through dedicated upload endpoints
-- (`POST/DELETE /categories/:id/icon` and `/categories/:id/image`), both
-- gated by `category.update`.
SELECT udf_auto_create_resource_permissions('category', 1, FALSE, 210);


-- ══════════════════════════════════════════════════════════════════════════════
-- 13. SUB-CATEGORY MANAGEMENT (resource: sub_category)
-- ══════════════════════════════════════════════════════════════════════════════
-- Resource key is snake_case; API path is `/sub-categories`. Two-table module
-- (sub_categories + sub_category_translations). Translation mutations are
-- gated by `sub_category.update`. Icons and images (PNG/JPEG → WebP, ≤100 KB)
-- flow through `POST/DELETE /sub-categories/:id/icon` and `/sub-categories/:id/image`,
-- both gated by `sub_category.update`.
SELECT udf_auto_create_resource_permissions('sub_category', 1, FALSE, 220);


-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (uncomment to run after migration)
-- ══════════════════════════════════════════════════════════════════════════════

-- Expected: 65 new rows (13 resources × 5 actions)
-- SELECT resource, COUNT(*) AS cnt
--   FROM permissions
--  WHERE resource IN (
--          'state', 'city', 'skill', 'language', 'education_level',
--          'document_type', 'document', 'designation', 'specialization',
--          'learning_goal', 'social_media', 'category', 'sub_category'
--        )
--    AND is_deleted = FALSE
--  GROUP BY resource
--  ORDER BY resource;

-- Super Admin should have all 65
-- SELECT COUNT(*)
--   FROM role_permissions rp
--   JOIN permissions p ON rp.permission_id = p.id
--   JOIN roles       r ON rp.role_id       = r.id
--  WHERE r.level = 0
--    AND p.resource IN (
--          'state', 'city', 'skill', 'language', 'education_level',
--          'document_type', 'document', 'designation', 'specialization',
--          'learning_goal', 'social_media', 'category', 'sub_category'
--        )
--    AND rp.is_deleted = FALSE;

-- Admin should have 52 (65 minus the 13 delete actions)
-- SELECT COUNT(*)
--   FROM role_permissions rp
--   JOIN permissions p ON rp.permission_id = p.id
--   JOIN roles       r ON rp.role_id       = r.id
--  WHERE r.level = 1
--    AND p.resource IN (
--          'state', 'city', 'skill', 'language', 'education_level',
--          'document_type', 'document', 'designation', 'specialization',
--          'learning_goal', 'social_media', 'category', 'sub_category'
--        )
--    AND rp.is_deleted = FALSE;

-- Admin MUST NOT have any phase-02 delete permissions
-- SELECT p.code
--   FROM role_permissions rp
--   JOIN permissions p ON rp.permission_id = p.id
--   JOIN roles       r ON rp.role_id       = r.id
--  WHERE r.level = 1
--    AND p.resource IN (
--          'state', 'city', 'skill', 'language', 'education_level',
--          'document_type', 'document', 'designation', 'specialization',
--          'learning_goal', 'social_media', 'category', 'sub_category'
--        )
--    AND p.action = 'delete'
--    AND rp.is_deleted = FALSE;
-- -- Expected: 0 rows

-- ══════════════════════════════════════════════════════════════════════════════
