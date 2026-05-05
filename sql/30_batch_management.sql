-- ═══════════════════════════════════════════════════════════════
--  30 – Batch Management: Permissions + Activity Log Actions
--  Seeds permissions for course_batches and batch_translations,
--  updates admin_activity_log_action_check constraint.
-- ═══════════════════════════════════════════════════════════════

-- ─── Permissions: course_batch ───
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('course_batch', 'create', 'Create Course Batch', 'Create course batch records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('course_batch', 'read', 'View Course Batches', 'View course batch records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('course_batch', 'update', 'Update Course Batch', 'Update course batch records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('course_batch', 'delete', 'Delete Course Batch', 'Permanently delete course batch records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('course_batch', 'soft_delete', 'Soft Delete Course Batch', 'Soft delete course batch records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('course_batch', 'restore', 'Restore Course Batch', 'Restore soft-deleted course batch records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('course_batch', 'activate', 'Activate Course Batch', 'Toggle active status of course batch records')
ON CONFLICT (resource, action) DO NOTHING;

-- ─── Permissions: batch_translation ───
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('batch_translation', 'create', 'Create Batch Translation', 'Create batch translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('batch_translation', 'read', 'View Batch Translations', 'View batch translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('batch_translation', 'update', 'Update Batch Translation', 'Update batch translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('batch_translation', 'delete', 'Delete Batch Translation', 'Permanently delete batch translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('batch_translation', 'soft_delete', 'Soft Delete Batch Translation', 'Soft delete batch translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('batch_translation', 'restore', 'Restore Batch Translation', 'Restore soft-deleted batch translation records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('batch_translation', 'activate', 'Activate Batch Translation', 'Toggle active status of batch translation records')
ON CONFLICT (resource, action) DO NOTHING;

-- ─── Grant all batch permissions to super_admin role ───
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'super_admin' AND p.resource IN ('course_batch', 'batch_translation')
ON CONFLICT DO NOTHING;

-- ─── Activity Log Constraint Update ───
ALTER TABLE admin_activity_log DROP CONSTRAINT IF EXISTS admin_activity_log_action_check;

ALTER TABLE admin_activity_log ADD CONSTRAINT admin_activity_log_action_check CHECK (action::text = ANY(ARRAY[
  -- Auth & sessions
  'session_revoked', 'all_sessions_revoked',
  -- Roles & permissions
  'role_created', 'role_updated', 'role_deleted', 'role_soft_deleted', 'role_restored',
  'role_assigned', 'role_revoked',
  'permission_granted', 'permission_denied', 'permission_revoked',
  -- Users
  'user_created', 'user_updated', 'user_deleted', 'user_soft_deleted', 'user_restored',
  'user_suspended', 'user_reactivated',
  -- Settings
  'settings_updated',
  -- Geography
  'country_created', 'country_updated', 'country_deleted', 'country_soft_deleted', 'country_restored', 'country_imported',
  'state_created', 'state_updated', 'state_deleted', 'state_soft_deleted', 'state_restored',
  'city_created', 'city_updated', 'city_deleted', 'city_soft_deleted', 'city_restored',
  -- Master data
  'skill_created', 'skill_updated', 'skill_deleted', 'skill_soft_deleted', 'skill_restored',
  'language_created', 'language_updated', 'language_deleted', 'language_soft_deleted', 'language_restored',
  'education_level_created', 'education_level_updated', 'education_level_deleted', 'education_level_soft_deleted', 'education_level_restored',
  'document_type_created', 'document_type_updated', 'document_type_deleted', 'document_type_soft_deleted', 'document_type_restored',
  'document_created', 'document_updated', 'document_deleted', 'document_soft_deleted', 'document_restored',
  'designation_created', 'designation_updated', 'designation_deleted', 'designation_soft_deleted', 'designation_restored',
  'specialization_created', 'specialization_updated', 'specialization_deleted', 'specialization_soft_deleted', 'specialization_restored',
  'learning_goal_created', 'learning_goal_updated', 'learning_goal_deleted', 'learning_goal_soft_deleted', 'learning_goal_restored',
  'social_media_created', 'social_media_updated', 'social_media_deleted', 'social_media_soft_deleted', 'social_media_restored',
  -- Categories
  'category_created', 'category_updated', 'category_deleted', 'category_soft_deleted', 'category_restored',
  'sub_category_created', 'sub_category_updated', 'sub_category_deleted', 'sub_category_soft_deleted', 'sub_category_restored',
  'category_translation_created', 'category_translation_updated', 'category_translation_deleted', 'category_translation_soft_deleted', 'category_translation_restored',
  'sub_category_translation_created', 'sub_category_translation_updated', 'sub_category_translation_deleted', 'sub_category_translation_soft_deleted', 'sub_category_translation_restored',
  -- Branch management
  'branch_created', 'branch_updated', 'branch_deleted', 'branch_soft_deleted', 'branch_restored',
  'department_created', 'department_updated', 'department_deleted', 'department_soft_deleted', 'department_restored',
  'branch_department_created', 'branch_department_updated', 'branch_department_deleted', 'branch_department_soft_deleted', 'branch_department_restored',
  -- Media
  'media_uploaded', 'media_deleted',
  -- User Profile (general)
  'user_profile_created', 'user_profile_updated', 'user_profile_deleted', 'user_profile_soft_deleted', 'user_profile_restored',
  -- Employee Profile
  'employee_profile_created', 'employee_profile_updated', 'employee_profile_deleted', 'employee_profile_soft_deleted', 'employee_profile_restored',
  -- Student Profile
  'student_profile_created', 'student_profile_updated', 'student_profile_deleted', 'student_profile_soft_deleted', 'student_profile_restored',
  -- Instructor Profile
  'instructor_profile_created', 'instructor_profile_updated', 'instructor_profile_deleted', 'instructor_profile_soft_deleted', 'instructor_profile_restored',
  -- User Education
  'user_education_created', 'user_education_updated', 'user_education_deleted', 'user_education_soft_deleted', 'user_education_restored',
  -- User Experience
  'user_experience_created', 'user_experience_updated', 'user_experience_deleted', 'user_experience_soft_deleted', 'user_experience_restored',
  -- User Social Media
  'user_social_media_created', 'user_social_media_updated', 'user_social_media_deleted', 'user_social_media_soft_deleted', 'user_social_media_restored',
  -- User Skills
  'user_skill_created', 'user_skill_updated', 'user_skill_deleted', 'user_skill_soft_deleted', 'user_skill_restored',
  -- User Languages
  'user_language_created', 'user_language_updated', 'user_language_deleted', 'user_language_soft_deleted', 'user_language_restored',
  -- User Documents
  'user_document_created', 'user_document_updated', 'user_document_deleted', 'user_document_soft_deleted', 'user_document_restored',
  -- User Projects
  'user_project_created', 'user_project_updated', 'user_project_deleted', 'user_project_soft_deleted', 'user_project_restored',
  -- Material Management
  'subject_created', 'subject_updated', 'subject_deleted', 'subject_soft_deleted', 'subject_restored',
  'chapter_created', 'chapter_updated', 'chapter_deleted', 'chapter_soft_deleted', 'chapter_restored',
  'topic_created', 'topic_updated', 'topic_deleted', 'topic_soft_deleted', 'topic_restored',
  'subject_translation_created', 'subject_translation_updated', 'subject_translation_deleted', 'subject_translation_soft_deleted', 'subject_translation_restored',
  'chapter_translation_created', 'chapter_translation_updated', 'chapter_translation_deleted', 'chapter_translation_soft_deleted', 'chapter_translation_restored',
  'topic_translation_created', 'topic_translation_updated', 'topic_translation_deleted', 'topic_translation_soft_deleted', 'topic_translation_restored',
  -- Sub-Topics
  'sub_topic_created', 'sub_topic_updated', 'sub_topic_deleted', 'sub_topic_soft_deleted', 'sub_topic_restored',
  'sub_topic_translation_created', 'sub_topic_translation_updated', 'sub_topic_translation_deleted', 'sub_topic_translation_soft_deleted', 'sub_topic_translation_restored',
  -- AI Generation
  'ai_content_generated', 'ai_translation_generated', 'ai_bulk_translation_generated',
  'ai_sub_category_content_generated', 'ai_sub_category_translation_generated', 'ai_bulk_sub_category_translation_generated',
  'ai_sample_data_generated', 'ai_master_data_updated', 'ai_resume_content_generated',
  -- Import & Auto-generation
  'material_tree_imported', 'auto_sub_topics_generated',
  -- Page Translation
  'page_translated', 'page_reverse_translated',
  -- YouTube Descriptions
  'youtube_description_generated', 'youtube_description_updated', 'youtube_description_deleted', 'youtube_descriptions_bulk_deleted',
  -- Assessments (generic)
  'assessment_created', 'assessment_updated', 'assessment_deleted', 'assessment_soft_deleted', 'assessment_restored',
  'assessment_translation_created', 'assessment_translation_updated', 'assessment_translation_deleted', 'assessment_translation_soft_deleted', 'assessment_translation_restored',
  'assessment_attachment_created', 'assessment_attachment_updated', 'assessment_attachment_deleted', 'assessment_attachment_soft_deleted', 'assessment_attachment_restored',
  'assessment_attachment_translation_created', 'assessment_attachment_translation_updated', 'assessment_attachment_translation_deleted', 'assessment_attachment_translation_soft_deleted', 'assessment_attachment_translation_restored',
  'assessment_solution_created', 'assessment_solution_updated', 'assessment_solution_deleted', 'assessment_solution_soft_deleted', 'assessment_solution_restored',
  'assessment_solution_translation_created', 'assessment_solution_translation_updated', 'assessment_solution_translation_deleted', 'assessment_solution_translation_soft_deleted', 'assessment_solution_translation_restored',
  -- Assessment Exercises (standalone module)
  'assessment_exercise_created', 'assessment_exercise_updated', 'assessment_exercise_deleted', 'assessment_exercise_soft_deleted', 'assessment_exercise_restored',
  'assessment_exercise_created_full', 'assessment_exercise_updated_full',
  'assessment_exercise_translation_created', 'assessment_exercise_translation_updated', 'assessment_exercise_translation_deleted', 'assessment_exercise_translation_soft_deleted', 'assessment_exercise_translation_restored',
  -- Mini Projects
  'mini_project_created', 'mini_project_updated', 'mini_project_deleted', 'mini_project_soft_deleted', 'mini_project_restored',
  'mini_project_created_full', 'mini_project_updated_full',
  'mini_project_translation_created', 'mini_project_translation_updated', 'mini_project_translation_deleted', 'mini_project_translation_soft_deleted', 'mini_project_translation_restored',
  'mini_project_solution_created', 'mini_project_solution_updated', 'mini_project_solution_deleted', 'mini_project_solution_soft_deleted', 'mini_project_solution_restored',
  -- Capstone Projects
  'capstone_project_created', 'capstone_project_updated', 'capstone_project_deleted', 'capstone_project_soft_deleted', 'capstone_project_restored',
  'capstone_project_created_full', 'capstone_project_updated_full',
  'capstone_project_translation_created', 'capstone_project_translation_updated', 'capstone_project_translation_deleted', 'capstone_project_translation_soft_deleted', 'capstone_project_translation_restored',
  'capstone_project_solution_created', 'capstone_project_solution_updated', 'capstone_project_solution_deleted', 'capstone_project_solution_soft_deleted', 'capstone_project_solution_restored',
  -- AI Auto-Translation for assessments
  'exercise_auto_translated', 'mini_project_auto_translated', 'capstone_auto_translated',
  -- Course Batches
  'course_batch_created', 'course_batch_updated', 'course_batch_deleted', 'course_batch_soft_deleted', 'course_batch_restored',
  -- Batch Translations
  'batch_translation_created', 'batch_translation_updated', 'batch_translation_deleted', 'batch_translation_soft_deleted', 'batch_translation_restored'
]::text[]));

-- ─── Table Summary ───
INSERT INTO table_summary (table_name, description) VALUES
  ('course_batches', 'Instructor-led course batches with scheduling, pricing, capacity, and meeting details'),
  ('batch_translations', 'Multi-language translations for course batches with full SEO, OG, Twitter, and structured data')
ON CONFLICT (table_name) DO NOTHING;
