-- ============================================================
-- 40_notifications.sql
-- Notification System: notifications, notification_preferences,
-- email_templates
-- ============================================================

-- ── 1. CREATE notifications TABLE ───────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id),
  notification_type VARCHAR(50) NOT NULL,
  title             VARCHAR(255) NOT NULL,
  message           TEXT,
  channel           VARCHAR(20) NOT NULL DEFAULT 'in_app'
                      CHECK (channel IN ('in_app', 'email', 'sms')),
  delivery_status   VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed')),
  is_read           BOOLEAN NOT NULL DEFAULT false,
  read_at           TIMESTAMPTZ,
  reference_type    VARCHAR(50),
  reference_id      BIGINT,
  metadata          JSONB DEFAULT '{}'::jsonb,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_by        BIGINT,
  updated_by        BIGINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications (notification_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, is_read) WHERE deleted_at IS NULL AND is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_ref ON notifications (reference_type, reference_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC) WHERE deleted_at IS NULL;

CREATE OR REPLACE TRIGGER set_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_all ON notifications FOR ALL USING (true) WITH CHECK (true);


-- ── 2. CREATE notification_preferences TABLE ────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id),
  notification_type VARCHAR(50) NOT NULL,
  email_enabled     BOOLEAN NOT NULL DEFAULT true,
  sms_enabled       BOOLEAN NOT NULL DEFAULT false,
  in_app_enabled    BOOLEAN NOT NULL DEFAULT true,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences (user_id);

CREATE OR REPLACE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_all ON notification_preferences FOR ALL USING (true) WITH CHECK (true);


-- ── 3. CREATE email_templates TABLE ─────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id                  BIGSERIAL PRIMARY KEY,
  template_key        VARCHAR(100) NOT NULL UNIQUE,
  template_name       VARCHAR(255) NOT NULL,
  brevo_template_id   INTEGER,
  subject             VARCHAR(500),
  html_body           TEXT,
  text_body           TEXT,
  variables           JSONB DEFAULT '[]'::jsonb,
  notification_type   VARCHAR(50),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          BIGINT,
  updated_by          BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates (template_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates (notification_type) WHERE deleted_at IS NULL;

CREATE OR REPLACE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_templates_all ON email_templates FOR ALL USING (true) WITH CHECK (true);


-- ── 4. SEED default email_templates ─────────────────────────
INSERT INTO email_templates (template_key, template_name, notification_type, subject, variables) VALUES
  ('enrollment_confirmed',  'Enrollment Confirmation',  'enrollment_confirmed',
    'Welcome to {{course_name}} — Your enrollment is confirmed!',
    '["student_name", "course_name", "enrolled_at"]'::jsonb),
  ('payment_received',      'Payment Receipt',          'payment_received',
    'Payment of ₹{{amount}} received — Order #{{order_id}}',
    '["student_name", "amount", "order_id", "payment_method"]'::jsonb),
  ('refund_processed',      'Refund Processed',         'refund_processed',
    'Refund of ₹{{amount}} processed — Order #{{order_id}}',
    '["student_name", "amount", "order_id", "refund_reason"]'::jsonb),
  ('new_content_published', 'New Content Available',    'new_content',
    'New content published in {{course_name}}',
    '["student_name", "course_name", "content_title"]'::jsonb),
  ('course_reminder',       'Course Reminder',          'reminder',
    'Don''t forget to continue learning {{course_name}}!',
    '["student_name", "course_name", "progress_percent"]'::jsonb),
  ('welcome_student',       'Welcome to GUM',           'welcome',
    'Welcome to GUM, {{student_name}}!',
    '["student_name"]'::jsonb),
  ('earning_received',      'New Earning',              'earning_received',
    'You earned ₹{{amount}} from {{course_name}}',
    '["instructor_name", "amount", "course_name", "student_name"]'::jsonb),
  ('payout_approved',       'Payout Approved',          'payout_approved',
    'Your payout request of ₹{{amount}} has been approved',
    '["instructor_name", "amount", "request_id"]'::jsonb),
  ('payout_processed',      'Payout Processed',         'payout_processed',
    'Payout of ₹{{amount}} has been transferred',
    '["instructor_name", "amount", "payment_reference", "payment_method"]'::jsonb),
  ('payout_rejected',       'Payout Request Rejected',  'payout_rejected',
    'Your payout request of ₹{{amount}} was not approved',
    '["instructor_name", "amount", "rejection_reason"]'::jsonb),
  ('review_received',       'New Review',               'review_received',
    'You received a new {{rating}}-star review on {{course_name}}',
    '["instructor_name", "rating", "course_name", "reviewer_name"]'::jsonb),
  ('certificate_issued',    'Certificate Issued',       'certificate_issued',
    'Congratulations! Your certificate for {{course_name}} is ready',
    '["student_name", "course_name", "certificate_id"]'::jsonb)
ON CONFLICT (template_key) DO NOTHING;


-- ── 5. SEED permissions (actual schema: resource, action, display_name, description) ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('notification', 'create', 'Create Notification', 'Create/send notifications'),
  ('notification', 'read', 'Read Notification', 'View all notifications'),
  ('notification', 'update', 'Update Notification', 'Edit notification status'),
  ('notification', 'delete', 'Delete Notification', 'Delete notifications'),
  ('notification', 'soft_delete', 'Soft Delete Notification', 'Soft-delete notifications'),
  ('notification', 'restore', 'Restore Notification', 'Restore soft-deleted notifications'),
  ('email_template', 'create', 'Create Email Template', 'Create email templates'),
  ('email_template', 'read', 'Read Email Template', 'View email templates'),
  ('email_template', 'update', 'Update Email Template', 'Edit email templates'),
  ('email_template', 'delete', 'Delete Email Template', 'Delete email templates'),
  ('email_template', 'soft_delete', 'Soft Delete Email Template', 'Soft-delete email templates'),
  ('email_template', 'restore', 'Restore Email Template', 'Restore soft-deleted email templates'),
  ('notification_preference', 'read', 'Read Notification Preference', 'View user notification preferences'),
  ('notification_preference', 'update', 'Update Notification Preference', 'Edit user notification preferences')
ON CONFLICT DO NOTHING;

-- Grant all notification permissions to Super Admin role (id=1)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE resource IN ('notification', 'email_template', 'notification_preference')
ON CONFLICT DO NOTHING;


-- ── 6. UPDATE table_summary (actual schema: table_name, is_active, is_inactive, is_deleted) ──
INSERT INTO table_summary (table_name, is_active, is_inactive, is_deleted)
VALUES
  ('notifications', 0, 0, 0),
  ('notification_preferences', 0, 0, 0),
  ('email_templates', 0, 0, 0)
ON CONFLICT (table_name) DO NOTHING;


-- ── 7. UPDATE activity_log constraint ───────────────────────
ALTER TABLE admin_activity_log DROP CONSTRAINT IF EXISTS admin_activity_log_action_check;
ALTER TABLE admin_activity_log ADD CONSTRAINT admin_activity_log_action_check CHECK (
  action::text = ANY (ARRAY[
    'account_locked','account_reactivated','account_suspended',
    'ai_bulk_content_generated','ai_bulk_sub_category_translation_generated','ai_bulk_translation_generated',
    'ai_content_generated','ai_master_data_updated','ai_resume_content_generated',
    'ai_sample_data_generated','ai_sub_category_content_generated','ai_translation_generated',
    'all_sessions_revoked',
    'assessment_created','assessment_deleted','assessment_exercise_created','assessment_exercise_created_full',
    'assessment_exercise_deleted','assessment_exercise_restored','assessment_exercise_soft_deleted',
    'assessment_exercise_translation_created','assessment_exercise_translation_deleted',
    'assessment_exercise_translation_restored','assessment_exercise_translation_soft_deleted',
    'assessment_exercise_translation_updated','assessment_exercise_updated','assessment_exercise_updated_full',
    'assessment_restored','assessment_soft_deleted','assessment_updated',
    'badge_created','badge_deleted','badge_restored','badge_soft_deleted','badge_updated',
    'batch_translation_created','batch_translation_deleted','batch_translation_restored',
    'batch_translation_soft_deleted','batch_translation_updated',
    'branch_created','branch_deleted','branch_department_created','branch_department_deleted',
    'branch_department_restored','branch_department_soft_deleted','branch_department_updated',
    'branch_restored','branch_soft_deleted','branch_updated',
    'bundle_course_created','bundle_course_deleted','bundle_course_restored',
    'bundle_course_soft_deleted','bundle_course_updated',
    'bundle_created','bundle_deleted','bundle_restored','bundle_soft_deleted',
    'bundle_translation_created','bundle_translation_deleted','bundle_translation_restored',
    'bundle_translation_soft_deleted','bundle_translation_updated','bundle_updated',
    'capstone_auto_translated','capstone_project_created','capstone_project_created_full',
    'capstone_project_deleted','capstone_project_restored','capstone_project_soft_deleted',
    'capstone_project_solution_created','capstone_project_solution_deleted',
    'capstone_project_solution_restored','capstone_project_solution_soft_deleted',
    'capstone_project_solution_updated','capstone_project_solutions_bulk_uploaded',
    'capstone_project_translation_created','capstone_project_translation_deleted',
    'capstone_project_translation_restored','capstone_project_translation_soft_deleted',
    'capstone_project_translation_updated','capstone_project_updated','capstone_project_updated_full',
    'cart_item_created','cart_item_updated','cart_item_soft_deleted','cart_item_restored',
    'cart_item_deleted','cart_cleared',
    'category_created','category_deleted','category_restored','category_soft_deleted',
    'category_translation_created','category_translation_deleted','category_translation_restored',
    'category_translation_soft_deleted','category_translation_updated','category_updated',
    'cdn_fix_orphaned_subtopic_folders','cdn_reconcile_folder_names','cdn_scaffold_created',
    'certificate_template_created','certificate_template_deleted','certificate_template_restored',
    'certificate_template_soft_deleted','certificate_template_updated',
    'certificate_issued','certificate_bulk_issued','certificate_revoked',
    'change_password_initiated',
    'chapter_created','chapter_deleted','chapter_restored','chapter_soft_deleted',
    'chapter_translation_created','chapter_translation_deleted','chapter_translation_restored',
    'chapter_translation_soft_deleted','chapter_translation_updated','chapter_updated',
    'city_created','city_deleted','city_restored','city_soft_deleted','city_updated',
    'clean_orphaned_collections','clean_orphaned_videos',
    'country_created','country_deleted','country_restored','country_soft_deleted','country_updated',
    'coupon_batch_created','coupon_batch_deleted','coupon_batch_restored','coupon_batch_soft_deleted','coupon_batch_updated',
    'coupon_bundle_created','coupon_bundle_deleted','coupon_bundle_restored','coupon_bundle_soft_deleted','coupon_bundle_updated',
    'coupon_course_created','coupon_course_deleted','coupon_course_restored','coupon_course_soft_deleted','coupon_course_updated',
    'coupon_created','coupon_deleted','coupon_restored','coupon_soft_deleted','coupon_updated',
    'coupon_webinar_created','coupon_webinar_deleted','coupon_webinar_restored','coupon_webinar_soft_deleted','coupon_webinar_updated',
    'course_batch_created','course_batch_deleted','course_batch_restored','course_batch_soft_deleted','course_batch_updated',
    'course_chapter_created','course_chapter_deleted','course_chapter_restored','course_chapter_soft_deleted',
    'course_chapter_topic_created','course_chapter_topic_deleted','course_chapter_topic_restored',
    'course_chapter_topic_soft_deleted','course_chapter_topic_updated','course_chapter_updated',
    'course_created','course_deleted','course_imported',
    'course_module_created','course_module_deleted','course_module_restored','course_module_soft_deleted',
    'course_module_subject_created','course_module_subject_deleted','course_module_subject_restored',
    'course_module_subject_soft_deleted','course_module_subject_updated',
    'course_module_translation_created','course_module_translation_deleted','course_module_translation_restored',
    'course_module_translation_soft_deleted','course_module_translation_updated','course_module_updated',
    'course_restored','course_soft_deleted',
    'course_sub_category_created','course_sub_category_deleted','course_sub_category_restored',
    'course_sub_category_soft_deleted','course_sub_category_updated',
    'course_translation_created','course_translation_deleted','course_translation_restored',
    'course_translation_soft_deleted','course_translation_updated','course_updated',
    'created',
    'department_created','department_deleted','department_restored','department_soft_deleted','department_updated',
    'desc_auto_generated','desc_auto_translated',
    'desc_question_created','desc_question_created_full','desc_question_deleted','desc_question_restored','desc_question_soft_deleted',
    'desc_question_translation_created','desc_question_translation_deleted','desc_question_translation_restored',
    'desc_question_translation_soft_deleted','desc_question_translation_updated',
    'desc_question_updated','desc_question_updated_full',
    'designation_created','designation_deleted','designation_restored','designation_soft_deleted','designation_updated',
    'document_created','document_deleted','document_restored','document_soft_deleted',
    'document_type_created','document_type_deleted','document_type_restored','document_type_soft_deleted','document_type_updated',
    'document_updated',
    'education_level_created','education_level_deleted','education_level_restored','education_level_soft_deleted','education_level_updated',
    'email_updated',
    -- ── NEW: Notifications ──
    'email_template_created','email_template_updated','email_template_soft_deleted',
    'email_template_restored','email_template_deleted',
    -- ── END NEW ──
    'employee_profile_created','employee_profile_deleted','employee_profile_restored','employee_profile_soft_deleted','employee_profile_updated',
    'enrollment_created','enrollment_updated','enrollment_soft_deleted','enrollment_restored','enrollment_deleted',
    'enrollment_completed','enrollment_suspended','enrollment_cancelled',
    'enrollment_progress_created','enrollment_progress_updated','enrollment_progress_soft_deleted',
    'enrollment_progress_restored','enrollment_progress_deleted',
    'exercise_auto_translated',
    'instructor_profile_created','instructor_profile_deleted','instructor_profile_restored',
    'instructor_profile_soft_deleted','instructor_profile_updated',
    'instructor_promotion_approved','instructor_promotion_course_created','instructor_promotion_course_deleted',
    'instructor_promotion_course_restored','instructor_promotion_course_soft_deleted','instructor_promotion_course_updated',
    'instructor_promotion_created','instructor_promotion_deleted','instructor_promotion_rejected',
    'instructor_promotion_restored','instructor_promotion_soft_deleted','instructor_promotion_updated',
    'invoice_created','invoice_updated','invoice_soft_deleted','invoice_restored','invoice_deleted',
    'invoice_issued','invoice_cancelled',
    'language_created','language_deleted','language_restored','language_soft_deleted','language_updated',
    'learning_goal_created','learning_goal_deleted','learning_goal_restored','learning_goal_soft_deleted','learning_goal_updated',
    'login_failed','login_success','logout',
    'matching_auto_generated','matching_auto_translated',
    'matching_pair_created','matching_pair_deleted','matching_pair_restored','matching_pair_soft_deleted',
    'matching_pair_translation_created','matching_pair_translation_deleted','matching_pair_translation_restored',
    'matching_pair_translation_soft_deleted','matching_pair_translation_updated','matching_pair_updated',
    'matching_question_created','matching_question_created_full','matching_question_deleted','matching_question_restored','matching_question_soft_deleted',
    'matching_question_translation_created','matching_question_translation_deleted','matching_question_translation_restored',
    'matching_question_translation_soft_deleted','matching_question_translation_updated',
    'matching_question_updated','matching_question_updated_full',
    'material_tree_imported',
    'mcq_auto_generated','mcq_auto_translated',
    'mcq_option_created','mcq_option_deleted','mcq_option_restored','mcq_option_soft_deleted',
    'mcq_option_translation_created','mcq_option_translation_deleted','mcq_option_translation_restored',
    'mcq_option_translation_soft_deleted','mcq_option_translation_updated','mcq_option_updated',
    'mcq_question_created','mcq_question_created_full','mcq_question_deleted','mcq_question_restored','mcq_question_soft_deleted',
    'mcq_question_translation_created','mcq_question_translation_deleted','mcq_question_translation_restored',
    'mcq_question_translation_soft_deleted','mcq_question_translation_updated',
    'mcq_question_updated','mcq_question_updated_full',
    'media_deleted','media_uploaded',
    'mini_project_auto_translated','mini_project_created','mini_project_created_full',
    'mini_project_deleted','mini_project_restored','mini_project_soft_deleted',
    'mini_project_solution_created','mini_project_solution_deleted','mini_project_solution_restored',
    'mini_project_solution_soft_deleted','mini_project_solution_updated','mini_project_solutions_bulk_uploaded',
    'mini_project_translation_created','mini_project_translation_deleted','mini_project_translation_restored',
    'mini_project_translation_soft_deleted','mini_project_translation_updated',
    'mini_project_updated','mini_project_updated_full',
    'mobile_updated',
    -- ── NEW: Notifications ──
    'notification_created','notification_read','notification_read_all','notification_deleted',
    'notification_preference_updated',
    -- ── END NEW ──
    'order_created','order_updated','order_soft_deleted','order_restored','order_deleted',
    'order_cancelled','order_confirmed',
    'order_item_created','order_item_updated','order_item_soft_deleted','order_item_restored','order_item_deleted',
    'ordering_auto_generated','ordering_auto_translated',
    'ordering_item_created','ordering_item_deleted','ordering_item_restored','ordering_item_soft_deleted',
    'ordering_item_translation_created','ordering_item_translation_deleted','ordering_item_translation_restored',
    'ordering_item_translation_soft_deleted','ordering_item_translation_updated','ordering_item_updated',
    'ordering_question_created','ordering_question_created_full','ordering_question_deleted','ordering_question_restored','ordering_question_soft_deleted',
    'ordering_question_translation_created','ordering_question_translation_deleted','ordering_question_translation_restored',
    'ordering_question_translation_soft_deleted','ordering_question_translation_updated',
    'ordering_question_updated','ordering_question_updated_full',
    'otp_resent','otp_sent_email','otp_sent_sms',
    'ow_auto_generated','ow_auto_translated',
    'ow_question_created','ow_question_created_full','ow_question_deleted','ow_question_restored','ow_question_soft_deleted',
    'ow_question_translation_created','ow_question_translation_deleted','ow_question_translation_restored',
    'ow_question_translation_soft_deleted','ow_question_translation_updated',
    'ow_question_updated','ow_question_updated_full',
    'ow_synonym_created','ow_synonym_deleted','ow_synonym_restored','ow_synonym_soft_deleted',
    'ow_synonym_translation_created','ow_synonym_translation_deleted','ow_synonym_translation_restored',
    'ow_synonym_translation_soft_deleted','ow_synonym_translation_updated','ow_synonym_updated',
    'page_reverse_translated','page_translated',
    'password_changed','password_reset_requested',
    'payment_created','payment_updated','payment_soft_deleted','payment_restored','payment_deleted',
    'payment_captured','payment_refunded','payment_failed',
    'permission_granted','permission_revoked',
    'referral_code_created','referral_code_deleted','referral_code_restored','referral_code_soft_deleted','referral_code_updated',
    'referral_reward_created','referral_reward_deleted','referral_reward_restored','referral_reward_soft_deleted','referral_reward_updated',
    'referral_usage_created','referral_usage_deleted','referral_usage_restored','referral_usage_soft_deleted','referral_usage_updated',
    'refund_created','refund_updated','refund_soft_deleted','refund_restored','refund_deleted',
    'refund_approved','refund_rejected','refund_processed','refund_completed',
    'register_completed','register_initiated',
    'review_created','review_updated','review_soft_deleted','review_restored','review_deleted',
    'review_status_changed','review_ratings_recalculated',
    'review_helpfulness_created','review_helpfulness_deleted',
    'role_assigned','role_created','role_deleted','role_restored','role_revoked','role_soft_deleted','role_updated',
    'skill_created','skill_deleted','skill_restored','skill_soft_deleted','skill_updated',
    'skipped',
    'social_media_created','social_media_deleted','social_media_restored','social_media_soft_deleted','social_media_updated',
    'specialization_created','specialization_deleted','specialization_restored','specialization_soft_deleted','specialization_updated',
    'state_created','state_deleted','state_restored','state_soft_deleted','state_updated',
    'student_profile_created','student_profile_deleted','student_profile_restored','student_profile_soft_deleted','student_profile_updated',
    'sub_category_created','sub_category_deleted','sub_category_restored','sub_category_soft_deleted',
    'sub_category_translation_created','sub_category_translation_deleted','sub_category_translation_restored',
    'sub_category_translation_soft_deleted','sub_category_translation_updated','sub_category_updated',
    'sub_topic_created','sub_topic_deleted','sub_topic_restored','sub_topic_soft_deleted',
    'sub_topic_translation_created','sub_topic_translation_deleted','sub_topic_translation_restored',
    'sub_topic_translation_soft_deleted','sub_topic_translation_updated','sub_topic_updated',
    'subject_created','subject_deleted','subject_restored','subject_soft_deleted',
    'subject_translation_created','subject_translation_deleted','subject_translation_restored',
    'subject_translation_soft_deleted','subject_translation_updated','subject_updated',
    'token_refreshed',
    'topic_created','topic_deleted','topic_restored','topic_soft_deleted',
    'topic_translation_created','topic_translation_deleted','topic_translation_restored',
    'topic_translation_soft_deleted','topic_translation_updated','topic_updated',
    'transaction_created','transaction_updated','transaction_soft_deleted','transaction_restored','transaction_deleted',
    'update_email_initiated','update_mobile_initiated',
    'user_badge_awarded','user_badge_removed',
    'user_created','user_deleted',
    'user_document_created','user_document_deleted','user_document_restored','user_document_soft_deleted','user_document_updated',
    'user_education_created','user_education_deleted','user_education_restored','user_education_soft_deleted','user_education_updated',
    'user_experience_created','user_experience_deleted','user_experience_restored','user_experience_soft_deleted','user_experience_updated',
    'user_language_created','user_language_deleted','user_language_restored','user_language_soft_deleted','user_language_updated',
    'user_profile_created','user_profile_deleted','user_profile_restored','user_profile_soft_deleted','user_profile_updated',
    'user_project_created','user_project_deleted','user_project_restored','user_project_soft_deleted','user_project_updated',
    'user_reactivated','user_restored',
    'user_skill_created','user_skill_deleted','user_skill_restored','user_skill_soft_deleted','user_skill_updated',
    'user_social_media_created','user_social_media_deleted','user_social_media_restored','user_social_media_soft_deleted','user_social_media_updated',
    'user_soft_deleted','user_suspended','user_updated',
    'video_status_check',
    'webinar_created','webinar_deleted','webinar_restored','webinar_soft_deleted',
    'webinar_translation_created','webinar_translation_deleted','webinar_translation_restored',
    'webinar_translation_soft_deleted','webinar_translation_updated','webinar_updated',
    'wishlist_created','wishlist_updated','wishlist_soft_deleted','wishlist_restored','wishlist_deleted','wishlist_moved_to_cart',
    'youtube_description_deleted','youtube_description_generated','youtube_description_updated','youtube_descriptions_bulk_deleted'
  ])
);

-- ── DONE ─────────────────────────────────────────────────────
