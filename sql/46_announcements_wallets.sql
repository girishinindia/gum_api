-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ══════════════════════════════════════════════════════════════
-- MIGRATION 46: Announcements & Wallets
-- ══════════════════════════════════════════════════════════════
-- Tables: announcements, announcement_reads, wallets, wallet_transactions
-- Run AFTER: 45_chat_system.sql
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 1. ANNOUNCEMENTS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS announcements (
  id              BIGSERIAL PRIMARY KEY,
  title           VARCHAR(255) NOT NULL,
  content         TEXT NOT NULL,
  announcement_type VARCHAR(20) NOT NULL DEFAULT 'info'
                    CHECK (announcement_type IN ('info', 'warning', 'urgent', 'event')),
  target_scope    VARCHAR(30) NOT NULL DEFAULT 'all'
                    CHECK (target_scope IN ('all', 'category', 'sub_category', 'course', 'batch', 'webinar', 'instructors', 'students', 'custom')),
  target_id       BIGINT,
  target_name     VARCHAR(255),
  target_audience VARCHAR(20) NOT NULL DEFAULT 'all'
                    CHECK (target_audience IN ('all', 'students', 'instructors')),
  priority        INT NOT NULL DEFAULT 0,
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  publish_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  channels        TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'expired', 'archived')),
  sent_count      INT NOT NULL DEFAULT 0,
  published_at    TIMESTAMPTZ,
  published_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements (announcement_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_scope ON announcements (target_scope) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_target ON announcements (target_scope, target_id) WHERE target_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_publish_at ON announcements (publish_at) WHERE status = 'draft' AND publish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_expires_at ON announcements (expires_at) WHERE status = 'published' AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements (is_pinned, priority DESC) WHERE is_pinned = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON announcements (created_by) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 2. ANNOUNCEMENT READS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS announcement_reads (
  id              BIGSERIAL PRIMARY KEY,
  announcement_id BIGINT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_dismissed    BOOLEAN NOT NULL DEFAULT false,
  dismissed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement ON announcement_reads (announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON announcement_reads (user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_dismissed ON announcement_reads (announcement_id) WHERE is_dismissed = false;

-- ══════════════════════════════════════════════════════════════
-- 3. WALLETS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallets (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance         DECIMAL(12,2) NOT NULL DEFAULT 0.00
                    CHECK (balance >= 0),
  total_credited  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_debited   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_withdrawn DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency        VARCHAR(5) NOT NULL DEFAULT 'INR',
  is_frozen       BOOLEAN NOT NULL DEFAULT false,
  auto_payout_enabled BOOLEAN NOT NULL DEFAULT false,
  payout_day      INT CHECK (payout_day >= 1 AND payout_day <= 28),
  min_payout_amount DECIMAL(12,2) NOT NULL DEFAULT 500.00,
  payout_method   VARCHAR(20) CHECK (payout_method IN ('bank_transfer', 'upi')),
  payout_details  JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wallets_frozen ON wallets (is_frozen) WHERE is_frozen = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wallets_auto_payout ON wallets (payout_day) WHERE auto_payout_enabled = true AND deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 4. WALLET TRANSACTIONS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              BIGSERIAL PRIMARY KEY,
  wallet_id       BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL
                    CHECK (transaction_type IN ('credit', 'debit', 'withdrawal', 'payout')),
  amount          DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  balance_before  DECIMAL(12,2) NOT NULL,
  balance_after   DECIMAL(12,2) NOT NULL,
  source_type     VARCHAR(30)
                    CHECK (source_type IN ('earning', 'referral', 'refund', 'purchase', 'manual_credit', 'manual_debit', 'payout', 'adjustment')),
  source_id       BIGINT,
  description     TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed', 'pending', 'reversed')),
  metadata        JSONB,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallet_txns_wallet ON wallet_transactions (wallet_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_txns_type ON wallet_transactions (transaction_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_txns_source ON wallet_transactions (source_type, source_id) WHERE source_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_txns_status ON wallet_transactions (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_txns_created ON wallet_transactions (created_at DESC) WHERE deleted_at IS NULL;
-- Idempotency constraint: prevent duplicate credits for same source
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_txns_idempotent ON wallet_transactions (wallet_id, source_type, source_id)
  WHERE source_id IS NOT NULL AND status = 'completed' AND deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 5. TRIGGERS (updated_at)
-- ══════════════════════════════════════════════════════════════

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON announcements FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON wallets FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_wallet_transactions_updated_at
  BEFORE UPDATE ON wallet_transactions FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════
-- 6. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Announcements
CREATE POLICY announcements_select ON announcements FOR SELECT USING (true);
CREATE POLICY announcements_insert ON announcements FOR INSERT WITH CHECK (true);
CREATE POLICY announcements_update ON announcements FOR UPDATE USING (true);
CREATE POLICY announcements_delete ON announcements FOR DELETE USING (true);

-- Announcement Reads
CREATE POLICY announcement_reads_select ON announcement_reads FOR SELECT USING (true);
CREATE POLICY announcement_reads_insert ON announcement_reads FOR INSERT WITH CHECK (true);
CREATE POLICY announcement_reads_update ON announcement_reads FOR UPDATE USING (true);
CREATE POLICY announcement_reads_delete ON announcement_reads FOR DELETE USING (true);

-- Wallets
CREATE POLICY wallets_select ON wallets FOR SELECT USING (true);
CREATE POLICY wallets_insert ON wallets FOR INSERT WITH CHECK (true);
CREATE POLICY wallets_update ON wallets FOR UPDATE USING (true);
CREATE POLICY wallets_delete ON wallets FOR DELETE USING (true);

-- Wallet Transactions
CREATE POLICY wallet_transactions_select ON wallet_transactions FOR SELECT USING (true);
CREATE POLICY wallet_transactions_insert ON wallet_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY wallet_transactions_update ON wallet_transactions FOR UPDATE USING (true);
CREATE POLICY wallet_transactions_delete ON wallet_transactions FOR DELETE USING (true);

-- ══════════════════════════════════════════════════════════════
-- 7. SEED PERMISSIONS
-- ══════════════════════════════════════════════════════════════

INSERT INTO permissions (resource, action, display_name, description) VALUES
  -- Announcements
  ('announcement', 'create', 'Create Announcements', 'Create new announcements')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('announcement', 'read', 'View Announcements', 'View announcement list and details')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('announcement', 'update', 'Update Announcements', 'Edit announcement content and settings')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('announcement', 'delete', 'Delete Announcements', 'Permanently delete announcements')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('announcement', 'soft_delete', 'Soft-delete Announcements', 'Soft-delete announcements')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('announcement', 'restore', 'Restore Announcements', 'Restore soft-deleted announcements')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('announcement', 'publish', 'Publish Announcements', 'Publish draft announcements')
ON CONFLICT (resource, action) DO NOTHING;

  -- Announcement Reads
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('announcement_read', 'read', 'View Announcement Reads', 'View announcement read receipts')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('announcement_read', 'delete', 'Delete Announcement Reads', 'Delete announcement read records')
ON CONFLICT (resource, action) DO NOTHING;

  -- Wallets
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet', 'create', 'Create Wallets', 'Create new wallets')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet', 'read', 'View Wallets', 'View wallet balances and details')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet', 'update', 'Update Wallets', 'Update wallet settings')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet', 'delete', 'Delete Wallets', 'Permanently delete wallets')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet', 'soft_delete', 'Soft-delete Wallets', 'Soft-delete wallets')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet', 'restore', 'Restore Wallets', 'Restore soft-deleted wallets')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet', 'activate', 'Freeze/Unfreeze Wallets', 'Freeze or unfreeze wallet accounts')
ON CONFLICT (resource, action) DO NOTHING;

  -- Wallet Transactions
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet_transaction', 'create', 'Create Wallet Transactions', 'Create manual wallet transactions')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet_transaction', 'read', 'View Wallet Transactions', 'View wallet transaction history')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet_transaction', 'update', 'Update Wallet Transactions', 'Update wallet transactions')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet_transaction', 'delete', 'Delete Wallet Transactions', 'Permanently delete transactions')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet_transaction', 'soft_delete', 'Soft-delete Wallet Transactions', 'Soft-delete transactions')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('wallet_transaction', 'restore', 'Restore Wallet Transactions', 'Restore soft-deleted transactions')
ON CONFLICT (resource, action) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 8. GRANT ALL TO super_admin
-- ══════════════════════════════════════════════════════════════

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'super_admin'
  AND p.resource IN ('announcement', 'announcement_read', 'wallet', 'wallet_transaction')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 9. TABLE SUMMARY
-- ══════════════════════════════════════════════════════════════

INSERT INTO table_summary (table_name, display_name, description, category) VALUES
  ('announcements', 'Announcements', 'System and instructor announcements with targeting', 'communication'),
  ('announcement_reads', 'Announcement Reads', 'Read receipts for announcements per user', 'communication'),
  ('wallets', 'Wallets', 'User wallet accounts for earnings and payouts', 'finance'),
  ('wallet_transactions', 'Wallet Transactions', 'Credit, debit, and payout transaction history', 'finance')
ON CONFLICT (table_name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 10. UPDATE admin_activity_log ACTION CONSTRAINT
-- ══════════════════════════════════════════════════════════════

ALTER TABLE admin_activity_log DROP CONSTRAINT IF EXISTS admin_activity_log_action_check;
ALTER TABLE admin_activity_log ADD CONSTRAINT admin_activity_log_action_check CHECK (
  action::text = ANY (ARRAY[
    'account_locked','account_reactivated','account_suspended',
    'ai_bulk_content_generated','ai_bulk_sub_category_translation_generated','ai_bulk_translation_generated',
    'ai_content_generated','ai_master_data_updated','ai_resume_content_generated',
    'ai_sample_data_generated','ai_sub_category_content_generated','ai_translation_generated',
    'all_sessions_revoked',
    -- NEW: announcement actions
    'announcement_created','announcement_updated','announcement_soft_deleted','announcement_restored','announcement_deleted',
    'announcement_published','announcement_archived','announcement_expired',
    'announcement_read_created','announcement_read_deleted',
    'assessment_created','assessment_deleted','assessment_exercise_created','assessment_exercise_created_full',
    'assessment_exercise_deleted','assessment_exercise_restored','assessment_exercise_soft_deleted',
    'assessment_exercise_translation_created','assessment_exercise_translation_deleted',
    'assessment_exercise_translation_restored','assessment_exercise_translation_soft_deleted',
    'assessment_exercise_translation_updated','assessment_exercise_updated','assessment_exercise_updated_full',
    'assessment_restored','assessment_soft_deleted','assessment_updated',
    'badge_created','badge_deleted','badge_restored','badge_soft_deleted','badge_updated',
    'batch_translation_created','batch_translation_deleted','batch_translation_restored',
    'batch_translation_soft_deleted','batch_translation_updated',
    'blog_category_created','blog_category_updated','blog_category_soft_deleted','blog_category_restored','blog_category_deleted',
    'blog_post_created','blog_post_updated','blog_post_soft_deleted','blog_post_restored','blog_post_deleted',
    'blog_post_published','blog_post_archived',
    'blog_review_created','blog_review_updated','blog_review_soft_deleted','blog_review_restored','blog_review_deleted',
    'blog_review_status_changed','blog_review_ratings_recalculated',
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
    'chat_attachment_created',
    'chat_invite_created','chat_invite_accepted','chat_invite_revoked',
    'chat_message_created','chat_message_updated','chat_message_soft_deleted','chat_message_restored','chat_message_deleted',
    'chat_message_pinned','chat_message_unpinned',
    'chat_reaction_added','chat_reaction_removed',
    'chat_room_created','chat_room_updated','chat_room_soft_deleted','chat_room_restored','chat_room_deleted',
    'chat_room_member_added','chat_room_member_removed','chat_room_member_updated',
    'chat_room_batch_synced',
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
    'custom_emoji_created','custom_emoji_updated','custom_emoji_soft_deleted','custom_emoji_restored','custom_emoji_deleted',
    'department_created','department_deleted','department_restored','department_soft_deleted','department_updated',
    'desc_auto_generated','desc_auto_translated',
    'desc_question_created','desc_question_created_full','desc_question_deleted','desc_question_restored','desc_question_soft_deleted',
    'desc_question_translation_created','desc_question_translation_deleted','desc_question_translation_restored',
    'desc_question_translation_soft_deleted','desc_question_translation_updated',
    'desc_question_updated','desc_question_updated_full',
    'designation_created','designation_deleted','designation_restored','designation_soft_deleted','designation_updated',
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
    'emoji_category_created','emoji_category_updated','emoji_category_soft_deleted','emoji_category_restored','emoji_category_deleted',
    'employee_profile_created','employee_profile_deleted','employee_profile_restored','employee_profile_soft_deleted','employee_profile_updated',
    'enrollment_created','enrollment_updated','enrollment_soft_deleted','enrollment_restored','enrollment_deleted',
    'enrollment_completed','enrollment_suspended','enrollment_cancelled',
    'enrollment_progress_created','enrollment_progress_updated','enrollment_progress_soft_deleted',
    'enrollment_progress_restored','enrollment_progress_deleted',
    'exercise_auto_translated',
    'faq_created','faq_updated','faq_soft_deleted','faq_restored','faq_deleted',
    'faq_category_created','faq_category_updated','faq_category_soft_deleted','faq_category_restored','faq_category_deleted',
    'faq_category_translation_created','faq_category_translation_updated','faq_category_translation_soft_deleted',
    'faq_category_translation_restored','faq_category_translation_deleted',
    'faq_translation_created','faq_translation_updated','faq_translation_soft_deleted','faq_translation_restored','faq_translation_deleted',
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
    'policy_created','policy_updated','policy_soft_deleted','policy_restored','policy_deleted',
    'policy_published','policy_archived',
    'policy_translation_created','policy_translation_updated','policy_translation_soft_deleted',
    'policy_translation_restored','policy_translation_deleted',
    'policy_type_created','policy_type_updated','policy_type_soft_deleted','policy_type_restored','policy_type_deleted',
    'policy_type_translation_created','policy_type_translation_updated','policy_type_translation_soft_deleted',
    'policy_type_translation_restored','policy_type_translation_deleted',
    'quick_reply_created','quick_reply_updated','quick_reply_soft_deleted','quick_reply_restored','quick_reply_deleted',
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
    'session_attendance_created','session_attendance_updated','session_attendance_soft_deleted','session_attendance_restored','session_attendance_deleted',
    'session_attendance_marked',
    'session_recording_created','session_recording_updated','session_recording_soft_deleted','session_recording_restored','session_recording_deleted',
    'skill_created','skill_deleted','skill_restored','skill_soft_deleted','skill_updated',
    'skipped',
    'social_media_created','social_media_deleted','social_media_restored','social_media_soft_deleted','social_media_updated',
    'specialization_created','specialization_deleted','specialization_restored','specialization_soft_deleted','specialization_updated',
    'state_created','state_deleted','state_restored','state_soft_deleted','state_updated',
    'sticker_created','sticker_updated','sticker_soft_deleted','sticker_restored','sticker_deleted',
    'sticker_category_created','sticker_category_updated','sticker_category_soft_deleted','sticker_category_restored','sticker_category_deleted',
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
    'support_ticket_created','support_ticket_updated','support_ticket_soft_deleted','support_ticket_restored','support_ticket_deleted',
    'support_ticket_status_changed','support_ticket_assigned',
    'ticket_attachment_created','ticket_attachment_deleted',
    'ticket_category_created','ticket_category_updated','ticket_category_soft_deleted','ticket_category_restored','ticket_category_deleted',
    'ticket_message_created','ticket_message_updated','ticket_message_soft_deleted','ticket_message_restored','ticket_message_deleted',
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
    -- NEW: wallet actions
    'wallet_created','wallet_updated','wallet_soft_deleted','wallet_restored','wallet_deleted',
    'wallet_frozen','wallet_unfrozen',
    'wallet_transaction_created','wallet_transaction_updated','wallet_transaction_soft_deleted',
    'wallet_transaction_restored','wallet_transaction_deleted','wallet_transaction_reversed',
    'wallet_manual_credit','wallet_manual_debit','wallet_payout_processed',
    'webinar_created','webinar_deleted','webinar_restored','webinar_soft_deleted',
    'webinar_translation_created','webinar_translation_deleted','webinar_translation_restored',
    'webinar_translation_soft_deleted','webinar_translation_updated','webinar_updated',
    'wishlist_created','wishlist_updated','wishlist_soft_deleted','wishlist_restored','wishlist_deleted','wishlist_moved_to_cart',
    'youtube_description_deleted','youtube_description_generated','youtube_description_updated','youtube_descriptions_bulk_deleted'
  ])
);