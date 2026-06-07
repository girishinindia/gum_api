-- ══════════════════════════════════════════════════════════════
-- MIGRATION 61: Site Section Settings
-- ══════════════════════════════════════════════════════════════
-- Super-admin toggles that control which homepage sections
-- are visible on the public-facing gum_web frontend.
-- Run AFTER: 60_podcasts.sql
-- ══════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- 1. CREATE site_section_settings TABLE
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS site_section_settings (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  section_key     VARCHAR(100) NOT NULL UNIQUE,
  label           VARCHAR(200) NOT NULL,
  description     VARCHAR(500),
  is_visible      BOOLEAN NOT NULL DEFAULT TRUE,
  display_order   INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_by      BIGINT REFERENCES users(id)
);

COMMENT ON TABLE  site_section_settings IS 'Super-admin toggles for homepage section visibility';
COMMENT ON COLUMN site_section_settings.section_key IS 'Unique key matching the frontend component (e.g. courses, blogs)';
COMMENT ON COLUMN site_section_settings.is_visible  IS 'When false the section is hidden from the public frontend';


-- ══════════════════════════════════════════════════════════════
-- 2. SEED DEFAULT ROWS
-- ══════════════════════════════════════════════════════════════

INSERT INTO site_section_settings (section_key, label, description, display_order) VALUES
  ('courses',         'Popular Courses',   'Featured courses grid on the homepage',                  1),
  ('categories',      'Categories',        'Explore course categories grid',                         2),
  ('blogs',           'Latest Blog',       'Blog posts section on the homepage',                     3),
  ('webinars',        'Upcoming Webinars', 'Upcoming webinar cards',                                 4),
  ('live_sessions',   'Live Sessions',     'Live class / session listings',                          5),
  ('podcasts',        'Podcasts',          'Podcast episodes section',                               6),
  ('discussions',     'Discussions',       'Community discussion section',                            7),
  ('live_classes',    'Live Classes',      'Scheduled live classes',                                  8),
  ('support_tickets', 'Support Tickets',   'Student support / ticket section',                       9),
  ('bundles',         'Bundles',           'Course bundle deals section',                            10),
  ('instructors',     'Instructors',       'Featured instructors section',                           11),
  ('student_reviews', 'Student Reviews',   'Testimonials and student feedback',                     12),
  ('faq',             'FAQ',               'Frequently asked questions section',                     13),
  ('newsletter',      'Newsletter',        'Email newsletter signup section',                       14),
  ('certificate',     'Certificate Preview','Certificate preview banner',                           15),
  ('languages',       'Languages Banner',  'Learn in your language banner',                         16),
  ('stats',           'Stats Counter',     'Platform statistics counter section',                   17),
  ('how_it_works',    'How It Works',      'Step-by-step how the platform works',                   18),
  ('features',        'Features',          'Why Grow Up More features section',                     19),
  ('cta',             'Call to Action',    'Bottom call-to-action banner',                          20)
ON CONFLICT (section_key) DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- 3. INDEX
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_site_section_settings_key ON site_section_settings(section_key);


-- ══════════════════════════════════════════════════════════════
-- 4. RLS — public read, admin write
-- ══════════════════════════════════════════════════════════════

ALTER TABLE site_section_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read"
  ON site_section_settings FOR SELECT
  USING (true);

CREATE POLICY "Service role full access"
  ON site_section_settings FOR ALL
  USING (true)
  WITH CHECK (true);
