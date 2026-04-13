-- ============================================================
-- Table: learning_goals
-- Purpose: List of why students are learning
-- ============================================================
-- Used by: student_profiles, student_interests
-- Helps in recommending courses and personalizing experience
-- ============================================================


CREATE TABLE learning_goals (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Learning Goal Info ──
    name                CITEXT          NOT NULL UNIQUE,
    description         TEXT,
    icon_url            TEXT,
    display_order       INT             NOT NULL DEFAULT 0,         -- order in dropdown/UI

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,

    -- ── Status ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Timestamps ──
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ
);


-- ── Indexes ──

CREATE INDEX idx_learning_goals_name ON learning_goals USING gin (name gin_trgm_ops)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_learning_goals_order ON learning_goals (display_order)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_learning_goals_active ON learning_goals (is_active)
    WHERE is_deleted = FALSE;


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_learning_goals_content_trgm
    ON learning_goals
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(description::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_learning_goals_updated_at
    BEFORE UPDATE ON learning_goals
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

INSERT INTO learning_goals (name, description, display_order) VALUES
    ('Career Switch',               'Switching to a completely new career or industry',                         1),
    ('Upskilling',                  'Learning new skills to grow in current career',                            2),
    ('Job Preparation',             'Preparing for job interviews and placement',                               3),
    ('Freelancing',                 'Learning skills to work as a freelancer',                                  4),
    ('Start a Business',            'Learning entrepreneurship and startup skills',                             5),
    ('Academic Requirement',        'Learning as part of college/university coursework',                        6),
    ('Exam Preparation',            'Preparing for competitive exams — GATE, CAT, UPSC, JEE, NEET',            7),
    ('Certification',               'Earning a professional certification — AWS, Google, PMP, etc.',            8),
    ('Research',                    'Academic or professional research work',                                   9),
    ('Teaching / Instruction',      'Learning to teach or create courses on a topic',                           10),
    ('Personal Project',            'Building a personal project or portfolio',                                 11),
    ('Hobby / Interest',            'Learning for personal enjoyment and curiosity',                            12),
    ('Company Training',            'Employer-sponsored learning and development',                              13),
    ('School / College Student',    'Currently a student — supplementing formal education',                     14),
    ('Stay Updated',                'Keeping up with industry trends and new technologies',                     15),
    ('Open Source Contribution',    'Learning to contribute to open-source projects',                           16),
    ('Community / Social Impact',   'Learning to create positive social change',                                17),
    ('Just Exploring',              'No specific goal — exploring different topics',                             18);


-- ── Comments ──
