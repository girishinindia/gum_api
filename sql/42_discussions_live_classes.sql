-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ============================================================
-- 42_discussions_live_classes.sql
-- Discussion & Q&A Forum + Live Classes & Scheduling
-- Tables: discussion_threads, discussion_replies,
--         live_sessions, session_attendance, session_recordings
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- PART A: DISCUSSION & Q&A FORUM
-- ══════════════════════════════════════════════════════════════

-- ── 1. CREATE discussion_threads TABLE ─────────────────────
CREATE TABLE IF NOT EXISTS discussion_threads (
  id                  BIGSERIAL PRIMARY KEY,
  title               VARCHAR(500) NOT NULL,
  body                TEXT,
  item_type           VARCHAR(20) NOT NULL
                        CHECK (item_type IN ('course', 'bundle', 'batch', 'webinar', 'lesson')),
  item_id             BIGINT NOT NULL,
  author_id           BIGINT NOT NULL REFERENCES users(id),
  thread_status       VARCHAR(20) NOT NULL DEFAULT 'open'
                        CHECK (thread_status IN ('open', 'closed', 'resolved', 'pinned')),
  is_pinned           BOOLEAN NOT NULL DEFAULT false,
  is_answered          BOOLEAN NOT NULL DEFAULT false,
  reply_count         INT NOT NULL DEFAULT 0,
  last_reply_at       TIMESTAMPTZ,
  last_reply_by       BIGINT REFERENCES users(id),
  upvote_count        INT NOT NULL DEFAULT 0,
  view_count          INT NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_discussion_threads_item
  ON discussion_threads(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_author
  ON discussion_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_status
  ON discussion_threads(thread_status);

-- Trigger
CREATE TRIGGER set_discussion_threads_updated_at
  BEFORE UPDATE ON discussion_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE discussion_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY discussion_threads_all ON discussion_threads
  FOR ALL USING (true) WITH CHECK (true);


-- ── 2. CREATE discussion_replies TABLE ─────────────────────
CREATE TABLE IF NOT EXISTS discussion_replies (
  id                  BIGSERIAL PRIMARY KEY,
  thread_id           BIGINT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  parent_reply_id     BIGINT REFERENCES discussion_replies(id) ON DELETE CASCADE,
  author_id           BIGINT NOT NULL REFERENCES users(id),
  body                TEXT NOT NULL,
  is_accepted_answer  BOOLEAN NOT NULL DEFAULT false,
  upvote_count        INT NOT NULL DEFAULT 0,
  is_instructor_reply BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_discussion_replies_thread
  ON discussion_replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_parent
  ON discussion_replies(parent_reply_id);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_author
  ON discussion_replies(author_id);

-- Trigger
CREATE TRIGGER set_discussion_replies_updated_at
  BEFORE UPDATE ON discussion_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE discussion_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY discussion_replies_all ON discussion_replies
  FOR ALL USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- PART B: LIVE CLASSES & SCHEDULING
-- ══════════════════════════════════════════════════════════════

-- ── 3. CREATE live_sessions TABLE ──────────────────────────
CREATE TABLE IF NOT EXISTS live_sessions (
  id                  BIGSERIAL PRIMARY KEY,
  title               VARCHAR(500) NOT NULL,
  description         TEXT,
  item_type           VARCHAR(20) NOT NULL
                        CHECK (item_type IN ('course', 'batch', 'webinar')),
  item_id             BIGINT NOT NULL,
  instructor_id       BIGINT NOT NULL REFERENCES users(id),
  session_status      VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                        CHECK (session_status IN ('scheduled', 'live', 'completed', 'cancelled', 'rescheduled')),
  scheduled_at        TIMESTAMPTZ NOT NULL,
  duration_minutes    INT NOT NULL DEFAULT 60,
  ended_at            TIMESTAMPTZ,
  meeting_platform    VARCHAR(50) DEFAULT 'zoom',
  meeting_url         TEXT,
  meeting_id          VARCHAR(200),
  meeting_password    VARCHAR(100),
  max_attendees       INT,
  is_recurring        BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule     JSONB,
  parent_session_id   BIGINT REFERENCES live_sessions(id),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_item
  ON live_sessions(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_instructor
  ON live_sessions(instructor_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status
  ON live_sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled
  ON live_sessions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_live_sessions_parent
  ON live_sessions(parent_session_id);

-- Trigger
CREATE TRIGGER set_live_sessions_updated_at
  BEFORE UPDATE ON live_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY live_sessions_all ON live_sessions
  FOR ALL USING (true) WITH CHECK (true);


-- ── 4. CREATE session_attendance TABLE ─────────────────────
CREATE TABLE IF NOT EXISTS session_attendance (
  id                  BIGSERIAL PRIMARY KEY,
  session_id          BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id             BIGINT NOT NULL REFERENCES users(id),
  attendance_status   VARCHAR(20) NOT NULL DEFAULT 'registered'
                        CHECK (attendance_status IN ('registered', 'attended', 'absent', 'late', 'left_early')),
  joined_at           TIMESTAMPTZ,
  left_at             TIMESTAMPTZ,
  duration_attended   INT DEFAULT 0,
  feedback            TEXT,
  rating              SMALLINT CHECK (rating >= 1 AND rating <= 5),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_attendance_session
  ON session_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_user
  ON session_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_status
  ON session_attendance(attendance_status);

-- Trigger
CREATE TRIGGER set_session_attendance_updated_at
  BEFORE UPDATE ON session_attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE session_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_attendance_all ON session_attendance
  FOR ALL USING (true) WITH CHECK (true);


-- ── 5. CREATE session_recordings TABLE ─────────────────────
CREATE TABLE IF NOT EXISTS session_recordings (
  id                  BIGSERIAL PRIMARY KEY,
  session_id          BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  title               VARCHAR(500),
  recording_url       TEXT,
  bunny_video_id      VARCHAR(200),
  duration_seconds    INT,
  file_size_bytes     BIGINT,
  recording_status    VARCHAR(20) NOT NULL DEFAULT 'processing'
                        CHECK (recording_status IN ('processing', 'ready', 'failed', 'deleted')),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_session_recordings_session
  ON session_recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_session_recordings_bunny
  ON session_recordings(bunny_video_id);
CREATE INDEX IF NOT EXISTS idx_session_recordings_status
  ON session_recordings(recording_status);

-- Trigger
CREATE TRIGGER set_session_recordings_updated_at
  BEFORE UPDATE ON session_recordings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE session_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_recordings_all ON session_recordings
  FOR ALL USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- PART C: PERMISSIONS
-- ══════════════════════════════════════════════════════════════

-- ── 6. Seed permissions ────────────────────────────────────
INSERT INTO permissions (resource, action, display_name, description) VALUES
  -- Discussion Threads
  ('discussion_thread', 'create', 'Create Discussion Thread', 'Create a new discussion thread'),
  ('discussion_thread', 'read', 'View Discussion Thread', 'View discussion threads'),
  ('discussion_thread', 'update', 'Update Discussion Thread', 'Update a discussion thread'),
  ('discussion_thread', 'soft_delete', 'Soft Delete Discussion Thread', 'Soft delete a discussion thread'),
  ('discussion_thread', 'restore', 'Restore Discussion Thread', 'Restore a soft-deleted discussion thread'),
  ('discussion_thread', 'delete', 'Delete Discussion Thread', 'Permanently delete a discussion thread'),
  -- Discussion Replies
  ('discussion_reply', 'create', 'Create Discussion Reply', 'Create a new discussion reply'),
  ('discussion_reply', 'read', 'View Discussion Reply', 'View discussion replies'),
  ('discussion_reply', 'update', 'Update Discussion Reply', 'Update a discussion reply'),
  ('discussion_reply', 'soft_delete', 'Soft Delete Discussion Reply', 'Soft delete a discussion reply'),
  ('discussion_reply', 'restore', 'Restore Discussion Reply', 'Restore a soft-deleted discussion reply'),
  ('discussion_reply', 'delete', 'Delete Discussion Reply', 'Permanently delete a discussion reply'),
  -- Live Sessions
  ('live_session', 'create', 'Create Live Session', 'Create a new live session'),
  ('live_session', 'read', 'View Live Session', 'View live sessions'),
  ('live_session', 'update', 'Update Live Session', 'Update a live session'),
  ('live_session', 'soft_delete', 'Soft Delete Live Session', 'Soft delete a live session'),
  ('live_session', 'restore', 'Restore Live Session', 'Restore a soft-deleted live session'),
  ('live_session', 'delete', 'Delete Live Session', 'Permanently delete a live session'),
  -- Session Attendance
  ('session_attendance', 'create', 'Create Session Attendance', 'Record session attendance'),
  ('session_attendance', 'read', 'View Session Attendance', 'View session attendance'),
  ('session_attendance', 'update', 'Update Session Attendance', 'Update session attendance'),
  ('session_attendance', 'soft_delete', 'Soft Delete Session Attendance', 'Soft delete attendance record'),
  ('session_attendance', 'restore', 'Restore Session Attendance', 'Restore soft-deleted attendance'),
  ('session_attendance', 'delete', 'Delete Session Attendance', 'Permanently delete attendance'),
  -- Session Recordings
  ('session_recording', 'create', 'Create Session Recording', 'Add a session recording'),
  ('session_recording', 'read', 'View Session Recording', 'View session recordings'),
  ('session_recording', 'update', 'Update Session Recording', 'Update a session recording'),
  ('session_recording', 'soft_delete', 'Soft Delete Session Recording', 'Soft delete a recording'),
  ('session_recording', 'restore', 'Restore Session Recording', 'Restore a soft-deleted recording'),
  ('session_recording', 'delete', 'Delete Session Recording', 'Permanently delete a recording')
ON CONFLICT DO NOTHING;

-- Grant all new permissions to super_admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions
WHERE resource IN ('discussion_thread','discussion_reply','live_session','session_attendance','session_recording')
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- PART D: TABLE SUMMARY
-- ══════════════════════════════════════════════════════════════

-- ── 7. Seed table_summary ──────────────────────────────────
INSERT INTO table_summary (table_name, is_active, is_inactive, is_deleted)
VALUES
  ('discussion_threads', 0, 0, 0),
  ('discussion_replies', 0, 0, 0),
  ('live_sessions', 0, 0, 0),
  ('session_attendance', 0, 0, 0),
  ('session_recordings', 0, 0, 0)
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- PART E: ACTIVITY LOG CONSTRAINT
-- ══════════════════════════════════════════════════════════════

-- ── 8. Update admin_activity_log constraint with new actions ──
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
    -- NEW: discussion actions
    'discussion_reply_created','discussion_reply_updated','discussion_reply_soft_deleted','discussion_reply_restored','discussion_reply_deleted',
    'discussion_reply_accepted',
    'discussion_thread_created','discussion_thread_updated','discussion_thread_soft_deleted','discussion_thread_restored','discussion_thread_deleted',
    'discussion_thread_closed','discussion_thread_resolved','discussion_thread_pinned',
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
    -- NEW: live session actions
    'live_session_created','live_session_updated','live_session_soft_deleted','live_session_restored','live_session_deleted',
    'live_session_started','live_session_ended','live_session_cancelled','live_session_rescheduled',
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
    -- NEW: session attendance actions
    'session_attendance_created','session_attendance_updated','session_attendance_soft_deleted','session_attendance_restored','session_attendance_deleted',
    'session_attendance_marked',
    -- NEW: session recording actions
    'session_recording_created','session_recording_updated','session_recording_soft_deleted','session_recording_restored','session_recording_deleted',
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