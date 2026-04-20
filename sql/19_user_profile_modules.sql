-- Migration 19: User Profile Modules
-- Creates: user_experience, user_social_medias, user_skills, user_languages, user_documents, user_projects
-- Updates: permissions, activity log CHECK constraint

-- ════════════════════════════════════════════════════════════
-- 1. user_experience
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_experience (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 BIGINT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    designation_id          BIGINT          REFERENCES designations(id) ON DELETE SET NULL,
    company_name            TEXT            NOT NULL,
    job_title               TEXT            NOT NULL,
    employment_type         TEXT            NOT NULL DEFAULT 'full_time'
                            CONSTRAINT chk_user_experience_type
                            CHECK (employment_type IN ('full_time','part_time','contract','internship','freelance','self_employed','volunteer','apprenticeship','other')),
    department              TEXT,
    location                TEXT,
    work_mode               TEXT            DEFAULT 'on_site'
                            CONSTRAINT chk_user_experience_work_mode
                            CHECK (work_mode IN ('on_site','remote','hybrid')),
    start_date              DATE            NOT NULL,
    end_date                DATE,
    is_current_job          BOOLEAN         NOT NULL DEFAULT FALSE,
    description             TEXT,
    key_achievements        TEXT,
    skills_used             TEXT,
    salary_range            TEXT,
    reference_name          TEXT,
    reference_phone         TEXT,
    reference_email         CITEXT,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    deleted_at              TIMESTAMPTZ     DEFAULT NULL,
    deleted_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_experience_user ON user_experience(user_id);
CREATE INDEX idx_user_experience_deleted ON user_experience(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_user_experience_updated_at BEFORE UPDATE ON user_experience
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- 2. user_social_medias
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_social_medias (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 BIGINT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    social_media_id         BIGINT          NOT NULL REFERENCES social_medias(id) ON DELETE RESTRICT,
    profile_url             TEXT            NOT NULL,
    username                TEXT,
    is_primary              BOOLEAN         NOT NULL DEFAULT FALSE,
    is_verified             BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    deleted_at              TIMESTAMPTZ     DEFAULT NULL,
    deleted_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_user_social_media UNIQUE (user_id, social_media_id)
);

CREATE INDEX idx_user_social_medias_user ON user_social_medias(user_id);
CREATE INDEX idx_user_social_medias_deleted ON user_social_medias(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_user_social_medias_updated_at BEFORE UPDATE ON user_social_medias
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- 3. user_skills
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_skills (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 BIGINT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    skill_id                BIGINT          NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    proficiency_level       TEXT            NOT NULL DEFAULT 'beginner'
                            CONSTRAINT chk_user_skills_proficiency
                            CHECK (proficiency_level IN ('beginner','elementary','intermediate','advanced','expert')),
    years_of_experience     NUMERIC(4,1),
    is_primary              BOOLEAN         NOT NULL DEFAULT FALSE,
    certificate_url         TEXT,
    endorsement_count       INT             NOT NULL DEFAULT 0,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    deleted_at              TIMESTAMPTZ     DEFAULT NULL,
    deleted_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_user_skill UNIQUE (user_id, skill_id)
);

CREATE INDEX idx_user_skills_user ON user_skills(user_id);
CREATE INDEX idx_user_skills_deleted ON user_skills(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_user_skills_updated_at BEFORE UPDATE ON user_skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- 4. user_languages
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_languages (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 BIGINT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    language_id             BIGINT          NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
    proficiency_level       TEXT            NOT NULL DEFAULT 'basic'
                            CONSTRAINT chk_user_languages_proficiency
                            CHECK (proficiency_level IN ('basic','conversational','professional','fluent','native')),
    can_read                BOOLEAN         NOT NULL DEFAULT FALSE,
    can_write               BOOLEAN         NOT NULL DEFAULT FALSE,
    can_speak               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_primary              BOOLEAN         NOT NULL DEFAULT FALSE,
    is_native               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    deleted_at              TIMESTAMPTZ     DEFAULT NULL,
    deleted_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_user_language UNIQUE (user_id, language_id)
);

CREATE INDEX idx_user_languages_user ON user_languages(user_id);
CREATE INDEX idx_user_languages_deleted ON user_languages(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_user_languages_updated_at BEFORE UPDATE ON user_languages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- 5. user_documents
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_documents (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 BIGINT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    document_type_id        BIGINT          NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
    document_number         TEXT,
    file_url                TEXT            NOT NULL,
    file_name               TEXT,
    file_size_kb            INT,
    file_format             TEXT,
    issue_date              DATE,
    expiry_date             DATE,
    issuing_authority       TEXT,
    verification_status     TEXT            NOT NULL DEFAULT 'pending'
                            CONSTRAINT chk_user_documents_verification
                            CHECK (verification_status IN ('pending','under_review','verified','rejected','expired','reupload')),
    verified_by             BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    verified_at             TIMESTAMPTZ,
    rejection_reason        TEXT,
    admin_notes             TEXT,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    deleted_at              TIMESTAMPTZ     DEFAULT NULL,
    deleted_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_documents_user ON user_documents(user_id);
CREATE INDEX idx_user_documents_deleted ON user_documents(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_documents_status ON user_documents(verification_status);

CREATE TRIGGER tr_user_documents_updated_at BEFORE UPDATE ON user_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- 6. user_projects
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_projects (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                 BIGINT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    project_title           TEXT            NOT NULL,
    project_code            CITEXT,
    project_type            TEXT            NOT NULL DEFAULT 'personal'
                            CONSTRAINT chk_user_projects_type
                            CHECK (project_type IN ('personal','academic','professional','freelance','open_source','research','hackathon','internship','client','government','ngo','other')),
    description             TEXT,
    objectives              TEXT,
    role_in_project         TEXT,
    responsibilities        TEXT,
    team_size               SMALLINT,
    is_solo_project         BOOLEAN         NOT NULL DEFAULT FALSE,
    organization_name       TEXT,
    client_name             TEXT,
    industry                TEXT,
    technologies_used       TEXT,
    tools_used              TEXT,
    programming_languages   TEXT,
    frameworks              TEXT,
    databases_used          TEXT,
    platform                TEXT,
    start_date              DATE,
    end_date                DATE,
    is_ongoing              BOOLEAN         NOT NULL DEFAULT FALSE,
    duration_months         SMALLINT,
    project_status          TEXT            NOT NULL DEFAULT 'completed'
                            CONSTRAINT chk_user_projects_status
                            CHECK (project_status IN ('planning','in_progress','completed','on_hold','cancelled','abandoned')),
    key_achievements        TEXT,
    challenges_faced        TEXT,
    lessons_learned         TEXT,
    impact_summary          TEXT,
    users_served            TEXT,
    project_url             TEXT,
    repository_url          TEXT,
    demo_url                TEXT,
    documentation_url       TEXT,
    thumbnail_url           TEXT,
    case_study_url          TEXT,
    is_featured             BOOLEAN         NOT NULL DEFAULT FALSE,
    is_published            BOOLEAN         NOT NULL DEFAULT FALSE,
    awards                  TEXT,
    certifications          TEXT,
    reference_name          TEXT,
    reference_email         CITEXT,
    reference_phone         TEXT,
    display_order           SMALLINT        DEFAULT 0,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    deleted_at              TIMESTAMPTZ     DEFAULT NULL,
    deleted_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_projects_user ON user_projects(user_id);
CREATE INDEX idx_user_projects_deleted ON user_projects(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_projects_status ON user_projects(project_status);

CREATE TRIGGER tr_user_projects_updated_at BEFORE UPDATE ON user_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- 7. Permissions for all user profile modules
-- ════════════════════════════════════════════════════════════

-- Ensure the permissions CHECK constraint allows soft_delete and restore
ALTER TABLE permissions DROP CONSTRAINT IF EXISTS chk_permission_action;
ALTER TABLE permissions ADD CONSTRAINT chk_permission_action CHECK (action = ANY(ARRAY[
    'create','read','update','delete','publish','unpublish',
    'manage_role','manage_permission','export','import',
    'enroll','unenroll','reorder','duplicate','refund','approve','reject',
    'activate','deactivate','soft_delete','restore'
]));

-- user_profile permissions
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_profile', 'create',      'Create User Profile',       'Create user profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_profile', 'read',        'View User Profiles',        'View user profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_profile', 'update',      'Update User Profile',       'Update user profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_profile', 'delete',      'Delete User Profile',       'Permanently delete user profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_profile', 'soft_delete', 'Soft Delete User Profile',  'Soft delete user profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_profile', 'restore',     'Restore User Profile',      'Restore soft-deleted user profile records')
ON CONFLICT (resource, action) DO NOTHING;

-- user_education permissions
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_education', 'create',      'Create User Education',       'Create user education records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_education', 'read',        'View User Education',         'View user education records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_education', 'update',      'Update User Education',       'Update user education records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_education', 'delete',      'Delete User Education',       'Permanently delete user education records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_education', 'soft_delete', 'Soft Delete User Education',  'Soft delete user education records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_education', 'restore',     'Restore User Education',      'Restore soft-deleted user education records')
ON CONFLICT (resource, action) DO NOTHING;

-- user_experience permissions
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_experience', 'create',      'Create User Experience',       'Create user experience records'),
  ('user_experience', 'read',        'View User Experience',         'View user experience records'),
  ('user_experience', 'update',      'Update User Experience',       'Update user experience records'),
  ('user_experience', 'delete',      'Delete User Experience',       'Permanently delete user experience records'),
  ('user_experience', 'soft_delete', 'Soft Delete User Experience',  'Soft delete user experience records'),
  ('user_experience', 'restore',     'Restore User Experience',      'Restore soft-deleted user experience records')
ON CONFLICT (resource, action) DO NOTHING;

-- user_social_media permissions
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_social_media', 'create',      'Create User Social Media',       'Create user social media records'),
  ('user_social_media', 'read',        'View User Social Media',         'View user social media records'),
  ('user_social_media', 'update',      'Update User Social Media',       'Update user social media records'),
  ('user_social_media', 'delete',      'Delete User Social Media',       'Permanently delete user social media records'),
  ('user_social_media', 'soft_delete', 'Soft Delete User Social Media',  'Soft delete user social media records'),
  ('user_social_media', 'restore',     'Restore User Social Media',      'Restore soft-deleted user social media records')
ON CONFLICT (resource, action) DO NOTHING;

-- user_skill permissions
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_skill', 'create',      'Create User Skill',       'Create user skill records'),
  ('user_skill', 'read',        'View User Skills',        'View user skill records'),
  ('user_skill', 'update',      'Update User Skill',       'Update user skill records'),
  ('user_skill', 'delete',      'Delete User Skill',       'Permanently delete user skill records'),
  ('user_skill', 'soft_delete', 'Soft Delete User Skill',  'Soft delete user skill records'),
  ('user_skill', 'restore',     'Restore User Skill',      'Restore soft-deleted user skill records')
ON CONFLICT (resource, action) DO NOTHING;

-- user_language permissions
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_language', 'create',      'Create User Language',       'Create user language records'),
  ('user_language', 'read',        'View User Languages',        'View user language records'),
  ('user_language', 'update',      'Update User Language',       'Update user language records'),
  ('user_language', 'delete',      'Delete User Language',       'Permanently delete user language records'),
  ('user_language', 'soft_delete', 'Soft Delete User Language',  'Soft delete user language records'),
  ('user_language', 'restore',     'Restore User Language',      'Restore soft-deleted user language records')
ON CONFLICT (resource, action) DO NOTHING;

-- user_document permissions
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_document', 'create',      'Create User Document',       'Create user document records'),
  ('user_document', 'read',        'View User Documents',        'View user document records'),
  ('user_document', 'update',      'Update User Document',       'Update user document records'),
  ('user_document', 'delete',      'Delete User Document',       'Permanently delete user document records'),
  ('user_document', 'soft_delete', 'Soft Delete User Document',  'Soft delete user document records'),
  ('user_document', 'restore',     'Restore User Document',      'Restore soft-deleted user document records')
ON CONFLICT (resource, action) DO NOTHING;

-- user_project permissions
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('user_project', 'create',      'Create User Project',       'Create user project records'),
  ('user_project', 'read',        'View User Projects',        'View user project records'),
  ('user_project', 'update',      'Update User Project',       'Update user project records'),
  ('user_project', 'delete',      'Delete User Project',       'Permanently delete user project records'),
  ('user_project', 'soft_delete', 'Soft Delete User Project',  'Soft delete user project records'),
  ('user_project', 'restore',     'Restore User Project',      'Restore soft-deleted user project records')
ON CONFLICT (resource, action) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 8. Update Activity Log CHECK constraint
-- ════════════════════════════════════════════════════════════
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
  -- User Profile
  'user_profile_created', 'user_profile_updated', 'user_profile_deleted', 'user_profile_soft_deleted', 'user_profile_restored',
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
  -- AI Generation
  'ai_content_generated', 'ai_translation_generated', 'ai_bulk_translation_generated',
  'ai_sub_category_content_generated', 'ai_sub_category_translation_generated', 'ai_bulk_sub_category_translation_generated',
  'ai_sample_data_generated', 'ai_master_data_updated', 'ai_resume_content_generated'
]::text[]));
