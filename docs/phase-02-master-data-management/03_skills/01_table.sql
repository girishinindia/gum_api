-- ============================================================
-- Table: skills
-- Purpose: List of skills (technical, soft, tools, etc.)
-- ============================================================
-- Used by: user_skills (profile linking table)
-- Examples: Python, React, Public Speaking, Excel, SQL
-- ============================================================


CREATE TABLE skills (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Skill Info ──
    name                CITEXT          NOT NULL,
    category            TEXT            NOT NULL DEFAULT 'technical'
                        CONSTRAINT chk_skills_category
                        CHECK (category IN (
                            'technical',        -- Python, SQL, AWS
                            'soft_skill',       -- Communication, Leadership
                            'tool',             -- Excel, Figma, Photoshop
                            'framework',        -- React, Django, Spring
                            'language',         -- Programming languages — Java, C++
                            'domain',           -- Finance, Healthcare, Education
                            'certification',    -- AWS Certified, PMP
                            'other'
                        )),
    description         TEXT,
    icon_url            TEXT,                   -- skill icon for UI

    -- ── Audit ──
    created_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,
    updated_by              BIGINT          REFERENCES users(id) ON DELETE SET NULL,

    -- ── Status ──
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Timestamps ──
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ,

    -- ── Unique name per category ──
    CONSTRAINT uq_skills_name_category UNIQUE (name, category)
);


-- ── Indexes ──

CREATE INDEX idx_skills_name ON skills USING gin (name gin_trgm_ops)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_skills_category ON skills (category)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_skills_active ON skills (is_active)
    WHERE is_deleted = FALSE;


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_skills_content_trgm
    ON skills
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(description::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

INSERT INTO skills (name, category, description) VALUES
    -- Technical
    ('Python',          'technical',    'General-purpose programming language'),
    ('JavaScript',      'technical',    'Web programming language'),
    ('TypeScript',      'technical',    'Typed superset of JavaScript'),
    ('Java',            'technical',    'Object-oriented programming language'),
    ('C++',             'technical',    'Systems programming language'),
    ('SQL',             'technical',    'Structured Query Language for databases'),
    ('PostgreSQL',      'technical',    'Advanced open-source relational database'),
    ('HTML/CSS',        'technical',    'Web markup and styling'),
    ('PHP',             'technical',    'Server-side scripting language'),
    ('Go',              'technical',    'Compiled systems programming language'),
    ('Rust',            'technical',    'Memory-safe systems programming language'),
    ('Swift',           'technical',    'Apple platform programming language'),
    ('Kotlin',          'technical',    'Modern JVM language for Android'),
    ('R',               'technical',    'Statistical computing language'),
    ('Shell/Bash',      'technical',    'Command-line scripting'),

    -- Frameworks
    ('React',           'framework',    'JavaScript UI library by Meta'),
    ('Angular',         'framework',    'TypeScript web framework by Google'),
    ('Vue.js',          'framework',    'Progressive JavaScript framework'),
    ('Next.js',         'framework',    'React framework for production'),
    ('Django',          'framework',    'Python web framework'),
    ('Flask',           'framework',    'Lightweight Python web framework'),
    ('Spring Boot',     'framework',    'Java enterprise framework'),
    ('Express.js',      'framework',    'Node.js web framework'),
    ('Laravel',         'framework',    'PHP web framework'),
    ('Ruby on Rails',   'framework',    'Ruby web framework'),
    ('Flutter',         'framework',    'Cross-platform mobile UI framework'),
    ('React Native',    'framework',    'Cross-platform mobile framework'),
    ('Tailwind CSS',    'framework',    'Utility-first CSS framework'),
    ('Bootstrap',       'framework',    'CSS component framework'),

    -- Tools
    ('Git',             'tool',         'Version control system'),
    ('Docker',          'tool',         'Containerization platform'),
    ('Kubernetes',      'tool',         'Container orchestration'),
    ('VS Code',         'tool',         'Code editor by Microsoft'),
    ('Figma',           'tool',         'UI/UX design tool'),
    ('Photoshop',       'tool',         'Image editing software'),
    ('Jira',            'tool',         'Project management tool'),
    ('Postman',         'tool',         'API testing tool'),
    ('Linux',           'tool',         'Operating system'),
    ('Excel',           'tool',         'Spreadsheet software'),
    ('Power BI',        'tool',         'Business intelligence tool'),
    ('Tableau',         'tool',         'Data visualization tool'),

    -- Soft Skills
    ('Communication',       'soft_skill',   'Verbal and written communication'),
    ('Leadership',          'soft_skill',   'Team leadership and management'),
    ('Problem Solving',     'soft_skill',   'Analytical problem-solving'),
    ('Critical Thinking',   'soft_skill',   'Logical analysis and reasoning'),
    ('Teamwork',            'soft_skill',   'Collaboration and team skills'),
    ('Time Management',     'soft_skill',   'Prioritization and scheduling'),
    ('Presentation',        'soft_skill',   'Public speaking and slide decks'),
    ('Negotiation',         'soft_skill',   'Business negotiation skills'),
    ('Adaptability',        'soft_skill',   'Flexibility and change management'),
    ('Creativity',          'soft_skill',   'Creative thinking and innovation'),

    -- Domain
    ('Data Science',        'domain',       'Statistics, ML, and data analysis'),
    ('Machine Learning',    'domain',       'AI and predictive modeling'),
    ('Cloud Computing',     'domain',       'AWS, Azure, GCP infrastructure'),
    ('Cybersecurity',       'domain',       'Information security and ethical hacking'),
    ('DevOps',              'domain',       'CI/CD, infrastructure automation'),
    ('Blockchain',          'domain',       'Distributed ledger technology'),
    ('UI/UX Design',        'domain',       'User interface and experience design'),
    ('Digital Marketing',   'domain',       'SEO, SEM, social media marketing'),
    ('Project Management',  'domain',       'Agile, Scrum, Waterfall methodologies'),
    ('Mobile Development',  'domain',       'iOS and Android app development'),

    -- Certifications
    ('AWS Certified',           'certification',    'Amazon Web Services certifications'),
    ('Google Cloud Certified',  'certification',    'Google Cloud Platform certifications'),
    ('Azure Certified',         'certification',    'Microsoft Azure certifications'),
    ('PMP',                     'certification',    'Project Management Professional'),
    ('Scrum Master',            'certification',    'Certified ScrumMaster (CSM)'),
    ('CISSP',                   'certification',    'Cybersecurity certification'),
    ('Oracle Certified',        'certification',    'Oracle database/Java certifications'),
    ('Cisco CCNA',              'certification',    'Cisco networking certification');


-- ── Comments ──
