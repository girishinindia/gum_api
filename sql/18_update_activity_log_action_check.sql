-- Migration 18: Update admin_activity_log action CHECK constraint
-- Adds soft_delete and restore actions for all modules

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
  'category_translation_created', 'category_translation_updated', 'category_translation_deleted',
  'sub_category_translation_created', 'sub_category_translation_updated', 'sub_category_translation_deleted',
  -- Branch management
  'branch_created', 'branch_updated', 'branch_deleted', 'branch_soft_deleted', 'branch_restored',
  'department_created', 'department_updated', 'department_deleted', 'department_soft_deleted', 'department_restored',
  'branch_department_created', 'branch_department_updated', 'branch_department_deleted', 'branch_department_soft_deleted', 'branch_department_restored',
  -- Media
  'media_uploaded', 'media_deleted'
]::text[]));
