-- ============================================================
-- Table: education_levels
-- Purpose: List of education levels / qualifications
-- ============================================================
-- Used by: student_profiles, user_education
-- Ordered by level_order for dropdown sorting
-- ============================================================


CREATE TABLE education_levels (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Education Level Info ──
    name                CITEXT          NOT NULL UNIQUE,
    abbreviation        TEXT,                               -- B.Tech, MBA, PhD
    level_order         INT             NOT NULL,           -- 1=lowest, higher=advanced
    level_category      TEXT            NOT NULL DEFAULT 'other'
                        CONSTRAINT chk_education_levels_category
                        CHECK (level_category IN (
                            'pre_school',       -- Nursery, KG
                            'school',           -- Primary, Secondary, Higher Secondary
                            'diploma',          -- Diploma, ITI
                            'undergraduate',    -- Bachelor's
                            'postgraduate',     -- Master's, PG Diploma
                            'doctoral',         -- PhD, M.Phil
                            'professional',     -- CA, CS, CFA, Bar Council
                            'informal',         -- Self-taught, Online, Bootcamp
                            'other'
                        )),
    description         TEXT,
    typical_duration    TEXT,                               -- '2 years', '4 years', etc.
    typical_age_range   TEXT,                               -- '3-5', '18-22', etc.

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

CREATE INDEX idx_education_levels_name ON education_levels USING gin (name gin_trgm_ops)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_education_levels_order ON education_levels (level_order)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_education_levels_category ON education_levels (level_category)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_education_levels_active ON education_levels (is_active)
    WHERE is_deleted = FALSE;


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_education_levels_content_trgm
    ON education_levels
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(description::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_education_levels_updated_at
    BEFORE UPDATE ON education_levels
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

INSERT INTO education_levels (name, abbreviation, level_order, level_category, description, typical_duration, typical_age_range) VALUES
    -- Pre-School
    ('Nursery',                         NULL,       1,  'pre_school',       'Pre-primary nursery education',                            '1 year',       '3-4'),
    ('Lower Kindergarten',              'LKG',      2,  'pre_school',       'Lower kindergarten',                                       '1 year',       '4-5'),
    ('Upper Kindergarten',              'UKG',      3,  'pre_school',       'Upper kindergarten',                                       '1 year',       '5-6'),

    -- School
    ('Primary School',                  NULL,       4,  'school',           'Class 1 to 5 — basic education',                           '5 years',      '6-11'),
    ('Middle School',                   NULL,       5,  'school',           'Class 6 to 8 — middle education',                          '3 years',      '11-14'),
    ('Secondary School',                'SSC',      6,  'school',           'Class 9 to 10 — SSC / ICSE / CBSE Board exams',            '2 years',      '14-16'),
    ('Higher Secondary',                'HSC',      7,  'school',           'Class 11 to 12 — HSC / ISC / CBSE / State Board',          '2 years',      '16-18'),
    ('Senior Secondary (Science)',      'HSC-Sci',  8,  'school',           'Class 11-12 Science stream (PCM/PCB)',                     '2 years',      '16-18'),
    ('Senior Secondary (Commerce)',     'HSC-Com',  9,  'school',           'Class 11-12 Commerce stream',                              '2 years',      '16-18'),
    ('Senior Secondary (Arts)',         'HSC-Arts', 10, 'school',           'Class 11-12 Arts/Humanities stream',                       '2 years',      '16-18'),

    -- Diploma / ITI
    ('ITI Certificate',                 'ITI',      11, 'diploma',          'Industrial Training Institute — trade certificate',         '1-2 years',    '15-18'),
    ('Polytechnic Diploma',             'Dip.',     12, 'diploma',          'Polytechnic diploma in engineering/technology',             '3 years',      '16-19'),
    ('Diploma',                         'Dip.',     13, 'diploma',          'General diploma program',                                  '1-3 years',    '18+'),
    ('Advanced Diploma',                'Adv.Dip.', 14, 'diploma',          'Advanced diploma after basic diploma',                     '1-2 years',    '19+'),

    -- Undergraduate
    ('Associate Degree',                'A.A.',     15, 'undergraduate',    '2-year undergraduate degree',                              '2 years',      '18-20'),
    ('Bachelor of Arts',                'B.A.',     16, 'undergraduate',    'Undergraduate degree in arts/humanities',                   '3 years',      '18-21'),
    ('Bachelor of Science',             'B.Sc.',    17, 'undergraduate',    'Undergraduate degree in science',                          '3 years',      '18-21'),
    ('Bachelor of Commerce',            'B.Com.',   18, 'undergraduate',    'Undergraduate degree in commerce',                         '3 years',      '18-21'),
    ('Bachelor of Technology',          'B.Tech.',  19, 'undergraduate',    'Undergraduate engineering degree',                         '4 years',      '18-22'),
    ('Bachelor of Engineering',         'B.E.',     20, 'undergraduate',    'Undergraduate engineering degree',                         '4 years',      '18-22'),
    ('Bachelor of Business Admin',      'BBA',      21, 'undergraduate',    'Undergraduate degree in business administration',          '3 years',      '18-21'),
    ('Bachelor of Computer Applications','BCA',     22, 'undergraduate',    'Undergraduate degree in computer applications',            '3 years',      '18-21'),
    ('Bachelor of Design',              'B.Des.',   23, 'undergraduate',    'Undergraduate degree in design',                           '4 years',      '18-22'),
    ('Bachelor of Law',                 'LL.B.',    24, 'undergraduate',    'Undergraduate law degree',                                 '3-5 years',    '18-23'),
    ('Bachelor of Medicine',            'MBBS',     25, 'undergraduate',    'Undergraduate medical degree',                             '5.5 years',    '18-24'),
    ('Bachelor of Dental Surgery',      'BDS',      26, 'undergraduate',    'Undergraduate dental degree',                              '5 years',      '18-23'),
    ('Bachelor of Pharmacy',            'B.Pharm.', 27, 'undergraduate',    'Undergraduate pharmacy degree',                            '4 years',      '18-22'),
    ('Bachelor of Education',           'B.Ed.',    28, 'undergraduate',    'Teaching degree',                                          '2 years',      '21-23'),
    ('Bachelor of Fine Arts',           'BFA',      29, 'undergraduate',    'Undergraduate degree in fine/visual arts',                 '4 years',      '18-22'),
    ('Bachelor of Architecture',        'B.Arch.',  30, 'undergraduate',    'Undergraduate architecture degree',                        '5 years',      '18-23'),

    -- Postgraduate
    ('Postgraduate Diploma',            'PG Dip.',  31, 'postgraduate',     'Postgraduate diploma (1 year after graduation)',            '1 year',       '21+'),
    ('Master of Arts',                  'M.A.',     32, 'postgraduate',     'Postgraduate degree in arts/humanities',                    '2 years',      '21-23'),
    ('Master of Science',               'M.Sc.',    33, 'postgraduate',     'Postgraduate degree in science',                           '2 years',      '21-23'),
    ('Master of Commerce',              'M.Com.',   34, 'postgraduate',     'Postgraduate degree in commerce',                          '2 years',      '21-23'),
    ('Master of Technology',            'M.Tech.',  35, 'postgraduate',     'Postgraduate engineering degree',                          '2 years',      '22-24'),
    ('Master of Business Admin',        'MBA',      36, 'postgraduate',     'Postgraduate degree in business administration',           '2 years',      '22-24'),
    ('Master of Computer Applications', 'MCA',      37, 'postgraduate',     'Postgraduate degree in computer applications',             '2-3 years',    '21-24'),
    ('Master of Design',                'M.Des.',   38, 'postgraduate',     'Postgraduate degree in design',                            '2 years',      '22-24'),
    ('Master of Law',                   'LL.M.',    39, 'postgraduate',     'Postgraduate law degree',                                  '1-2 years',    '23-25'),
    ('Master of Education',             'M.Ed.',    40, 'postgraduate',     'Postgraduate teaching degree',                             '2 years',      '23-25'),
    ('Master of Public Health',         'MPH',      41, 'postgraduate',     'Postgraduate degree in public health',                     '2 years',      '23-25'),
    ('Master of Social Work',           'MSW',      42, 'postgraduate',     'Postgraduate degree in social work',                       '2 years',      '21-23'),

    -- Doctoral
    ('Master of Philosophy',            'M.Phil.',  43, 'doctoral',         'Pre-doctoral research degree',                             '1-2 years',    '23-26'),
    ('Doctor of Philosophy',            'Ph.D.',    44, 'doctoral',         'Doctoral research degree',                                 '3-6 years',    '24-30'),
    ('Doctor of Medicine',              'M.D.',     45, 'doctoral',         'Postgraduate medical specialization',                      '3 years',      '24-27'),
    ('Doctor of Surgery',               'M.S.',     46, 'doctoral',         'Postgraduate surgical specialization',                     '3 years',      '24-27'),
    ('Doctor of Science',               'D.Sc.',    47, 'doctoral',         'Higher doctorate for distinguished research',              'Varies',       '30+'),
    ('Post-Doctoral',                   'Post-Doc', 48, 'doctoral',         'Research after PhD',                                       '1-3 years',    '28+'),

    -- Professional
    ('Chartered Accountant',            'CA',       49, 'professional',     'Professional accountancy qualification (ICAI)',             '3-5 years',    '18+'),
    ('Company Secretary',               'CS',       50, 'professional',     'Professional company law qualification (ICSI)',             '3-4 years',    '18+'),
    ('Cost & Management Accountant',    'CMA',      51, 'professional',     'Professional cost accountancy qualification (ICMAI)',       '3-4 years',    '18+'),
    ('Chartered Financial Analyst',     'CFA',      52, 'professional',     'Global investment management qualification',               '2-4 years',    '21+'),
    ('Bar Council Certification',       'Advocate', 53, 'professional',     'License to practice law',                                  'After LL.B.',  '21+'),
    ('Medical Council Registration',    'MCI Reg.', 54, 'professional',     'License to practice medicine',                             'After MBBS',   '24+'),
    ('Professional Certification',      NULL,       55, 'professional',     'Industry-specific professional certification',             'Varies',       '18+'),

    -- Informal
    ('Online Course / MOOC',            NULL,       56, 'informal',         'Self-paced online course (Coursera, Udemy, etc.)',          'Varies',       'Any'),
    ('Bootcamp',                        NULL,       57, 'informal',         'Intensive short-term training program',                    '3-6 months',   'Any'),
    ('Self-Taught',                     NULL,       58, 'informal',         'Self-directed learning without formal institution',         'Varies',       'Any'),
    ('Apprenticeship',                  NULL,       59, 'informal',         'On-the-job training under a mentor',                       '1-4 years',    '16+'),
    ('No Formal Education',             NULL,       60, 'other',            'No formal educational qualification',                      NULL,           NULL);


-- ── Comments ──
