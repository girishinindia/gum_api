-- ============================================================
-- 41_instructor_payouts.sql
-- Instructor Payouts (Revenue Sharing): instructor_earnings,
-- payout_requests, payout_settlements
-- ============================================================

-- ── 1. ALTER instructor_profiles: add earnings tracking columns ──
ALTER TABLE instructor_profiles
  ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid_out DECIMAL(12,2) NOT NULL DEFAULT 0;


-- ── 2. CREATE instructor_earnings TABLE ─────────────────────
CREATE TABLE IF NOT EXISTS instructor_earnings (
  id                  BIGSERIAL PRIMARY KEY,
  instructor_id       BIGINT NOT NULL REFERENCES users(id),
  order_id            BIGINT REFERENCES orders(id),
  order_item_id       BIGINT REFERENCES order_items(id),
  item_type           VARCHAR(20) NOT NULL
                        CHECK (item_type IN ('course', 'bundle', 'batch', 'webinar')),
  item_id             BIGINT NOT NULL,
  student_id          BIGINT REFERENCES users(id),
  order_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  platform_fee        DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst_amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  instructor_share    DECIMAL(5,2) NOT NULL DEFAULT 70.00,
  earning_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  earning_status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (earning_status IN ('pending', 'confirmed', 'paid', 'reversed')),
  confirmed_at        TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  reversed_at         TIMESTAMPTZ,
  reversal_reason     TEXT,
  payout_request_id   BIGINT,  -- FK added after payout_requests is created
  metadata            JSONB DEFAULT '{}'::jsonb,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          BIGINT,
  updated_by          BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_instructor_earnings_instructor
  ON instructor_earnings (instructor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_instructor_earnings_order
  ON instructor_earnings (order_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_instructor_earnings_status
  ON instructor_earnings (earning_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_instructor_earnings_item
  ON instructor_earnings (item_type, item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_instructor_earnings_payout
  ON instructor_earnings (payout_request_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_instructor_earnings_created
  ON instructor_earnings (created_at DESC) WHERE deleted_at IS NULL;

CREATE OR REPLACE TRIGGER set_instructor_earnings_updated_at
  BEFORE UPDATE ON instructor_earnings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE instructor_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY instructor_earnings_all ON instructor_earnings FOR ALL USING (true) WITH CHECK (true);


-- ── 3. CREATE payout_requests TABLE ─────────────────────────
CREATE TABLE IF NOT EXISTS payout_requests (
  id                  BIGSERIAL PRIMARY KEY,
  instructor_id       BIGINT NOT NULL REFERENCES users(id),
  request_number      VARCHAR(30) NOT NULL UNIQUE,
  requested_amount    DECIMAL(12,2) NOT NULL,
  approved_amount     DECIMAL(12,2),
  request_status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (request_status IN ('pending', 'approved', 'rejected', 'processing', 'completed', 'failed')),
  payment_method      VARCHAR(30) DEFAULT 'bank_transfer'
                        CHECK (payment_method IN ('bank_transfer', 'upi', 'razorpay', 'manual')),
  bank_details        JSONB DEFAULT '{}'::jsonb,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by         BIGINT REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT,
  rejection_reason    TEXT,
  earnings_from       TIMESTAMPTZ,
  earnings_to         TIMESTAMPTZ,
  total_orders        INTEGER DEFAULT 0,
  metadata            JSONB DEFAULT '{}'::jsonb,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          BIGINT,
  updated_by          BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_instructor
  ON payout_requests (instructor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payout_requests_status
  ON payout_requests (request_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payout_requests_created
  ON payout_requests (created_at DESC) WHERE deleted_at IS NULL;

CREATE OR REPLACE TRIGGER set_payout_requests_updated_at
  BEFORE UPDATE ON payout_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY payout_requests_all ON payout_requests FOR ALL USING (true) WITH CHECK (true);


-- ── 4. CREATE payout_settlements TABLE ──────────────────────
CREATE TABLE IF NOT EXISTS payout_settlements (
  id                  BIGSERIAL PRIMARY KEY,
  payout_request_id   BIGINT NOT NULL REFERENCES payout_requests(id),
  instructor_id       BIGINT NOT NULL REFERENCES users(id),
  settlement_number   VARCHAR(30) NOT NULL UNIQUE,
  settled_amount      DECIMAL(12,2) NOT NULL,
  payment_method      VARCHAR(30) DEFAULT 'bank_transfer'
                        CHECK (payment_method IN ('bank_transfer', 'upi', 'razorpay', 'manual')),
  transaction_reference VARCHAR(100),
  settlement_status   VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (settlement_status IN ('pending', 'processing', 'completed', 'failed')),
  settled_at          TIMESTAMPTZ,
  failure_reason      TEXT,
  bank_details        JSONB DEFAULT '{}'::jsonb,
  metadata            JSONB DEFAULT '{}'::jsonb,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          BIGINT,
  updated_by          BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payout_settlements_request
  ON payout_settlements (payout_request_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payout_settlements_instructor
  ON payout_settlements (instructor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payout_settlements_status
  ON payout_settlements (settlement_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payout_settlements_created
  ON payout_settlements (created_at DESC) WHERE deleted_at IS NULL;

CREATE OR REPLACE TRIGGER set_payout_settlements_updated_at
  BEFORE UPDATE ON payout_settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE payout_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY payout_settlements_all ON payout_settlements FOR ALL USING (true) WITH CHECK (true);


-- ── 5. Add FK from instructor_earnings.payout_request_id ────
ALTER TABLE instructor_earnings
  ADD CONSTRAINT fk_instructor_earnings_payout_request
  FOREIGN KEY (payout_request_id) REFERENCES payout_requests(id);


-- ── 6. Seed permissions (resource, action, display_name, description) ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  -- instructor_earning
  ('instructor_earning', 'create', 'Create Instructor Earning', 'Can create instructor earning records'),
  ('instructor_earning', 'read', 'Read Instructor Earning', 'Can view instructor earning records'),
  ('instructor_earning', 'update', 'Update Instructor Earning', 'Can update instructor earning records'),
  ('instructor_earning', 'delete', 'Delete Instructor Earning', 'Can permanently delete instructor earnings'),
  ('instructor_earning', 'soft_delete', 'Soft Delete Instructor Earning', 'Can soft-delete instructor earnings'),
  ('instructor_earning', 'restore', 'Restore Instructor Earning', 'Can restore soft-deleted instructor earnings'),
  -- payout_request
  ('payout_request', 'create', 'Create Payout Request', 'Can create payout requests'),
  ('payout_request', 'read', 'Read Payout Request', 'Can view payout requests'),
  ('payout_request', 'update', 'Update Payout Request', 'Can update payout requests'),
  ('payout_request', 'approve', 'Approve Payout Request', 'Can approve payout requests'),
  ('payout_request', 'reject', 'Reject Payout Request', 'Can reject payout requests'),
  ('payout_request', 'delete', 'Delete Payout Request', 'Can permanently delete payout requests'),
  ('payout_request', 'soft_delete', 'Soft Delete Payout Request', 'Can soft-delete payout requests'),
  ('payout_request', 'restore', 'Restore Payout Request', 'Can restore soft-deleted payout requests'),
  -- payout_settlement
  ('payout_settlement', 'create', 'Create Payout Settlement', 'Can create payout settlements'),
  ('payout_settlement', 'read', 'Read Payout Settlement', 'Can view payout settlements'),
  ('payout_settlement', 'update', 'Update Payout Settlement', 'Can update payout settlements'),
  ('payout_settlement', 'delete', 'Delete Payout Settlement', 'Can permanently delete payout settlements'),
  ('payout_settlement', 'soft_delete', 'Soft Delete Payout Settlement', 'Can soft-delete payout settlements'),
  ('payout_settlement', 'restore', 'Restore Payout Settlement', 'Can restore soft-deleted payout settlements')
ON CONFLICT DO NOTHING;


-- ── 7. Grant all payout permissions to Super Admin ──────────
INSERT INTO role_permissions (role_id, permission_id, granted_by)
SELECT 1, p.id, 1
FROM permissions p
WHERE p.resource IN ('instructor_earning', 'payout_request', 'payout_settlement')
ON CONFLICT DO NOTHING;


-- ── 8. Seed table_summary (table_name, is_active, is_inactive, is_deleted) ──
INSERT INTO table_summary (table_name, is_active, is_inactive, is_deleted) VALUES
  ('instructor_earnings', 0, 0, 0),
  ('payout_requests', 0, 0, 0),
  ('payout_settlements', 0, 0, 0)
ON CONFLICT DO NOTHING;


-- ── 9. Update admin_activity_log constraint with new actions ──
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
    'bundle_course_created','bundle_course_deleted','bundle_course_restored','bundle_course_soft_deleted','bundle_course_updated',
    'bundle_created','bundle_deleted','bundle_restored','bundle_soft_deleted',
    'bundle_translation_created','bundle_translation_deleted','bundle_translation_restored',
    'bundle_translation_soft_deleted','bundle_translation_updated','bundle_updated',
    'capstone_auto_translated','capstone_project_created','capstone_project_created_full',
    'capstone_project_deleted','capstone_project_restored','capstone_project_soft_deleted',
    'capstone_project_solution_created','capstone_project_solution_deleted','capstone_project_solution_restored',
    'capstone_project_solution_soft_deleted','capstone_project_solution_updated','capstone_project_solutions_bulk_uploaded',
    'capstone_project_translation_created','capstone_project_translation_deleted',
    'capstone_project_translation_restored','capstone_project_translation_soft_deleted',
    'capstone_project_translation_updated','capstone_project_updated','capstone_project_updated_full',
    'cart_item_created','cart_item_updated','cart_item_soft_deleted','cart_item_restored','cart_item_deleted','cart_cleared',
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
    'email_template_created','email_template_updated','email_template_soft_deleted','email_template_restored','email_template_deleted',
    'employee_profile_created','employee_profile_deleted','employee_profile_restored','employee_profile_soft_deleted','employee_profile_updated',
    'enrollment_created','enrollment_updated','enrollment_soft_deleted','enrollment_restored','enrollment_deleted',
    'enrollment_completed','enrollment_suspended','enrollment_cancelled',
    'enrollment_progress_created','enrollment_progress_updated','enrollment_progress_soft_deleted',
    'enrollment_progress_restored','enrollment_progress_deleted',
    'exercise_auto_translated',
    -- NEW: instructor earnings actions
    'instructor_earning_created','instructor_earning_updated','instructor_earning_reversed',
    'instructor_earning_confirmed','instructor_earning_soft_deleted','instructor_earning_restored','instructor_earning_deleted',
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
    'notification_created','notification_read','notification_read_all','notification_deleted','notification_preference_updated',
    'order_created','order_updated','order_soft_deleted','order_restored','order_deleted','order_cancelled','order_confirmed',
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
    -- NEW: payout actions
    'payout_request_created','payout_request_updated','payout_request_approved','payout_request_rejected',
    'payout_request_soft_deleted','payout_request_restored','payout_request_deleted',
    'payout_settlement_created','payout_settlement_updated','payout_settlement_completed','payout_settlement_failed',
    'payout_settlement_soft_deleted','payout_settlement_restored','payout_settlement_deleted',
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
