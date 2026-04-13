-- ============================================================
-- Table: specializations
-- Purpose: List of instructor specialization areas
-- ============================================================
-- Used by: instructor_profiles
-- These are teaching/domain specializations, not skills
-- Examples: Web Development, Data Science, Cloud Architecture
-- ============================================================


CREATE TABLE specializations (

    -- ── Primary Key ──
    id                  BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ── Specialization Info ──
    name                CITEXT          NOT NULL UNIQUE,
    category            TEXT            NOT NULL DEFAULT 'technology'
                        CONSTRAINT chk_specializations_category
                        CHECK (category IN (
                            'technology',       -- Web Dev, Mobile Dev, Cloud
                            'data',             -- Data Science, AI/ML, Analytics
                            'design',           -- UI/UX, Graphic Design
                            'business',         -- Marketing, Finance, Management
                            'language',         -- English, Hindi, Japanese teaching
                            'science',          -- Physics, Chemistry, Biology
                            'mathematics',      -- Statistics, Algebra, Calculus
                            'arts',             -- Music, Photography, Writing
                            'health',           -- Fitness, Yoga, Nutrition
                            'exam_prep',        -- GATE, CAT, GRE, UPSC, JEE
                            'professional',     -- CA, CS, CFA, Bar prep
                            'other'
                        )),
    description         TEXT,
    icon_url            TEXT,

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

CREATE INDEX idx_specializations_name ON specializations USING gin (name gin_trgm_ops)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_specializations_category ON specializations (category)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_specializations_active ON specializations (is_active)
    WHERE is_deleted = FALSE;


-- ── Full-Text Search Indexes (pg_trgm) ──

CREATE INDEX idx_specializations_content_trgm
    ON specializations
    USING GIN ((COALESCE(name::TEXT, '') || ' ' || COALESCE(description::TEXT, '')) gin_trgm_ops);


-- ── Trigger: updated_at ──
CREATE TRIGGER trg_specializations_updated_at
    BEFORE UPDATE ON specializations
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();


-- ── Seed Data ──

INSERT INTO specializations (name, category, description) VALUES
    -- Technology
    ('Full-Stack Web Development',      'technology',   'Frontend + Backend web development'),
    ('Frontend Development',            'technology',   'React, Angular, Vue — browser-side development'),
    ('Backend Development',             'technology',   'Node.js, Python, Java — server-side development'),
    ('Mobile App Development',          'technology',   'iOS, Android, Flutter, React Native'),
    ('Cloud Architecture',              'technology',   'AWS, Azure, GCP — cloud infrastructure design'),
    ('DevOps & CI/CD',                  'technology',   'Docker, Kubernetes, Jenkins, GitHub Actions'),
    ('Cybersecurity',                   'technology',   'Ethical hacking, network security, SIEM'),
    ('Blockchain & Web3',               'technology',   'Smart contracts, DeFi, NFTs, Solidity'),
    ('Database Engineering',            'technology',   'PostgreSQL, MongoDB, Redis — data architecture'),
    ('Embedded Systems & IoT',          'technology',   'Arduino, Raspberry Pi, sensor networks'),
    ('Game Development',                'technology',   'Unity, Unreal Engine, game design'),
    ('API Design & Integration',        'technology',   'REST, GraphQL, gRPC — API architecture'),

    -- Data
    ('Data Science',                    'data',         'Statistics, Python, R — data analysis'),
    ('Machine Learning',                'data',         'Supervised/unsupervised learning, neural networks'),
    ('Deep Learning & AI',              'data',         'TensorFlow, PyTorch, transformers, LLMs'),
    ('Natural Language Processing',     'data',         'Text analysis, chatbots, sentiment analysis'),
    ('Computer Vision',                 'data',         'Image recognition, OpenCV, YOLO'),
    ('Business Intelligence',           'data',         'Tableau, Power BI, data visualization'),
    ('Big Data Engineering',            'data',         'Spark, Hadoop, Kafka — large-scale data'),
    ('Data Analytics',                  'data',         'SQL, Excel, Python — business analytics'),

    -- Design
    ('UI/UX Design',                    'design',       'User interface and experience design'),
    ('Graphic Design',                  'design',       'Visual design — Photoshop, Illustrator, Canva'),
    ('Motion Graphics & Animation',     'design',       'After Effects, 3D animation, video effects'),
    ('Product Design',                  'design',       'End-to-end product design thinking'),
    ('Web Design',                      'design',       'Visual web design — Figma, Sketch, HTML/CSS'),

    -- Business
    ('Digital Marketing',               'business',     'SEO, SEM, social media, content marketing'),
    ('Project Management',              'business',     'Agile, Scrum, PMP — project delivery'),
    ('Product Management',              'business',     'Product strategy, roadmap, user research'),
    ('Financial Management',            'business',     'Accounting, taxation, financial planning'),
    ('Entrepreneurship',                'business',     'Startup building, business model, fundraising'),
    ('Human Resource Management',       'business',     'Recruitment, training, employee management'),
    ('Supply Chain Management',         'business',     'Logistics, inventory, procurement'),
    ('Sales & Negotiation',             'business',     'B2B/B2C sales, CRM, deal closing'),

    -- Language Teaching
    ('English Language Teaching',       'language',     'Grammar, spoken English, IELTS, TOEFL'),
    ('Hindi Language Teaching',         'language',     'Hindi grammar, literature, conversation'),
    ('Japanese Language Teaching',      'language',     'JLPT preparation, Kanji, conversation'),
    ('French Language Teaching',        'language',     'French grammar, DELF/DALF preparation'),
    ('German Language Teaching',        'language',     'German grammar, Goethe Institute levels'),
    ('Spanish Language Teaching',       'language',     'Spanish grammar, DELE preparation'),

    -- Science
    ('Physics',                         'science',      'Classical, quantum, and applied physics'),
    ('Chemistry',                       'science',      'Organic, inorganic, and physical chemistry'),
    ('Biology',                         'science',      'Zoology, botany, molecular biology'),
    ('Environmental Science',           'science',      'Ecology, sustainability, climate science'),

    -- Mathematics
    ('Mathematics',                     'mathematics',  'Algebra, calculus, geometry, number theory'),
    ('Statistics & Probability',        'mathematics',  'Statistical methods, probability, Bayesian'),
    ('Applied Mathematics',             'mathematics',  'Operations research, optimization, modeling'),

    -- Arts
    ('Music',                           'arts',         'Vocal, instrumental, music theory, composition'),
    ('Photography',                     'arts',         'Digital photography, editing, Lightroom'),
    ('Video Production',                'arts',         'Filmmaking, editing, YouTube content creation'),
    ('Creative Writing',                'arts',         'Fiction, non-fiction, blogging, copywriting'),
    ('Public Speaking',                 'arts',         'Presentation skills, debate, storytelling'),

    -- Health
    ('Yoga & Meditation',               'health',       'Hatha yoga, meditation, pranayama'),
    ('Fitness & Nutrition',             'health',       'Workout planning, diet, sports science'),
    ('Mental Health & Wellness',        'health',       'Stress management, counseling, mindfulness'),

    -- Exam Preparation
    ('GATE Preparation',                'exam_prep',    'Graduate Aptitude Test in Engineering'),
    ('CAT / MBA Entrance',             'exam_prep',    'CAT, XAT, SNAP — MBA entrance exams'),
    ('UPSC / Civil Services',           'exam_prep',    'IAS, IPS — UPSC civil services exam'),
    ('JEE / Engineering Entrance',      'exam_prep',    'JEE Main, JEE Advanced — IIT entrance'),
    ('NEET / Medical Entrance',         'exam_prep',    'NEET UG/PG — medical entrance exam'),
    ('GRE / GMAT',                      'exam_prep',    'Graduate school entrance exams'),
    ('IELTS / TOEFL',                   'exam_prep',    'English proficiency exams'),
    ('Bank PO / SSC',                   'exam_prep',    'Banking and government job exams'),
    ('NET / SET',                       'exam_prep',    'UGC NET / State SET for teaching eligibility'),

    -- Professional
    ('CA / Chartered Accountancy',      'professional', 'ICAI CA Foundation, Inter, Final'),
    ('CS / Company Secretary',          'professional', 'ICSI CS Foundation, Executive, Professional'),
    ('CFA / Financial Analysis',        'professional', 'CFA Level I, II, III preparation'),
    ('Law / Legal Studies',             'professional', 'CLAT, bar exam, legal practice');


-- ── Comments ──
