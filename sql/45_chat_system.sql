-- ══════════════════════════════════════════════════════════════
-- MIGRATION 45: Chat System
-- ══════════════════════════════════════════════════════════════
-- Tables: chat_rooms, chat_room_members, chat_messages,
--         chat_attachments, chat_message_reactions, chat_read_receipts,
--         chat_invites, sticker_categories, stickers,
--         emoji_categories, custom_emojis, quick_replies
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 1. CHAT ROOMS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_rooms (
  id              BIGSERIAL PRIMARY KEY,
  room_type       VARCHAR(20) NOT NULL DEFAULT 'public'
                    CHECK (room_type IN ('public', 'private', 'direct')),
  name            VARCHAR(255),
  description     TEXT,
  avatar_url      TEXT,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  max_members     INT NOT NULL DEFAULT 100,
  batch_id        BIGINT REFERENCES course_batches(id) ON DELETE SET NULL,
  invite_code     VARCHAR(20) UNIQUE,
  allow_invite_link BOOLEAN NOT NULL DEFAULT true,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_type ON chat_rooms (room_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_rooms_batch ON chat_rooms (batch_id) WHERE batch_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_by ON chat_rooms (created_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_rooms_invite_code ON chat_rooms (invite_code) WHERE invite_code IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- 2. CHAT ROOM MEMBERS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_room_members (
  id              BIGSERIAL PRIMARY KEY,
  room_id         BIGINT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member')),
  invited_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  invite_id       BIGINT,  -- FK added after chat_invites table
  is_muted        BOOLEAN NOT NULL DEFAULT false,
  muted_until     TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at    TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_room ON chat_room_members (room_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chat_room_members_user ON chat_room_members (user_id) WHERE is_active = true;

-- ══════════════════════════════════════════════════════════════
-- 3. CHAT MESSAGES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_messages (
  id              BIGSERIAL PRIMARY KEY,
  room_id         BIGINT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  message_type    VARCHAR(20) NOT NULL DEFAULT 'text'
                    CHECK (message_type IN ('text', 'image', 'file', 'sticker', 'emoji', 'system', 'quick_reply')),
  content         TEXT,
  metadata        JSONB,
  reply_to_id     BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  is_edited       BOOLEAN NOT NULL DEFAULT false,
  edited_at       TIMESTAMPTZ,
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages (room_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages (sender_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON chat_messages (room_id) WHERE is_pinned = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply ON chat_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- 4. CHAT ATTACHMENTS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_attachments (
  id              BIGSERIAL PRIMARY KEY,
  message_id      BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  file_name       VARCHAR(500) NOT NULL,
  file_url        TEXT NOT NULL,
  file_size       BIGINT,
  file_type       VARCHAR(100),
  thumbnail_url   TEXT,
  uploaded_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_attachments (message_id);

-- ══════════════════════════════════════════════════════════════
-- 5. CHAT MESSAGE REACTIONS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id              BIGSERIAL PRIMARY KEY,
  message_id      BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji           VARCHAR(50) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_message_reactions (message_id);

-- ══════════════════════════════════════════════════════════════
-- 6. CHAT READ RECEIPTS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_read_receipts (
  id                  BIGSERIAL PRIMARY KEY,
  room_id             BIGINT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  read_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

-- ══════════════════════════════════════════════════════════════
-- 7. CHAT INVITES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_invites (
  id              BIGSERIAL PRIMARY KEY,
  room_id         BIGINT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  created_by      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_token    VARCHAR(64) UNIQUE NOT NULL,
  invite_type     VARCHAR(20) NOT NULL DEFAULT 'link'
                    CHECK (invite_type IN ('link', 'direct')),
  invited_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  max_uses        INT,
  use_count       INT NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'expired', 'revoked')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_invites_token ON chat_invites (invite_token) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_chat_invites_room ON chat_invites (room_id) WHERE status = 'active';

-- Add FK for chat_room_members.invite_id now that chat_invites exists
ALTER TABLE chat_room_members
  ADD CONSTRAINT fk_chat_room_members_invite
  FOREIGN KEY (invite_id) REFERENCES chat_invites(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════════════
-- 8. STICKER CATEGORIES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sticker_categories (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  slug            VARCHAR(100) UNIQUE,
  thumbnail_url   TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sticker_categories_active ON sticker_categories (is_active) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 9. STICKERS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stickers (
  id              BIGSERIAL PRIMARY KEY,
  category_id     BIGINT NOT NULL REFERENCES sticker_categories(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  slug            VARCHAR(100),
  image_url       TEXT NOT NULL,
  is_animated     BOOLEAN NOT NULL DEFAULT false,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stickers_category ON stickers (category_id) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 10. EMOJI CATEGORIES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS emoji_categories (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  slug            VARCHAR(100) UNIQUE,
  icon            VARCHAR(10),
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_emoji_categories_active ON emoji_categories (is_active) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 11. CUSTOM EMOJIS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS custom_emojis (
  id              BIGSERIAL PRIMARY KEY,
  category_id     BIGINT NOT NULL REFERENCES emoji_categories(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  shortcode       VARCHAR(50) UNIQUE NOT NULL,
  image_url       TEXT NOT NULL,
  is_animated     BOOLEAN NOT NULL DEFAULT false,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_custom_emojis_category ON custom_emojis (category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_custom_emojis_shortcode ON custom_emojis (shortcode) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 12. QUICK REPLIES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quick_replies (
  id              BIGSERIAL PRIMARY KEY,
  scope           VARCHAR(20) NOT NULL DEFAULT 'personal'
                    CHECK (scope IN ('global', 'personal')),
  user_id         BIGINT REFERENCES users(id) ON DELETE CASCADE,
  shortcut        VARCHAR(50),
  title           VARCHAR(100) NOT NULL,
  content         TEXT NOT NULL,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_user ON quick_replies (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quick_replies_scope ON quick_replies (scope) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 13. ENABLE ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sticker_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE emoji_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_emojis ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY service_chat_rooms ON chat_rooms FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_chat_room_members ON chat_room_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_chat_messages ON chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_chat_attachments ON chat_attachments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_chat_message_reactions ON chat_message_reactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_chat_read_receipts ON chat_read_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_chat_invites ON chat_invites FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_sticker_categories ON sticker_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_stickers ON stickers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_emoji_categories ON emoji_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_custom_emojis ON custom_emojis FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_quick_replies ON quick_replies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- 14. AUTO-UPDATE updated_at TRIGGERS
-- ══════════════════════════════════════════════════════════════

CREATE TRIGGER trg_chat_rooms_updated_at
  BEFORE UPDATE ON chat_rooms FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_chat_room_members_updated_at
  BEFORE UPDATE ON chat_room_members FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_chat_messages_updated_at
  BEFORE UPDATE ON chat_messages FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_chat_invites_updated_at
  BEFORE UPDATE ON chat_invites FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sticker_categories_updated_at
  BEFORE UPDATE ON sticker_categories FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_stickers_updated_at
  BEFORE UPDATE ON stickers FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_emoji_categories_updated_at
  BEFORE UPDATE ON emoji_categories FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_custom_emojis_updated_at
  BEFORE UPDATE ON custom_emojis FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_quick_replies_updated_at
  BEFORE UPDATE ON quick_replies FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════
-- 15. SEED PERMISSIONS
-- ══════════════════════════════════════════════════════════════

INSERT INTO permissions (resource, action, display_name) VALUES
  -- Chat Rooms
  ('chat_room', 'create', 'Create chat rooms'),
  ('chat_room', 'read', 'View chat rooms'),
  ('chat_room', 'update', 'Update chat rooms'),
  ('chat_room', 'delete', 'Permanently delete chat rooms'),
  ('chat_room', 'soft_delete', 'Soft-delete chat rooms'),
  ('chat_room', 'restore', 'Restore chat rooms'),
  -- Chat Messages
  ('chat_message', 'create', 'Send chat messages'),
  ('chat_message', 'read', 'View chat messages'),
  ('chat_message', 'update', 'Edit chat messages'),
  ('chat_message', 'delete', 'Permanently delete chat messages'),
  ('chat_message', 'soft_delete', 'Soft-delete chat messages'),
  ('chat_message', 'restore', 'Restore chat messages'),
  -- Chat Invites
  ('chat_invite', 'create', 'Create chat invites'),
  ('chat_invite', 'read', 'View chat invites'),
  ('chat_invite', 'update', 'Update chat invites'),
  ('chat_invite', 'delete', 'Delete chat invites'),
  -- Sticker Categories
  ('sticker_category', 'create', 'Create sticker categories'),
  ('sticker_category', 'read', 'View sticker categories'),
  ('sticker_category', 'update', 'Update sticker categories'),
  ('sticker_category', 'delete', 'Permanently delete sticker categories'),
  ('sticker_category', 'soft_delete', 'Soft-delete sticker categories'),
  ('sticker_category', 'restore', 'Restore sticker categories'),
  -- Stickers
  ('sticker', 'create', 'Create stickers'),
  ('sticker', 'read', 'View stickers'),
  ('sticker', 'update', 'Update stickers'),
  ('sticker', 'delete', 'Permanently delete stickers'),
  ('sticker', 'soft_delete', 'Soft-delete stickers'),
  ('sticker', 'restore', 'Restore stickers'),
  -- Emoji Categories
  ('emoji_category', 'create', 'Create emoji categories'),
  ('emoji_category', 'read', 'View emoji categories'),
  ('emoji_category', 'update', 'Update emoji categories'),
  ('emoji_category', 'delete', 'Permanently delete emoji categories'),
  ('emoji_category', 'soft_delete', 'Soft-delete emoji categories'),
  ('emoji_category', 'restore', 'Restore emoji categories'),
  -- Custom Emojis
  ('custom_emoji', 'create', 'Create custom emojis'),
  ('custom_emoji', 'read', 'View custom emojis'),
  ('custom_emoji', 'update', 'Update custom emojis'),
  ('custom_emoji', 'delete', 'Permanently delete custom emojis'),
  ('custom_emoji', 'soft_delete', 'Soft-delete custom emojis'),
  ('custom_emoji', 'restore', 'Restore custom emojis'),
  -- Quick Replies
  ('quick_reply', 'create', 'Create quick replies'),
  ('quick_reply', 'read', 'View quick replies'),
  ('quick_reply', 'update', 'Update quick replies'),
  ('quick_reply', 'delete', 'Permanently delete quick replies'),
  ('quick_reply', 'soft_delete', 'Soft-delete quick replies'),
  ('quick_reply', 'restore', 'Restore quick replies')
ON CONFLICT (resource, action) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 16. UPDATE table_summary
-- ══════════════════════════════════════════════════════════════

INSERT INTO table_summary (table_name, display_name, description, category) VALUES
  ('chat_rooms', 'Chat Rooms', 'Public, private, and direct chat rooms', 'chat'),
  ('chat_room_members', 'Chat Room Members', 'Membership records for chat rooms', 'chat'),
  ('chat_messages', 'Chat Messages', 'Messages sent in chat rooms', 'chat'),
  ('chat_attachments', 'Chat Attachments', 'File attachments in chat messages', 'chat'),
  ('chat_message_reactions', 'Chat Reactions', 'Emoji reactions on chat messages', 'chat'),
  ('chat_read_receipts', 'Chat Read Receipts', 'Read status tracking per room per user', 'chat'),
  ('chat_invites', 'Chat Invites', 'Invite links and direct invites for chat rooms', 'chat'),
  ('sticker_categories', 'Sticker Categories', 'Categories for organizing sticker packs', 'chat'),
  ('stickers', 'Stickers', 'Sticker images and animations for chat', 'chat'),
  ('emoji_categories', 'Emoji Categories', 'Categories for custom emojis', 'chat'),
  ('custom_emojis', 'Custom Emojis', 'Custom emoji images for chat', 'chat'),
  ('quick_replies', 'Quick Replies', 'Predefined quick reply templates', 'chat')
ON CONFLICT (table_name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 17. UPDATE admin_activity_log ACTION CONSTRAINT
-- ══════════════════════════════════════════════════════════════

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
    -- NEW: chat actions
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
    -- NEW: custom emoji actions
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
    -- NEW: emoji category actions
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
    -- NEW: quick reply actions
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
    -- NEW: sticker actions
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
    'ticket_priority_created','ticket_priority_updated','ticket_priority_soft_deleted','ticket_priority_restored','ticket_priority_deleted',
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
