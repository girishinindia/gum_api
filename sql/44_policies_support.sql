-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ══════════════════════════════════════════════════════════════
-- MIGRATION 44: Policy Management + Support Ticket Management
-- ══════════════════════════════════════════════════════════════
-- Tables: policy_types, policy_type_translations, policies,
--         policy_translations, ticket_categories, ticket_priorities,
--         support_tickets, ticket_messages, ticket_attachments,
--         ticket_status_history
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- PART A: POLICY TABLES
-- ══════════════════════════════════════════════════════════════

-- ── 1. policy_types ──
CREATE TABLE IF NOT EXISTS policy_types (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(50) UNIQUE,
  slug            VARCHAR(255) UNIQUE,
  description     TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_policy_types_active
  ON policy_types (is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_policy_types_code
  ON policy_types (code) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_policy_types_updated ON policy_types;
CREATE TRIGGER trg_policy_types_updated
  BEFORE UPDATE ON policy_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE policy_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_types_all ON policy_types;
CREATE POLICY policy_types_all ON policy_types FOR ALL USING (true) WITH CHECK (true);

-- Seed policy types
INSERT INTO policy_types (name, code, display_order) VALUES
  ('Privacy Policy',          'PRIVACY',      1),
  ('Terms and Conditions',    'TERMS',        2),
  ('Refund Policy',           'REFUND',       3),
  ('Instructor Policy',       'INSTRUCTOR',   4),
  ('Blog Policy',             'BLOG',         5),
  ('Placement Policy',        'PLACEMENT',    6)
ON CONFLICT DO NOTHING;

-- ── 2. policy_type_translations ──
CREATE TABLE IF NOT EXISTS policy_type_translations (
  id                BIGSERIAL PRIMARY KEY,
  policy_type_id    BIGINT NOT NULL REFERENCES policy_types(id) ON DELETE RESTRICT,
  language_id       BIGINT NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
  name              TEXT NOT NULL,
  description       TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT uq_policy_type_translation UNIQUE (policy_type_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_type_translations_type
  ON policy_type_translations (policy_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_policy_type_translations_lang
  ON policy_type_translations (language_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_policy_type_translations_updated ON policy_type_translations;
CREATE TRIGGER trg_policy_type_translations_updated
  BEFORE UPDATE ON policy_type_translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE policy_type_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_type_translations_all ON policy_type_translations;
CREATE POLICY policy_type_translations_all ON policy_type_translations FOR ALL USING (true) WITH CHECK (true);

-- ── 3. policies ──
CREATE TABLE IF NOT EXISTS policies (
  id                BIGSERIAL PRIMARY KEY,
  policy_type_id    BIGINT NOT NULL REFERENCES policy_types(id) ON DELETE RESTRICT,
  version           VARCHAR(50) NOT NULL,
  version_notes     TEXT,
  title             VARCHAR(500) NOT NULL,
  content           TEXT NOT NULL,
  content_format    VARCHAR(20) NOT NULL DEFAULT 'html'
                    CONSTRAINT chk_policies_content_format
                    CHECK (content_format IN ('html', 'markdown', 'plain')),
  slug              VARCHAR(255),
  meta_title        TEXT,
  meta_description  TEXT,
  policy_status     VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CONSTRAINT chk_policies_status
                    CHECK (policy_status IN ('draft', 'published', 'archived')),
  effective_from    DATE,
  effective_until   DATE,
  is_current        BOOLEAN NOT NULL DEFAULT false,
  published_at      TIMESTAMPTZ,
  created_by        BIGINT REFERENCES users(id),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_policies_type
  ON policies (policy_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_policies_status
  ON policies (policy_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_policies_current
  ON policies (policy_type_id, is_current) WHERE deleted_at IS NULL AND is_current = true;
CREATE INDEX IF NOT EXISTS idx_policies_slug
  ON policies (slug) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_policies_updated ON policies;
CREATE TRIGGER trg_policies_updated
  BEFORE UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policies_all ON policies;
CREATE POLICY policies_all ON policies FOR ALL USING (true) WITH CHECK (true);

-- ── 4. policy_translations ──
CREATE TABLE IF NOT EXISTS policy_translations (
  id                BIGSERIAL PRIMARY KEY,
  policy_id         BIGINT NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  language_id       BIGINT NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  meta_title        TEXT,
  meta_description  TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT uq_policy_translation UNIQUE (policy_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_translations_policy
  ON policy_translations (policy_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_policy_translations_lang
  ON policy_translations (language_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_policy_translations_updated ON policy_translations;
CREATE TRIGGER trg_policy_translations_updated
  BEFORE UPDATE ON policy_translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE policy_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_translations_all ON policy_translations;
CREATE POLICY policy_translations_all ON policy_translations FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- PART B: SUPPORT TICKET TABLES
-- ══════════════════════════════════════════════════════════════

-- ── 5. ticket_categories ──
CREATE TABLE IF NOT EXISTS ticket_categories (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) UNIQUE,
  description     TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ticket_categories_active
  ON ticket_categories (is_active) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_ticket_categories_updated ON ticket_categories;
CREATE TRIGGER trg_ticket_categories_updated
  BEFORE UPDATE ON ticket_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ticket_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ticket_categories_all ON ticket_categories;
CREATE POLICY ticket_categories_all ON ticket_categories FOR ALL USING (true) WITH CHECK (true);

-- Seed ticket categories
INSERT INTO ticket_categories (name, slug, display_order) VALUES
  ('Technical Issue',   'technical-issue',  1),
  ('Billing & Payment', 'billing-payment',  2),
  ('Course Content',    'course-content',   3),
  ('Account Access',    'account-access',   4),
  ('Enrollment',        'enrollment',       5),
  ('Certificate',       'certificate',      6),
  ('General Inquiry',   'general-inquiry',  7)
ON CONFLICT DO NOTHING;

-- ── 6. ticket_priorities ──
CREATE TABLE IF NOT EXISTS ticket_priorities (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  code            VARCHAR(20) UNIQUE,
  color           VARCHAR(20) DEFAULT '#6b7280',
  sla_hours       INT NOT NULL DEFAULT 24,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ticket_priorities_active
  ON ticket_priorities (is_active) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_ticket_priorities_updated ON ticket_priorities;
CREATE TRIGGER trg_ticket_priorities_updated
  BEFORE UPDATE ON ticket_priorities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ticket_priorities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ticket_priorities_all ON ticket_priorities;
CREATE POLICY ticket_priorities_all ON ticket_priorities FOR ALL USING (true) WITH CHECK (true);

-- Seed ticket priorities
INSERT INTO ticket_priorities (name, code, color, sla_hours, display_order) VALUES
  ('Low',     'LOW',     '#22c55e', 72, 1),
  ('Medium',  'MEDIUM',  '#f59e0b', 24, 2),
  ('High',    'HIGH',    '#f97316', 8,  3),
  ('Urgent',  'URGENT',  '#ef4444', 2,  4)
ON CONFLICT DO NOTHING;

-- ── 7. support_tickets ──
CREATE TABLE IF NOT EXISTS support_tickets (
  id              BIGSERIAL PRIMARY KEY,
  ticket_number   VARCHAR(30) NOT NULL UNIQUE,
  subject         VARCHAR(500) NOT NULL,
  description     TEXT,
  category_id     BIGINT REFERENCES ticket_categories(id) ON DELETE SET NULL,
  priority_id     BIGINT REFERENCES ticket_priorities(id) ON DELETE SET NULL,
  ticket_status   VARCHAR(30) NOT NULL DEFAULT 'open'
                  CONSTRAINT chk_support_tickets_status
                  CHECK (ticket_status IN ('open', 'in_progress', 'awaiting_reply', 'resolved', 'closed')),
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  related_type    VARCHAR(30)
                  CONSTRAINT chk_support_tickets_related_type
                  CHECK (related_type IS NULL OR related_type IN ('course', 'order', 'enrollment', 'payment', 'webinar', 'bundle')),
  related_id      BIGINT,
  resolved_at     TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets (ticket_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON support_tickets (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned
  ON support_tickets (assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_category
  ON support_tickets (category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority
  ON support_tickets (priority_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_number
  ON support_tickets (ticket_number);

DROP TRIGGER IF EXISTS trg_support_tickets_updated ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_tickets_all ON support_tickets;
CREATE POLICY support_tickets_all ON support_tickets FOR ALL USING (true) WITH CHECK (true);

-- ── 8. ticket_messages ──
CREATE TABLE IF NOT EXISTS ticket_messages (
  id              BIGSERIAL PRIMARY KEY,
  ticket_id       BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sender_type     VARCHAR(20) NOT NULL DEFAULT 'user'
                  CONSTRAINT chk_ticket_messages_sender_type
                  CHECK (sender_type IN ('user', 'admin', 'system')),
  message         TEXT NOT NULL,
  is_internal     BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket
  ON ticket_messages (ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender
  ON ticket_messages (sender_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_ticket_messages_updated ON ticket_messages;
CREATE TRIGGER trg_ticket_messages_updated
  BEFORE UPDATE ON ticket_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ticket_messages_all ON ticket_messages;
CREATE POLICY ticket_messages_all ON ticket_messages FOR ALL USING (true) WITH CHECK (true);

-- ── 9. ticket_attachments ──
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id              BIGSERIAL PRIMARY KEY,
  ticket_id       BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  message_id      BIGINT REFERENCES ticket_messages(id) ON DELETE SET NULL,
  file_name       VARCHAR(500) NOT NULL,
  file_url        TEXT NOT NULL,
  file_size       BIGINT DEFAULT 0,
  file_type       VARCHAR(100),
  uploaded_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket
  ON ticket_attachments (ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message
  ON ticket_attachments (message_id) WHERE deleted_at IS NULL;

ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ticket_attachments_all ON ticket_attachments;
CREATE POLICY ticket_attachments_all ON ticket_attachments FOR ALL USING (true) WITH CHECK (true);

-- ── 10. ticket_status_history ──
CREATE TABLE IF NOT EXISTS ticket_status_history (
  id              BIGSERIAL PRIMARY KEY,
  ticket_id       BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  from_status     VARCHAR(30),
  to_status       VARCHAR(30) NOT NULL,
  changed_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_status_history_ticket
  ON ticket_status_history (ticket_id);

ALTER TABLE ticket_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ticket_status_history_all ON ticket_status_history;
CREATE POLICY ticket_status_history_all ON ticket_status_history FOR ALL USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- PART C: PERMISSIONS
-- ══════════════════════════════════════════════════════════════

INSERT INTO permissions (resource, action, display_name, description) VALUES
  -- Policy Types
  ('policy_type', 'create', 'Create Policy Type', 'Create a new policy type'),
  ('policy_type', 'read', 'View Policy Types', 'View policy types'),
  ('policy_type', 'update', 'Update Policy Type', 'Update a policy type'),
  ('policy_type', 'soft_delete', 'Soft Delete Policy Type', 'Soft delete a policy type'),
  ('policy_type', 'restore', 'Restore Policy Type', 'Restore a soft-deleted policy type'),
  ('policy_type', 'delete', 'Delete Policy Type', 'Permanently delete a policy type'),
  -- Policy Type Translations
  ('policy_type_translation', 'create', 'Create Policy Type Translation', 'Create a new policy type translation'),
  ('policy_type_translation', 'read', 'View Policy Type Translations', 'View policy type translations'),
  ('policy_type_translation', 'update', 'Update Policy Type Translation', 'Update a policy type translation'),
  ('policy_type_translation', 'soft_delete', 'Soft Delete Policy Type Translation', 'Soft delete a policy type translation'),
  ('policy_type_translation', 'restore', 'Restore Policy Type Translation', 'Restore a soft-deleted policy type translation'),
  ('policy_type_translation', 'delete', 'Delete Policy Type Translation', 'Permanently delete a policy type translation'),
  -- Policies
  ('policy', 'create', 'Create Policy', 'Create a new policy'),
  ('policy', 'read', 'View Policies', 'View policies'),
  ('policy', 'update', 'Update Policy', 'Update a policy'),
  ('policy', 'soft_delete', 'Soft Delete Policy', 'Soft delete a policy'),
  ('policy', 'restore', 'Restore Policy', 'Restore a soft-deleted policy'),
  ('policy', 'delete', 'Delete Policy', 'Permanently delete a policy'),
  -- Policy Translations
  ('policy_translation', 'create', 'Create Policy Translation', 'Create a new policy translation'),
  ('policy_translation', 'read', 'View Policy Translations', 'View policy translations'),
  ('policy_translation', 'update', 'Update Policy Translation', 'Update a policy translation'),
  ('policy_translation', 'soft_delete', 'Soft Delete Policy Translation', 'Soft delete a policy translation'),
  ('policy_translation', 'restore', 'Restore Policy Translation', 'Restore a soft-deleted policy translation'),
  ('policy_translation', 'delete', 'Delete Policy Translation', 'Permanently delete a policy translation'),
  -- Ticket Categories
  ('ticket_category', 'create', 'Create Ticket Category', 'Create a new ticket category'),
  ('ticket_category', 'read', 'View Ticket Categories', 'View ticket categories'),
  ('ticket_category', 'update', 'Update Ticket Category', 'Update a ticket category'),
  ('ticket_category', 'soft_delete', 'Soft Delete Ticket Category', 'Soft delete a ticket category'),
  ('ticket_category', 'restore', 'Restore Ticket Category', 'Restore a soft-deleted ticket category'),
  ('ticket_category', 'delete', 'Delete Ticket Category', 'Permanently delete a ticket category'),
  -- Ticket Priorities
  ('ticket_priority', 'create', 'Create Ticket Priority', 'Create a new ticket priority'),
  ('ticket_priority', 'read', 'View Ticket Priorities', 'View ticket priorities'),
  ('ticket_priority', 'update', 'Update Ticket Priority', 'Update a ticket priority'),
  ('ticket_priority', 'soft_delete', 'Soft Delete Ticket Priority', 'Soft delete a ticket priority'),
  ('ticket_priority', 'restore', 'Restore Ticket Priority', 'Restore a soft-deleted ticket priority'),
  ('ticket_priority', 'delete', 'Delete Ticket Priority', 'Permanently delete a ticket priority'),
  -- Support Tickets
  ('support_ticket', 'create', 'Create Support Ticket', 'Create a new support ticket'),
  ('support_ticket', 'read', 'View Support Tickets', 'View support tickets'),
  ('support_ticket', 'update', 'Update Support Ticket', 'Update a support ticket'),
  ('support_ticket', 'soft_delete', 'Soft Delete Support Ticket', 'Soft delete a support ticket'),
  ('support_ticket', 'restore', 'Restore Support Ticket', 'Restore a soft-deleted support ticket'),
  ('support_ticket', 'delete', 'Delete Support Ticket', 'Permanently delete a support ticket'),
  -- Ticket Messages
  ('ticket_message', 'create', 'Create Ticket Message', 'Create a new ticket message'),
  ('ticket_message', 'read', 'View Ticket Messages', 'View ticket messages'),
  ('ticket_message', 'update', 'Update Ticket Message', 'Update a ticket message'),
  ('ticket_message', 'soft_delete', 'Soft Delete Ticket Message', 'Soft delete a ticket message'),
  ('ticket_message', 'restore', 'Restore Ticket Message', 'Restore a soft-deleted ticket message'),
  ('ticket_message', 'delete', 'Delete Ticket Message', 'Permanently delete a ticket message'),
  -- Ticket Attachments
  ('ticket_attachment', 'create', 'Create Ticket Attachment', 'Upload a ticket attachment'),
  ('ticket_attachment', 'read', 'View Ticket Attachments', 'View ticket attachments'),
  ('ticket_attachment', 'update', 'Update Ticket Attachment', 'Update a ticket attachment'),
  ('ticket_attachment', 'soft_delete', 'Soft Delete Ticket Attachment', 'Soft delete a ticket attachment'),
  ('ticket_attachment', 'restore', 'Restore Ticket Attachment', 'Restore a soft-deleted ticket attachment'),
  ('ticket_attachment', 'delete', 'Delete Ticket Attachment', 'Permanently delete a ticket attachment')
ON CONFLICT DO NOTHING;

-- Grant all new permissions to super_admin (role_id = 1)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions
WHERE resource IN (
  'policy_type', 'policy_type_translation', 'policy', 'policy_translation',
  'ticket_category', 'ticket_priority', 'support_ticket', 'ticket_message', 'ticket_attachment'
)
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- PART D: TABLE SUMMARY
-- ══════════════════════════════════════════════════════════════

INSERT INTO table_summary (table_name, is_active, is_inactive, is_deleted) VALUES
  ('policy_types', 0, 0, 0),
  ('policy_type_translations', 0, 0, 0),
  ('policies', 0, 0, 0),
  ('policy_translations', 0, 0, 0),
  ('ticket_categories', 0, 0, 0),
  ('ticket_priorities', 0, 0, 0),
  ('support_tickets', 0, 0, 0),
  ('ticket_messages', 0, 0, 0),
  ('ticket_attachments', 0, 0, 0),
  ('ticket_status_history', 0, 0, 0)
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- PART E: ACTIVITY LOG CONSTRAINT UPDATE
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
    -- NEW: policy actions
    'policy_created','policy_updated','policy_soft_deleted','policy_restored','policy_deleted',
    'policy_published','policy_archived',
    'policy_translation_created','policy_translation_updated','policy_translation_soft_deleted',
    'policy_translation_restored','policy_translation_deleted',
    'policy_type_created','policy_type_updated','policy_type_soft_deleted','policy_type_restored','policy_type_deleted',
    'policy_type_translation_created','policy_type_translation_updated','policy_type_translation_soft_deleted',
    'policy_type_translation_restored','policy_type_translation_deleted',
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
    -- NEW: support ticket actions
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