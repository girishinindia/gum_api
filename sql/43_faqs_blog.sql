-- ══════════════════════════════════════════════════════════════
-- MIGRATION 43: FAQs (with Translations) + Blog + Blog Reviews
-- ══════════════════════════════════════════════════════════════
-- Tables: faq_categories, faq_category_translations, faqs,
--         faq_translations, blog_categories, blog_posts, blog_reviews
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- PART A: FAQ TABLES
-- ══════════════════════════════════════════════════════════════

-- ── 1. faq_categories ──
CREATE TABLE IF NOT EXISTS faq_categories (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) UNIQUE,
  description     TEXT,
  item_type       VARCHAR(20) CHECK (item_type IN ('course', 'bundle', 'batch', 'webinar', 'general')),
  item_id         BIGINT,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_faq_categories_item ON faq_categories(item_type, item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faq_categories_active ON faq_categories(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faq_categories_slug ON faq_categories(slug) WHERE deleted_at IS NULL;

CREATE TRIGGER set_faq_categories_updated_at
  BEFORE UPDATE ON faq_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE faq_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY faq_categories_all ON faq_categories FOR ALL USING (true) WITH CHECK (true);

-- ── 2. faq_category_translations ──
CREATE TABLE IF NOT EXISTS faq_category_translations (
  id                  BIGSERIAL PRIMARY KEY,
  faq_category_id     BIGINT NOT NULL REFERENCES faq_categories(id) ON DELETE RESTRICT,
  language_id         BIGINT NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  meta_title          VARCHAR(255),
  meta_description    TEXT,
  meta_keywords       TEXT,
  og_title            TEXT,
  og_description      TEXT,
  focus_keyword       TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT uq_faq_category_translation UNIQUE (faq_category_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_faq_cat_trans_category ON faq_category_translations(faq_category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faq_cat_trans_language ON faq_category_translations(language_id) WHERE deleted_at IS NULL;

CREATE TRIGGER set_faq_category_translations_updated_at
  BEFORE UPDATE ON faq_category_translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE faq_category_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY faq_category_translations_all ON faq_category_translations FOR ALL USING (true) WITH CHECK (true);

-- ── 3. faqs ──
CREATE TABLE IF NOT EXISTS faqs (
  id              BIGSERIAL PRIMARY KEY,
  category_id     BIGINT REFERENCES faq_categories(id) ON DELETE SET NULL,
  item_type       VARCHAR(20) NOT NULL CHECK (item_type IN ('course', 'bundle', 'batch', 'webinar', 'general')),
  item_id         BIGINT,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  author_id       BIGINT REFERENCES users(id),
  author_type     VARCHAR(20) NOT NULL DEFAULT 'system' CHECK (author_type IN ('system', 'instructor')),
  display_order   INT NOT NULL DEFAULT 0,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_faqs_item ON faqs(item_type, item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faqs_author ON faqs(author_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faqs_author_type ON faqs(author_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faqs_featured ON faqs(is_featured) WHERE deleted_at IS NULL AND is_featured = true;
CREATE INDEX IF NOT EXISTS idx_faqs_created_at ON faqs(created_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER set_faqs_updated_at
  BEFORE UPDATE ON faqs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY faqs_all ON faqs FOR ALL USING (true) WITH CHECK (true);

-- ── 4. faq_translations ──
CREATE TABLE IF NOT EXISTS faq_translations (
  id                  BIGSERIAL PRIMARY KEY,
  faq_id              BIGINT NOT NULL REFERENCES faqs(id) ON DELETE RESTRICT,
  language_id         BIGINT NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
  question            TEXT NOT NULL,
  answer              TEXT NOT NULL,
  meta_title          VARCHAR(255),
  meta_description    TEXT,
  meta_keywords       TEXT,
  og_title            TEXT,
  og_description      TEXT,
  twitter_title       TEXT,
  twitter_description TEXT,
  focus_keyword       TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT uq_faq_translation UNIQUE (faq_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_faq_trans_faq ON faq_translations(faq_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faq_trans_language ON faq_translations(language_id) WHERE deleted_at IS NULL;

CREATE TRIGGER set_faq_translations_updated_at
  BEFORE UPDATE ON faq_translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE faq_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY faq_translations_all ON faq_translations FOR ALL USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- PART B: BLOG TABLES
-- ══════════════════════════════════════════════════════════════

-- ── 5. blog_categories ──
CREATE TABLE IF NOT EXISTS blog_categories (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) UNIQUE,
  description     TEXT,
  parent_id       BIGINT REFERENCES blog_categories(id) ON DELETE SET NULL,
  thumbnail_url   TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blog_categories_parent ON blog_categories(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_categories_slug ON blog_categories(slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_categories_active ON blog_categories(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER set_blog_categories_updated_at
  BEFORE UPDATE ON blog_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_categories_all ON blog_categories FOR ALL USING (true) WITH CHECK (true);

-- ── 6. blog_posts ──
CREATE TABLE IF NOT EXISTS blog_posts (
  id                  BIGSERIAL PRIMARY KEY,
  title               VARCHAR(500) NOT NULL,
  slug                VARCHAR(500) UNIQUE,
  excerpt             TEXT,
  content             TEXT NOT NULL,
  featured_image_url  TEXT,
  category_id         BIGINT REFERENCES blog_categories(id) ON DELETE SET NULL,
  author_id           BIGINT REFERENCES users(id),
  author_type         VARCHAR(20) NOT NULL DEFAULT 'system' CHECK (author_type IN ('system', 'instructor')),
  status              VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at        TIMESTAMPTZ,
  tags                JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_title          VARCHAR(255),
  meta_description    TEXT,
  meta_keywords       TEXT,
  og_image_url        TEXT,
  view_count          INT NOT NULL DEFAULT 0,
  rating_average      NUMERIC NOT NULL DEFAULT 0.00,
  rating_count        BIGINT NOT NULL DEFAULT 0,
  is_featured         BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_author_type ON blog_posts(author_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC) WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX IF NOT EXISTS idx_blog_posts_featured ON blog_posts(is_featured) WHERE deleted_at IS NULL AND is_featured = true;
CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at ON blog_posts(created_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER set_blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_posts_all ON blog_posts FOR ALL USING (true) WITH CHECK (true);

-- ── 7. blog_reviews ──
CREATE TABLE IF NOT EXISTS blog_reviews (
  id              BIGSERIAL PRIMARY KEY,
  blog_post_id    BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  rating          SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title           VARCHAR(255),
  review_text     TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'flagged', 'hidden')),
  helpful_count   INT NOT NULL DEFAULT 0,
  reported_count  INT NOT NULL DEFAULT 0,
  admin_notes     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT uq_blog_review UNIQUE (blog_post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_reviews_post ON blog_reviews(blog_post_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_reviews_user ON blog_reviews(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_reviews_status ON blog_reviews(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_reviews_rating ON blog_reviews(rating) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_reviews_created_at ON blog_reviews(created_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER set_blog_reviews_updated_at
  BEFORE UPDATE ON blog_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE blog_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_reviews_all ON blog_reviews FOR ALL USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- PART C: PERMISSIONS
-- ══════════════════════════════════════════════════════════════

INSERT INTO permissions (resource, action, display_name, description) VALUES
  -- FAQ Categories
  ('faq_category', 'create', 'Create FAQ Category', 'Create a new FAQ category'),
  ('faq_category', 'read', 'View FAQ Categories', 'View FAQ categories'),
  ('faq_category', 'update', 'Update FAQ Category', 'Update a FAQ category'),
  ('faq_category', 'soft_delete', 'Soft Delete FAQ Category', 'Soft delete a FAQ category'),
  ('faq_category', 'restore', 'Restore FAQ Category', 'Restore a soft-deleted FAQ category'),
  ('faq_category', 'delete', 'Delete FAQ Category', 'Permanently delete a FAQ category'),
  -- FAQ Category Translations
  ('faq_category_translation', 'create', 'Create FAQ Category Translation', 'Create a new FAQ category translation'),
  ('faq_category_translation', 'read', 'View FAQ Category Translations', 'View FAQ category translations'),
  ('faq_category_translation', 'update', 'Update FAQ Category Translation', 'Update a FAQ category translation'),
  ('faq_category_translation', 'soft_delete', 'Soft Delete FAQ Category Translation', 'Soft delete a FAQ category translation'),
  ('faq_category_translation', 'restore', 'Restore FAQ Category Translation', 'Restore a soft-deleted FAQ category translation'),
  ('faq_category_translation', 'delete', 'Delete FAQ Category Translation', 'Permanently delete a FAQ category translation'),
  -- FAQs
  ('faq', 'create', 'Create FAQ', 'Create a new FAQ'),
  ('faq', 'read', 'View FAQs', 'View FAQs'),
  ('faq', 'update', 'Update FAQ', 'Update a FAQ'),
  ('faq', 'soft_delete', 'Soft Delete FAQ', 'Soft delete a FAQ'),
  ('faq', 'restore', 'Restore FAQ', 'Restore a soft-deleted FAQ'),
  ('faq', 'delete', 'Delete FAQ', 'Permanently delete a FAQ'),
  -- FAQ Translations
  ('faq_translation', 'create', 'Create FAQ Translation', 'Create a new FAQ translation'),
  ('faq_translation', 'read', 'View FAQ Translations', 'View FAQ translations'),
  ('faq_translation', 'update', 'Update FAQ Translation', 'Update a FAQ translation'),
  ('faq_translation', 'soft_delete', 'Soft Delete FAQ Translation', 'Soft delete a FAQ translation'),
  ('faq_translation', 'restore', 'Restore FAQ Translation', 'Restore a soft-deleted FAQ translation'),
  ('faq_translation', 'delete', 'Delete FAQ Translation', 'Permanently delete a FAQ translation'),
  -- Blog Categories
  ('blog_category', 'create', 'Create Blog Category', 'Create a new blog category'),
  ('blog_category', 'read', 'View Blog Categories', 'View blog categories'),
  ('blog_category', 'update', 'Update Blog Category', 'Update a blog category'),
  ('blog_category', 'soft_delete', 'Soft Delete Blog Category', 'Soft delete a blog category'),
  ('blog_category', 'restore', 'Restore Blog Category', 'Restore a soft-deleted blog category'),
  ('blog_category', 'delete', 'Delete Blog Category', 'Permanently delete a blog category'),
  -- Blog Posts
  ('blog_post', 'create', 'Create Blog Post', 'Create a new blog post'),
  ('blog_post', 'read', 'View Blog Posts', 'View blog posts'),
  ('blog_post', 'update', 'Update Blog Post', 'Update a blog post'),
  ('blog_post', 'soft_delete', 'Soft Delete Blog Post', 'Soft delete a blog post'),
  ('blog_post', 'restore', 'Restore Blog Post', 'Restore a soft-deleted blog post'),
  ('blog_post', 'delete', 'Delete Blog Post', 'Permanently delete a blog post'),
  -- Blog Reviews
  ('blog_review', 'create', 'Create Blog Review', 'Create a new blog review'),
  ('blog_review', 'read', 'View Blog Reviews', 'View blog reviews'),
  ('blog_review', 'update', 'Update Blog Review', 'Update a blog review'),
  ('blog_review', 'soft_delete', 'Soft Delete Blog Review', 'Soft delete a blog review'),
  ('blog_review', 'restore', 'Restore Blog Review', 'Restore a soft-deleted blog review'),
  ('blog_review', 'delete', 'Delete Blog Review', 'Permanently delete a blog review')
ON CONFLICT DO NOTHING;

-- Grant all new permissions to super_admin (role_id = 1)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions
WHERE resource IN (
  'faq_category', 'faq_category_translation', 'faq', 'faq_translation',
  'blog_category', 'blog_post', 'blog_review'
)
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- PART D: TABLE SUMMARY
-- ══════════════════════════════════════════════════════════════

INSERT INTO table_summary (table_name, is_active, is_inactive, is_deleted) VALUES
  ('faq_categories', 0, 0, 0),
  ('faq_category_translations', 0, 0, 0),
  ('faqs', 0, 0, 0),
  ('faq_translations', 0, 0, 0),
  ('blog_categories', 0, 0, 0),
  ('blog_posts', 0, 0, 0),
  ('blog_reviews', 0, 0, 0)
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- PART E: ACTIVITY LOG CONSTRAINT
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
    -- NEW: blog actions
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
    -- NEW: FAQ actions
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
