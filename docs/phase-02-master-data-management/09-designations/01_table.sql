-- ============================================================
-- Table: designations
-- Purpose: List of job titles / designations
-- ============================================================
-- Standalone — not tied to a specific department
-- Same designation (e.g., 'Senior Developer') can exist across departments
-- Level hierarchy allows seniority-based sorting and access control
-- ============================================================


CREATE TABLE designations (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Designation Info ──
    name                CITEXT          NOT NULL UNIQUE,
    code                CITEXT          UNIQUE,                     -- 'JR-DEV', 'CTO', 'VP'
    level               INT             NOT NULL DEFAULT 1,         -- 1=entry → 10=C-suite
    level_band          TEXT            NOT NULL DEFAULT 'entry'
                        CONSTRAINT chk_designations_band
                        CHECK (level_band IN (
                            'intern',           -- level 0 — trainees, interns
                            'entry',            -- level 1-2 — freshers
                            'mid',              -- level 3-4 — experienced
                            'senior',           -- level 5-6 — specialists
                            'lead',             -- level 7 — team leads
                            'manager',          -- level 8 — department managers
                            'director',         -- level 9 — directors, VPs
                            'executive'         -- level 10 — CXO, founder
                        )),
    description         TEXT,

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

CREATE INDEX idx_designations_name ON designations USING gin (name gin_trgm_ops)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_designations_code ON designations (code)
    WHERE is_deleted = FALSE AND code IS NOT NULL;

CREATE INDEX idx_designations_level ON designations (level)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_designations_band ON designations (level_band)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_designations_active ON designations (is_active)
    WHERE is_deleted = FALSE;


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_designations_content_trgm
    ON designations
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(description::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_designations_updated_at
    BEFORE UPDATE ON designations
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

INSERT INTO designations (name, code, level, level_band, description) VALUES
    -- Intern (level 0)
    ('Intern',                      'INT',      0,  'intern',       'Short-term internship role — learning and assisting'),
    ('Trainee',                     'TRN',      0,  'intern',       'Training period before full employment'),

    -- Entry (level 1-2)
    ('Junior Developer',            'JR-DEV',   1,  'entry',        'Entry-level software developer'),
    ('Junior Designer',             'JR-DES',   1,  'entry',        'Entry-level UI/UX or graphic designer'),
    ('Junior Content Writer',       'JR-CW',    1,  'entry',        'Entry-level content creator'),
    ('Executive',                   'EXEC',     2,  'entry',        'General executive role — operations, admin, support'),
    ('HR Executive',                'HR-EXEC',  2,  'entry',        'Human resources executive'),
    ('Marketing Executive',         'MKT-EXEC', 2,  'entry',        'Marketing team executive'),
    ('Sales Executive',             'SLS-EXEC', 2,  'entry',        'Sales team executive'),
    ('Support Executive',           'SUP-EXEC', 2,  'entry',        'Customer support executive'),
    ('Accountant',                  'ACCT',     2,  'entry',        'Accounts and finance executive'),

    -- Mid (level 3-4)
    ('Software Developer',          'DEV',      3,  'mid',          'Mid-level software developer'),
    ('UI/UX Designer',              'DES',      3,  'mid',          'Mid-level designer'),
    ('Content Creator',             'CC',       3,  'mid',          'Mid-level content creator'),
    ('QA Engineer',                 'QA',       3,  'mid',          'Quality assurance engineer'),
    ('Data Analyst',                'DA',       3,  'mid',          'Data analysis and reporting'),
    ('System Administrator',        'SYS-ADM',  3,  'mid',          'Server and infrastructure management'),
    ('Video Editor',                'VID-ED',   3,  'mid',          'Course video editing and production'),
    ('HR Specialist',               'HR-SPEC',  4,  'mid',          'Specialized HR — recruitment, payroll, etc.'),
    ('Marketing Specialist',        'MKT-SPEC', 4,  'mid',          'Specialized marketing — SEO, SEM, social'),
    ('Financial Analyst',           'FIN-AN',   4,  'mid',          'Financial analysis and planning'),

    -- Senior (level 5-6)
    ('Senior Developer',            'SR-DEV',   5,  'senior',       'Senior software developer / engineer'),
    ('Senior Designer',             'SR-DES',   5,  'senior',       'Senior UI/UX designer'),
    ('Senior Content Writer',       'SR-CW',    5,  'senior',       'Senior content creator / editor'),
    ('Senior QA Engineer',          'SR-QA',    5,  'senior',       'Senior quality assurance engineer'),
    ('Senior Data Scientist',       'SR-DS',    5,  'senior',       'Senior data science / ML engineer'),
    ('DevOps Engineer',             'DEVOPS',   5,  'senior',       'Senior DevOps / cloud engineer'),
    ('Staff Engineer',              'STAFF',    6,  'senior',       'Staff-level engineer — architecture and mentoring'),
    ('Principal Engineer',          'PRINC',    6,  'senior',       'Principal engineer — technical direction'),
    ('Senior HR Manager',           'SR-HR',    6,  'senior',       'Senior HR management'),

    -- Lead (level 7)
    ('Tech Lead',                   'TL',       7,  'lead',         'Technical team lead — code reviews, architecture'),
    ('Design Lead',                 'DL',       7,  'lead',         'Design team lead'),
    ('Content Lead',                'CL',       7,  'lead',         'Content team lead'),
    ('QA Lead',                     'QL',       7,  'lead',         'QA team lead'),
    ('Project Manager',             'PM',       7,  'lead',         'Project management — Agile/Scrum'),
    ('Product Manager',             'PDM',      7,  'lead',         'Product strategy and roadmap'),

    -- Manager (level 8)
    ('Engineering Manager',         'EM',       8,  'manager',      'Manages engineering team(s)'),
    ('Design Manager',              'DM',       8,  'manager',      'Manages design team'),
    ('Content Manager',             'CM',       8,  'manager',      'Manages content team'),
    ('HR Manager',                  'HRM',      8,  'manager',      'Manages HR department'),
    ('Finance Manager',             'FM',       8,  'manager',      'Manages finance/accounts department'),
    ('Marketing Manager',           'MM',       8,  'manager',      'Manages marketing department'),
    ('Sales Manager',               'SM',       8,  'manager',      'Manages sales department'),
    ('Operations Manager',          'OM',       8,  'manager',      'Manages daily operations'),

    -- Director (level 9)
    ('Director of Engineering',     'DOE',      9,  'director',     'Oversees all engineering teams'),
    ('Director of Product',         'DOP',      9,  'director',     'Oversees product strategy'),
    ('Director of Content',         'DOC',      9,  'director',     'Oversees all content operations'),
    ('Director of HR',              'DOHR',     9,  'director',     'Oversees all HR functions'),
    ('Director of Marketing',       'DOM',      9,  'director',     'Oversees all marketing efforts'),
    ('Director of Finance',         'DOF',      9,  'director',     'Oversees financial operations'),
    ('Vice President',              'VP',       9,  'director',     'Vice president — strategic leadership'),

    -- Executive (level 10)
    ('Chief Executive Officer',     'CEO',      10, 'executive',    'Company CEO — overall leadership'),
    ('Chief Technology Officer',    'CTO',      10, 'executive',    'Technology vision and strategy'),
    ('Chief Financial Officer',     'CFO',      10, 'executive',    'Financial strategy and operations'),
    ('Chief Operating Officer',     'COO',      10, 'executive',    'Operations and day-to-day management'),
    ('Chief Marketing Officer',     'CMO',      10, 'executive',    'Marketing and brand strategy'),
    ('Chief Product Officer',       'CPO',      10, 'executive',    'Product vision and roadmap'),
    ('Co-Founder',                  'COFDR',    10, 'executive',    'Company co-founder'),
    ('Founder',                     'FDR',      10, 'executive',    'Company founder');


-- ── Comments ──
