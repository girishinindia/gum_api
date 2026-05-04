-- ═══════════════════════════════════════════════════════════════
--  28 – Assessments System
--  Creates 6 tables: assessments, assessment_translations,
--  assessment_attachments, assessment_attachment_translations,
--  assessment_solutions, assessment_solution_translations.
--  Plus indexes, triggers, permissions, and activity-log update.
--
--  Scope mapping:
--    exercise         → sub_topic_id  (sub-topic level)
--    assignment       → topic_id      (topic level)
--    mini_project     → chapter_id    (chapter level)
--    capstone_project → course_id     (course level)
-- ═══════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
--  1. ASSESSMENTS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessments (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Assessment Type ──
    assessment_type         TEXT            NOT NULL DEFAULT 'assignment'
                            CONSTRAINT chk_assessments_assessment_type
                            CHECK (assessment_type IN (
                                'exercise',
                                'assignment',
                                'mini_project',
                                'capstone_project'
                            )),

    -- ── Scope ──
    assessment_scope        TEXT            NOT NULL DEFAULT 'topic'
                            CONSTRAINT chk_assessments_scope
                            CHECK (assessment_scope IN ('sub_topic', 'topic', 'chapter', 'course')),

    -- ── Relationships (one per scope) ──
    sub_topic_id            BIGINT          REFERENCES sub_topics(id) ON DELETE RESTRICT,
    topic_id                BIGINT          REFERENCES topics(id) ON DELETE RESTRICT,
    chapter_id              BIGINT          REFERENCES chapters(id) ON DELETE RESTRICT,
    course_id               BIGINT          REFERENCES courses(id) ON DELETE RESTRICT,

    -- ── Scope-FK Integrity: exactly one FK set per scope ──
    CONSTRAINT chk_assessments_scope_fk CHECK (
        CASE assessment_scope
            WHEN 'sub_topic' THEN sub_topic_id IS NOT NULL AND topic_id IS NULL     AND chapter_id IS NULL AND course_id IS NULL
            WHEN 'topic'     THEN topic_id     IS NOT NULL AND sub_topic_id IS NULL AND chapter_id IS NULL AND course_id IS NULL
            WHEN 'chapter'   THEN chapter_id   IS NOT NULL AND sub_topic_id IS NULL AND topic_id IS NULL   AND course_id IS NULL
            WHEN 'course'    THEN course_id    IS NOT NULL AND sub_topic_id IS NULL AND topic_id IS NULL   AND chapter_id IS NULL
        END
    ),

    -- ── Type-Scope Integrity ──
    CONSTRAINT chk_assessments_type_scope CHECK (
        CASE assessment_type
            WHEN 'exercise'         THEN assessment_scope = 'sub_topic'
            WHEN 'assignment'       THEN assessment_scope = 'topic'
            WHEN 'mini_project'     THEN assessment_scope = 'chapter'
            WHEN 'capstone_project' THEN assessment_scope = 'course'
        END
    ),

    -- ── Content Type ──
    content_type            TEXT            NOT NULL DEFAULT 'coding'
                            CONSTRAINT chk_assessments_content_type
                            CHECK (content_type IN (
                                'coding',
                                'github',
                                'pdf',
                                'image',
                                'mixed'
                            )),

    -- ── Identity ──
    slug                    CITEXT,

    -- ── Scoring ──
    points                  NUMERIC(6,2)    NOT NULL DEFAULT 0.00,

    -- ── Settings ──
    difficulty_level        TEXT            DEFAULT 'medium'
                            CONSTRAINT chk_assessments_difficulty
                            CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
    due_days                SMALLINT,
    estimated_hours         NUMERIC(5,1),
    is_mandatory            BOOLEAN         NOT NULL DEFAULT TRUE,

    -- ── Display ──
    display_order           SMALLINT        NOT NULL DEFAULT 0,

    -- ── Status ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,

    -- ── Soft Delete ──
    deleted_at              TIMESTAMPTZ,

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessments_sub_topic    ON assessments (sub_topic_id);
CREATE INDEX IF NOT EXISTS idx_assessments_topic        ON assessments (topic_id);
CREATE INDEX IF NOT EXISTS idx_assessments_chapter      ON assessments (chapter_id);
CREATE INDEX IF NOT EXISTS idx_assessments_course       ON assessments (course_id);
CREATE INDEX IF NOT EXISTS idx_assessments_type         ON assessments (assessment_type);
CREATE INDEX IF NOT EXISTS idx_assessments_scope        ON assessments (assessment_scope);
CREATE INDEX IF NOT EXISTS idx_assessments_slug         ON assessments (slug);
CREATE INDEX IF NOT EXISTS idx_assessments_active       ON assessments (is_active);
CREATE INDEX IF NOT EXISTS idx_assessments_deleted      ON assessments (deleted_at);
CREATE INDEX IF NOT EXISTS idx_assessments_difficulty   ON assessments (difficulty_level);

CREATE TRIGGER trg_assessments_updated
    BEFORE UPDATE ON assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();


-- ══════════════════════════════════════════════════════════════
--  2. ASSESSMENT TRANSLATIONS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessment_translations (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationships ──
    assessment_id           BIGINT          NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
    language_id             BIGINT          NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,

    -- ── Content ──
    title                   CITEXT          NOT NULL,
    description             TEXT,
    instructions            TEXT,
    html_content            TEXT,                                    -- the actual exercise/assignment/project problem as rendered HTML
    tech_stack              JSONB           DEFAULT '[]'::JSONB,    -- ["React", "Node.js", "PostgreSQL"]
    learning_outcomes       JSONB           DEFAULT '[]'::JSONB,    -- ["Build REST APIs", "Implement auth"]

    -- ── Media ──
    image_1                 TEXT,
    image_2                 TEXT,

    -- ── Tags ──
    tags                    JSONB           DEFAULT '[]'::JSONB,

    -- ── SEO: Meta ──
    meta_title              TEXT,
    meta_description        TEXT,
    meta_keywords           TEXT,
    canonical_url           TEXT,

    -- ── SEO: Open Graph ──
    og_site_name            TEXT,
    og_title                TEXT,
    og_description          TEXT,
    og_type                 TEXT,
    og_image                TEXT,
    og_url                  TEXT,

    -- ── SEO: Twitter Card ──
    twitter_site            TEXT,
    twitter_title           TEXT,
    twitter_description     TEXT,
    twitter_image           TEXT,
    twitter_card            TEXT            DEFAULT 'summary_large_image',

    -- ── SEO: Other ──
    robots_directive        TEXT            DEFAULT 'index,follow',
    focus_keyword           TEXT,

    -- ── Full-Text Search ──
    search_vector           TSVECTOR        GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(instructions, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(meta_title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(meta_description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(focus_keyword, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(tags::TEXT, '')), 'D')
    ) STORED,

    -- ── Structured Data ──
    structured_data         JSONB           DEFAULT '[]'::JSONB,

    -- ── Status ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,

    -- ── Soft Delete ──
    deleted_at              TIMESTAMPTZ,

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    -- ── Unique: one translation per assessment per language ──
    CONSTRAINT uq_assessment_translation UNIQUE (assessment_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_trans_assessment  ON assessment_translations (assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_trans_language    ON assessment_translations (language_id);
CREATE INDEX IF NOT EXISTS idx_assessment_trans_active      ON assessment_translations (is_active);
CREATE INDEX IF NOT EXISTS idx_assessment_trans_deleted     ON assessment_translations (deleted_at);
CREATE INDEX IF NOT EXISTS idx_assessment_trans_search      ON assessment_translations USING GIN (search_vector);

CREATE TRIGGER trg_assessment_translations_updated
    BEFORE UPDATE ON assessment_translations
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();


-- ══════════════════════════════════════════════════════════════
--  3. ASSESSMENT ATTACHMENTS (starter files, PDFs, images)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessment_attachments (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationships ──
    assessment_id           BIGINT          NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,

    -- ── Attachment Type ──
    attachment_type         TEXT            NOT NULL
                            CONSTRAINT chk_assessment_attachments_type
                            CHECK (attachment_type IN (
                                'coding_file',
                                'github_link',
                                'pdf',
                                'image',
                                'other'
                            )),

    -- ── File Info ──
    file_url                TEXT,
    github_url              TEXT,
    file_name               TEXT,
    file_size_bytes         BIGINT,
    mime_type               TEXT,

    -- ── Display ──
    display_order           SMALLINT        NOT NULL DEFAULT 0,

    -- ── Status ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,

    -- ── Soft Delete ──
    deleted_at              TIMESTAMPTZ,

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_attach_assessment ON assessment_attachments (assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_attach_type       ON assessment_attachments (attachment_type);
CREATE INDEX IF NOT EXISTS idx_assessment_attach_active     ON assessment_attachments (is_active);
CREATE INDEX IF NOT EXISTS idx_assessment_attach_deleted    ON assessment_attachments (deleted_at);

CREATE TRIGGER trg_assessment_attachments_updated
    BEFORE UPDATE ON assessment_attachments
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();


-- ══════════════════════════════════════════════════════════════
--  4. ASSESSMENT ATTACHMENT TRANSLATIONS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessment_attachment_translations (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationships ──
    assessment_attachment_id BIGINT         NOT NULL REFERENCES assessment_attachments(id) ON DELETE RESTRICT,
    language_id             BIGINT          NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,

    -- ── Content ──
    title                   TEXT            NOT NULL,
    description             TEXT,

    -- ── Status ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,

    -- ── Soft Delete ──
    deleted_at              TIMESTAMPTZ,

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    -- ── Unique: one translation per attachment per language ──
    CONSTRAINT uq_assessment_attachment_translation UNIQUE (assessment_attachment_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_attach_trans_attach   ON assessment_attachment_translations (assessment_attachment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_attach_trans_lang     ON assessment_attachment_translations (language_id);
CREATE INDEX IF NOT EXISTS idx_assessment_attach_trans_active   ON assessment_attachment_translations (is_active);
CREATE INDEX IF NOT EXISTS idx_assessment_attach_trans_deleted  ON assessment_attachment_translations (deleted_at);

CREATE TRIGGER trg_assessment_attachment_translations_updated
    BEFORE UPDATE ON assessment_attachment_translations
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();


-- ══════════════════════════════════════════════════════════════
--  5. ASSESSMENT SOLUTIONS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessment_solutions (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationships ──
    assessment_id           BIGINT          NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,

    -- ── Solution Type ──
    solution_type           TEXT            NOT NULL
                            CONSTRAINT chk_assessment_solutions_type
                            CHECK (solution_type IN (
                                'html',
                                'coding_file',
                                'github_link',
                                'pdf',
                                'image',
                                'video',
                                'zip',
                                'other'
                            )),

    -- ── File Info ──
    file_url                TEXT,
    github_url              TEXT,
    video_url               TEXT,
    zip_url                 TEXT,
    file_name               TEXT,
    file_size_bytes         BIGINT,
    mime_type               TEXT,

    -- ── Video Metadata ──
    video_duration_seconds  INT,

    -- ── Display ──
    display_order           SMALLINT        NOT NULL DEFAULT 0,

    -- ── Status ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,

    -- ── Soft Delete ──
    deleted_at              TIMESTAMPTZ,

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_sol_assessment    ON assessment_solutions (assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sol_type          ON assessment_solutions (solution_type);
CREATE INDEX IF NOT EXISTS idx_assessment_sol_active        ON assessment_solutions (is_active);
CREATE INDEX IF NOT EXISTS idx_assessment_sol_deleted       ON assessment_solutions (deleted_at);

CREATE TRIGGER trg_assessment_solutions_updated
    BEFORE UPDATE ON assessment_solutions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();


-- ══════════════════════════════════════════════════════════════
--  6. ASSESSMENT SOLUTION TRANSLATIONS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessment_solution_translations (

    -- ── Primary Key ──
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Relationships ──
    assessment_solution_id  BIGINT          NOT NULL REFERENCES assessment_solutions(id) ON DELETE RESTRICT,
    language_id             BIGINT          NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,

    -- ── Content ──
    title                   TEXT            NOT NULL,
    description             TEXT,
    html_content            TEXT,                                    -- solution HTML content (for exercise & assignment solutions)

    -- ── Video Content ──
    video_title             TEXT,
    video_description       TEXT,
    video_thumbnail         TEXT,

    -- ── Status ──
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,

    -- ── Soft Delete ──
    deleted_at              TIMESTAMPTZ,

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    -- ── Unique: one translation per solution per language ──
    CONSTRAINT uq_assessment_solution_translation UNIQUE (assessment_solution_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_sol_trans_solution ON assessment_solution_translations (assessment_solution_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sol_trans_lang     ON assessment_solution_translations (language_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sol_trans_active   ON assessment_solution_translations (is_active);
CREATE INDEX IF NOT EXISTS idx_assessment_sol_trans_deleted  ON assessment_solution_translations (deleted_at);

CREATE TRIGGER trg_assessment_solution_translations_updated
    BEFORE UPDATE ON assessment_solution_translations
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();


-- ══════════════════════════════════════════════════════════════
--  7. PERMISSIONS
-- ══════════════════════════════════════════════════════════════

-- ── Assessment permissions ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('assessment', 'create',      'Create Assessment',       'Create assessment records'),
  ('assessment', 'read',        'View Assessments',        'View assessment records'),
  ('assessment', 'update',      'Update Assessment',       'Update assessment records'),
  ('assessment', 'delete',      'Delete Assessment',       'Permanently delete assessment records'),
  ('assessment', 'soft_delete', 'Soft Delete Assessment',  'Soft delete assessment records'),
  ('assessment', 'restore',     'Restore Assessment',      'Restore soft-deleted assessment records'),
  ('assessment', 'activate',    'Activate Assessment',     'Toggle active status of assessment records')
ON CONFLICT (resource, action) DO NOTHING;

-- ── Assessment Translation permissions ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('assessment_translation', 'create',      'Create Assessment Translation',       'Create assessment translation records'),
  ('assessment_translation', 'read',        'View Assessment Translations',        'View assessment translation records'),
  ('assessment_translation', 'update',      'Update Assessment Translation',       'Update assessment translation records'),
  ('assessment_translation', 'delete',      'Delete Assessment Translation',       'Permanently delete assessment translation records'),
  ('assessment_translation', 'soft_delete', 'Soft Delete Assessment Translation',  'Soft delete assessment translation records'),
  ('assessment_translation', 'restore',     'Restore Assessment Translation',      'Restore soft-deleted assessment translation records'),
  ('assessment_translation', 'activate',    'Activate Assessment Translation',     'Toggle active status of assessment translation records')
ON CONFLICT (resource, action) DO NOTHING;

-- ── Assessment Attachment permissions ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('assessment_attachment', 'create',      'Create Assessment Attachment',       'Create assessment attachment records'),
  ('assessment_attachment', 'read',        'View Assessment Attachments',        'View assessment attachment records'),
  ('assessment_attachment', 'update',      'Update Assessment Attachment',       'Update assessment attachment records'),
  ('assessment_attachment', 'delete',      'Delete Assessment Attachment',       'Permanently delete assessment attachment records'),
  ('assessment_attachment', 'soft_delete', 'Soft Delete Assessment Attachment',  'Soft delete assessment attachment records'),
  ('assessment_attachment', 'restore',     'Restore Assessment Attachment',      'Restore soft-deleted assessment attachment records'),
  ('assessment_attachment', 'activate',    'Activate Assessment Attachment',     'Toggle active status of assessment attachment records')
ON CONFLICT (resource, action) DO NOTHING;

-- ── Assessment Attachment Translation permissions ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('assessment_attachment_translation', 'create',      'Create Assessment Attachment Translation',       'Create assessment attachment translation records'),
  ('assessment_attachment_translation', 'read',        'View Assessment Attachment Translations',        'View assessment attachment translation records'),
  ('assessment_attachment_translation', 'update',      'Update Assessment Attachment Translation',       'Update assessment attachment translation records'),
  ('assessment_attachment_translation', 'delete',      'Delete Assessment Attachment Translation',       'Permanently delete assessment attachment translation records'),
  ('assessment_attachment_translation', 'soft_delete', 'Soft Delete Assessment Attachment Translation',  'Soft delete assessment attachment translation records'),
  ('assessment_attachment_translation', 'restore',     'Restore Assessment Attachment Translation',      'Restore soft-deleted assessment attachment translation records'),
  ('assessment_attachment_translation', 'activate',    'Activate Assessment Attachment Translation',     'Toggle active status of assessment attachment translation records')
ON CONFLICT (resource, action) DO NOTHING;

-- ── Assessment Solution permissions ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('assessment_solution', 'create',      'Create Assessment Solution',       'Create assessment solution records'),
  ('assessment_solution', 'read',        'View Assessment Solutions',        'View assessment solution records'),
  ('assessment_solution', 'update',      'Update Assessment Solution',       'Update assessment solution records'),
  ('assessment_solution', 'delete',      'Delete Assessment Solution',       'Permanently delete assessment solution records'),
  ('assessment_solution', 'soft_delete', 'Soft Delete Assessment Solution',  'Soft delete assessment solution records'),
  ('assessment_solution', 'restore',     'Restore Assessment Solution',      'Restore soft-deleted assessment solution records'),
  ('assessment_solution', 'activate',    'Activate Assessment Solution',     'Toggle active status of assessment solution records')
ON CONFLICT (resource, action) DO NOTHING;

-- ── Assessment Solution Translation permissions ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('assessment_solution_translation', 'create',      'Create Assessment Solution Translation',       'Create assessment solution translation records'),
  ('assessment_solution_translation', 'read',        'View Assessment Solution Translations',        'View assessment solution translation records'),
  ('assessment_solution_translation', 'update',      'Update Assessment Solution Translation',       'Update assessment solution translation records'),
  ('assessment_solution_translation', 'delete',      'Delete Assessment Solution Translation',       'Permanently delete assessment solution translation records'),
  ('assessment_solution_translation', 'soft_delete', 'Soft Delete Assessment Solution Translation',  'Soft delete assessment solution translation records'),
  ('assessment_solution_translation', 'restore',     'Restore Assessment Solution Translation',      'Restore soft-deleted assessment solution translation records'),
  ('assessment_solution_translation', 'activate',    'Activate Assessment Solution Translation',     'Toggle active status of assessment solution translation records')
ON CONFLICT (resource, action) DO NOTHING;


-- ══════════════════════════════════════════════════════════════
--  8. UPDATE ACTIVITY LOG ACTION CHECK
-- ══════════════════════════════════════════════════════════════

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
  -- Assessments
  'assessment_created', 'assessment_updated', 'assessment_deleted', 'assessment_soft_deleted', 'assessment_restored',
  'assessment_translation_created', 'assessment_translation_updated', 'assessment_translation_deleted', 'assessment_translation_soft_deleted', 'assessment_translation_restored',
  'assessment_attachment_created', 'assessment_attachment_updated', 'assessment_attachment_deleted', 'assessment_attachment_soft_deleted', 'assessment_attachment_restored',
  'assessment_attachment_translation_created', 'assessment_attachment_translation_updated', 'assessment_attachment_translation_deleted', 'assessment_attachment_translation_soft_deleted', 'assessment_attachment_translation_restored',
  'assessment_solution_created', 'assessment_solution_updated', 'assessment_solution_deleted', 'assessment_solution_soft_deleted', 'assessment_solution_restored',
  'assessment_solution_translation_created', 'assessment_solution_translation_updated', 'assessment_solution_translation_deleted', 'assessment_solution_translation_soft_deleted', 'assessment_solution_translation_restored'
]::text[]));
