-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ============================================================
-- _baseline_2026_05_13.sql
-- Live-schema baseline · Genius ITens Project · captured 2026-05-13
-- Generated from pg_catalog introspection (CREATE TABLE shape only).
--
-- This file represents every public.* table's column structure as of
-- end of Phase 5. It DOES NOT include:
--   • Primary keys, foreign keys, unique constraints, check constraints
--     (rebuilt from pg_constraint in a future pass — see SNAPSHOT.md)
--   • Indexes (~1,081 in the live DB — see pg_indexes)
--   • RLS policies (29 — see pg_policies)
--   • Triggers (215 — see pg_trigger)
--   • Functions (159 — see pg_proc)
--
-- For a complete schema-only dump, use the Supabase Dashboard:
--   Database → Backups → Manual → Download schema-only.
--
-- The Supabase MCP migrations history is the source of truth:
--   list_migrations(project_id) returns the canonical sequence.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id bigint NOT NULL,
  actor_id bigint,
  action character varying(60) NOT NULL,
  target_type character varying(30),
  target_id bigint,
  target_name character varying(255),
  changes jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id bigint NOT NULL DEFAULT nextval('announcement_reads_id_seq'::regclass),
  announcement_id bigint NOT NULL,
  user_id bigint NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  is_dismissed boolean NOT NULL DEFAULT false,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id bigint NOT NULL DEFAULT nextval('announcements_id_seq'::regclass),
  title character varying(255) NOT NULL,
  content text NOT NULL,
  announcement_type character varying(20) NOT NULL DEFAULT 'info'::character varying,
  target_scope character varying(30) NOT NULL DEFAULT 'all'::character varying,
  target_id bigint,
  target_name character varying(255),
  target_audience character varying(20) NOT NULL DEFAULT 'all'::character varying,
  priority integer NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  publish_at timestamp with time zone,
  expires_at timestamp with time zone,
  channels text[] NOT NULL DEFAULT ARRAY['in_app'::text],
  status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
  sent_count integer NOT NULL DEFAULT 0,
  published_at timestamp with time zone,
  published_by bigint,
  created_by bigint,
  updated_by bigint,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.assesment_capstone_projects (
  id integer NOT NULL DEFAULT nextval('assesment_capstone_projects_id_seq'::regclass),
  course_id integer NOT NULL,
  slug character varying(255) NOT NULL,
  points integer NOT NULL DEFAULT 0,
  difficulty_level character varying(50) DEFAULT 'beginner'::character varying,
  display_order integer NOT NULL DEFAULT 0,
  file_solution_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  file_solution_name text
);

CREATE TABLE IF NOT EXISTS public.assesment_capstone_projects_solution (
  id integer NOT NULL DEFAULT nextval('assesment_capstone_projects_solution_id_seq'::regclass),
  capstone_project_id integer NOT NULL,
  video text,
  video_title character varying(255),
  video_short_intro text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  video_thumbnail text
);

CREATE TABLE IF NOT EXISTS public.assesment_capstone_projects_translations (
  id integer NOT NULL DEFAULT nextval('assesment_capstone_projects_translations_id_seq'::regclass),
  capstone_project_id integer NOT NULL,
  language_id integer NOT NULL,
  name character varying(255),
  description text,
  file_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.assesment_exercise (
  id bigint NOT NULL,
  topic_id bigint NOT NULL,
  slug citext,
  points numeric(6,2) NOT NULL DEFAULT 0.00,
  difficulty_level text DEFAULT 'medium'::text,
  display_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assesment_exercise_translations (
  id bigint NOT NULL,
  assesment_exercise_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name text,
  description text,
  file_url text,
  file_solution_url text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assesment_mini_projects (
  id integer NOT NULL DEFAULT nextval('assesment_mini_projects_id_seq'::regclass),
  chapter_id integer NOT NULL,
  slug character varying(255) NOT NULL,
  points integer DEFAULT 0,
  difficulty_level character varying(50) DEFAULT 'medium'::character varying,
  display_order integer DEFAULT 0,
  file_solution_url text,
  is_active boolean DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  file_solution_name text
);

CREATE TABLE IF NOT EXISTS public.assesment_mini_projects_solution (
  id integer NOT NULL DEFAULT nextval('assesment_mini_projects_solution_id_seq'::regclass),
  mini_project_id integer NOT NULL,
  video text,
  video_title character varying(255),
  video_short_intro text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  video_thumbnail text
);

CREATE TABLE IF NOT EXISTS public.assesment_mini_projects_translations (
  id integer NOT NULL DEFAULT nextval('assesment_mini_projects_translations_id_seq'::regclass),
  mini_project_id integer NOT NULL,
  language_id integer NOT NULL,
  name character varying(255),
  description text,
  file_url text,
  is_active boolean DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.assessment_attachment_translations (
  id bigint NOT NULL,
  assessment_attachment_id bigint NOT NULL,
  language_id bigint NOT NULL,
  title text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessment_attachments (
  id bigint NOT NULL,
  assessment_id bigint NOT NULL,
  attachment_type text NOT NULL,
  file_url text,
  github_url text,
  file_name text,
  file_size_bytes bigint,
  mime_type text,
  display_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessment_solution_translations (
  id bigint NOT NULL,
  assessment_solution_id bigint NOT NULL,
  language_id bigint NOT NULL,
  title text NOT NULL,
  description text,
  html_content text,
  video_title text,
  video_description text,
  video_thumbnail text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessment_solutions (
  id bigint NOT NULL,
  assessment_id bigint NOT NULL,
  solution_type text NOT NULL,
  file_url text,
  github_url text,
  video_url text,
  zip_url text,
  file_name text,
  file_size_bytes bigint,
  mime_type text,
  video_duration_seconds integer,
  display_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessment_translations (
  id bigint NOT NULL,
  assessment_id bigint NOT NULL,
  language_id bigint NOT NULL,
  title citext NOT NULL,
  description text,
  instructions text,
  html_content text,
  tech_stack jsonb DEFAULT '[]'::jsonb,
  learning_outcomes jsonb DEFAULT '[]'::jsonb,
  image_1 text,
  image_2 text,
  tags jsonb DEFAULT '[]'::jsonb,
  meta_title text,
  meta_description text,
  meta_keywords text,
  canonical_url text,
  og_site_name text,
  og_title text,
  og_description text,
  og_type text,
  og_image text,
  og_url text,
  twitter_site text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  twitter_card text DEFAULT 'summary_large_image'::text,
  robots_directive text DEFAULT 'index,follow'::text,
  focus_keyword text,
  search_vector tsvector DEFAULT ((((((setweight(to_tsvector('simple'::regconfig, (COALESCE(title, ''::citext))::text), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(instructions, ''::text)), 'C'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_title, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(focus_keyword, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((tags)::text, ''::text)), 'D'::"char")),
  structured_data jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessments (
  id bigint NOT NULL,
  assessment_type text NOT NULL DEFAULT 'assignment'::text,
  assessment_scope text NOT NULL DEFAULT 'topic'::text,
  sub_topic_id bigint,
  topic_id bigint,
  chapter_id bigint,
  course_id bigint,
  content_type text NOT NULL DEFAULT 'coding'::text,
  slug citext,
  points numeric(6,2) NOT NULL DEFAULT 0.00,
  difficulty_level text DEFAULT 'medium'::text,
  due_days smallint,
  estimated_hours numeric(5,1),
  is_mandatory boolean NOT NULL DEFAULT true,
  display_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auth_activity_log (
  id bigint NOT NULL,
  user_id bigint,
  action character varying(30) NOT NULL,
  identifier character varying(255),
  ip_address inet,
  user_agent text,
  device_type character varying(20),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.badges (
  id bigint NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  icon_url text,
  category text NOT NULL DEFAULT 'completion'::text,
  trigger_type text NOT NULL DEFAULT 'automatic'::text,
  trigger_config jsonb,
  xp_reward integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.batch_translations (
  id integer NOT NULL DEFAULT nextval('batch_translations_id_seq'::regclass),
  batch_id integer NOT NULL,
  language_id integer NOT NULL,
  title text,
  description text,
  short_description text,
  requirements text,
  what_you_learn text,
  meta_title text,
  meta_description text,
  meta_keywords text,
  is_active boolean DEFAULT true,
  deleted_at timestamp with time zone,
  created_by integer,
  updated_by integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  thumbnail_url text,
  canonical_url text,
  robots_directive text DEFAULT 'index,follow'::text,
  focus_keyword text,
  tags jsonb DEFAULT '[]'::jsonb,
  og_site_name text,
  og_title text,
  og_description text,
  og_type text,
  og_image text,
  og_url text,
  twitter_site text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  twitter_card text DEFAULT 'summary_large_image'::text,
  structured_data jsonb DEFAULT '[]'::jsonb,
  search_vector tsvector DEFAULT ((((((setweight(to_tsvector('simple'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(short_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_title, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(focus_keyword, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((tags)::text, ''::text)), 'D'::"char"))
);

CREATE TABLE IF NOT EXISTS public.blog_categories (
  id bigint NOT NULL DEFAULT nextval('blog_categories_id_seq'::regclass),
  name character varying(255) NOT NULL,
  slug character varying(255),
  description text,
  parent_id bigint,
  thumbnail_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id bigint NOT NULL DEFAULT nextval('blog_posts_id_seq'::regclass),
  title character varying(500) NOT NULL,
  slug character varying(500),
  excerpt text,
  content text NOT NULL,
  featured_image_url text,
  category_id bigint,
  author_id bigint,
  author_type character varying(20) NOT NULL DEFAULT 'system'::character varying,
  status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
  published_at timestamp with time zone,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta_title character varying(255),
  meta_description text,
  meta_keywords text,
  og_image_url text,
  view_count integer NOT NULL DEFAULT 0,
  rating_average numeric NOT NULL DEFAULT 0.00,
  rating_count bigint NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.blog_reviews (
  id bigint NOT NULL DEFAULT nextval('blog_reviews_id_seq'::regclass),
  blog_post_id bigint NOT NULL,
  user_id bigint NOT NULL,
  rating smallint NOT NULL,
  title character varying(255),
  review_text text,
  status character varying(20) NOT NULL DEFAULT 'published'::character varying,
  helpful_count integer NOT NULL DEFAULT 0,
  reported_count integer NOT NULL DEFAULT 0,
  admin_notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.branch_departments (
  id bigint NOT NULL,
  branch_id bigint NOT NULL,
  department_id bigint NOT NULL,
  local_head_user_id bigint,
  employee_capacity integer,
  floor_or_wing text,
  extension_number text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.branches (
  id bigint NOT NULL,
  country_id bigint,
  state_id bigint,
  city_id bigint,
  branch_manager_id bigint,
  name citext NOT NULL,
  code citext NOT NULL,
  branch_type text NOT NULL DEFAULT 'office'::text,
  address_line_1 text,
  address_line_2 text,
  pincode text,
  phone text,
  email citext,
  website text,
  google_maps_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.bundle_courses (
  id bigint NOT NULL,
  bundle_id bigint NOT NULL,
  course_id bigint NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.bundle_translations (
  id bigint NOT NULL,
  bundle_id bigint NOT NULL,
  language_id bigint NOT NULL,
  title citext NOT NULL,
  short_description text,
  description text,
  highlights jsonb,
  tags jsonb,
  thumbnail_url text,
  banner_url text,
  meta_title text,
  meta_description text,
  meta_keywords text,
  canonical_url text,
  og_title text,
  og_description text,
  og_image text,
  og_url text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  twitter_card text DEFAULT 'summary_large_image'::text,
  robots_directive text DEFAULT 'index, follow'::text,
  focus_keyword text,
  structured_data jsonb,
  search_vector tsvector,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.bundles (
  id bigint NOT NULL,
  code citext,
  slug citext NOT NULL,
  name text,
  bundle_owner text NOT NULL DEFAULT 'gum_admin'::text,
  instructor_id bigint,
  price numeric(10,2) NOT NULL DEFAULT 0.00,
  original_price numeric(10,2),
  discount_percentage numeric(5,2),
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  validity_days integer,
  starts_at date,
  expires_at date,
  max_courses integer,
  enrollment_count bigint NOT NULL DEFAULT 0,
  rating_average numeric(3,2) DEFAULT 0.00,
  rating_count bigint NOT NULL DEFAULT 0,
  view_count bigint NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id bigint NOT NULL DEFAULT nextval('cart_items_id_seq'::regclass),
  user_id bigint NOT NULL,
  item_type character varying(20) NOT NULL,
  item_id bigint NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  price numeric(10,2),
  coupon_code character varying(50),
  promo_code character varying(50),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.categories (
  id bigint NOT NULL,
  code citext NOT NULL,
  slug citext NOT NULL,
  display_order smallint DEFAULT 0,
  image text,
  is_new boolean NOT NULL DEFAULT false,
  new_until date,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  og_site_name text,
  og_type text,
  twitter_site text,
  twitter_card text,
  robots_directive text,
  created_by bigint,
  updated_by bigint,
  deleted_by bigint,
  name text
);

CREATE TABLE IF NOT EXISTS public.category_translations (
  id bigint NOT NULL,
  category_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name citext NOT NULL,
  description text,
  is_new_title text,
  image text,
  tags jsonb DEFAULT '[]'::jsonb,
  meta_title text,
  meta_description text,
  meta_keywords text,
  canonical_url text,
  og_site_name text,
  og_title text,
  og_description text,
  og_type text,
  og_image text,
  og_url text,
  twitter_site text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  twitter_card text DEFAULT 'summary_large_image'::text,
  robots_directive text DEFAULT 'index,follow'::text,
  focus_keyword text,
  search_vector tsvector DEFAULT (((((setweight(to_tsvector('simple'::regconfig, (COALESCE(name, ''::citext))::text), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_title, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(focus_keyword, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((tags)::text, ''::text)), 'D'::"char")),
  structured_data jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id bigint NOT NULL,
  course_id bigint,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  template_type text NOT NULL DEFAULT 'completion'::text,
  template_html text,
  background_image_url text,
  logo_url text,
  signature_url text,
  orientation text NOT NULL DEFAULT 'landscape'::text,
  min_score numeric DEFAULT 0,
  min_progress_pct numeric DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.chapter_translations (
  id bigint NOT NULL,
  chapter_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name citext NOT NULL,
  short_intro text,
  long_intro text,
  prerequisites text,
  learning_objectives text,
  image text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.chapters (
  id bigint NOT NULL,
  subject_id bigint NOT NULL,
  slug citext,
  display_order smallint DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  name text
);

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id bigint NOT NULL DEFAULT nextval('chat_attachments_id_seq'::regclass),
  message_id bigint NOT NULL,
  file_name character varying(500) NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  file_type character varying(100),
  thumbnail_url text,
  uploaded_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_invites (
  id bigint NOT NULL DEFAULT nextval('chat_invites_id_seq'::regclass),
  room_id bigint NOT NULL,
  created_by bigint NOT NULL,
  invite_token character varying(64) NOT NULL,
  invite_type character varying(20) NOT NULL DEFAULT 'link'::character varying,
  invited_user_id bigint,
  max_uses integer,
  use_count integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone,
  status character varying(20) NOT NULL DEFAULT 'active'::character varying,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id bigint NOT NULL DEFAULT nextval('chat_message_reactions_id_seq'::regclass),
  message_id bigint NOT NULL,
  user_id bigint NOT NULL,
  emoji character varying(50) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id bigint NOT NULL DEFAULT nextval('chat_messages_id_seq'::regclass),
  room_id bigint NOT NULL,
  sender_id bigint,
  message_type character varying(20) NOT NULL DEFAULT 'text'::character varying,
  content text,
  metadata jsonb,
  reply_to_id bigint,
  is_edited boolean NOT NULL DEFAULT false,
  edited_at timestamp with time zone,
  is_pinned boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.chat_read_receipts (
  id bigint NOT NULL DEFAULT nextval('chat_read_receipts_id_seq'::regclass),
  room_id bigint NOT NULL,
  user_id bigint NOT NULL,
  last_read_message_id bigint,
  read_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id bigint NOT NULL DEFAULT nextval('chat_room_members_id_seq'::regclass),
  room_id bigint NOT NULL,
  user_id bigint NOT NULL,
  role character varying(20) NOT NULL DEFAULT 'member'::character varying,
  invited_by bigint,
  invite_id bigint,
  is_muted boolean NOT NULL DEFAULT false,
  muted_until timestamp with time zone,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  last_read_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id bigint NOT NULL DEFAULT nextval('chat_rooms_id_seq'::regclass),
  room_type character varying(20) NOT NULL DEFAULT 'public'::character varying,
  name character varying(255),
  description text,
  avatar_url text,
  created_by bigint,
  max_members integer NOT NULL DEFAULT 100,
  batch_id bigint,
  invite_code character varying(20),
  allow_invite_link boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.cities (
  id bigint NOT NULL,
  state_id bigint NOT NULL,
  name text NOT NULL,
  phonecode text,
  timezone text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.countries (
  id bigint NOT NULL,
  name text NOT NULL,
  iso2 character varying(2) NOT NULL,
  iso3 character varying(3) NOT NULL,
  phone_code character varying(10),
  nationality text,
  national_language text,
  languages jsonb DEFAULT '[]'::jsonb,
  tld character varying(10),
  currency character varying(5),
  currency_name text,
  currency_symbol character varying(5),
  flag_image text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.coupon_batches (
  id bigint NOT NULL DEFAULT nextval('coupon_batches_id_seq'::regclass),
  coupon_id bigint NOT NULL,
  batch_id bigint NOT NULL,
  is_active boolean DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coupon_bundles (
  id bigint NOT NULL DEFAULT nextval('coupon_bundles_id_seq'::regclass),
  coupon_id bigint NOT NULL,
  bundle_id bigint NOT NULL,
  is_active boolean DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coupon_courses (
  id bigint NOT NULL DEFAULT nextval('coupon_courses_id_seq'::regclass),
  coupon_id bigint NOT NULL,
  course_id bigint NOT NULL,
  is_active boolean DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coupon_webinars (
  id bigint NOT NULL DEFAULT nextval('coupon_webinars_id_seq'::regclass),
  coupon_id bigint NOT NULL,
  webinar_id bigint NOT NULL,
  is_active boolean DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coupons (
  id bigint NOT NULL DEFAULT nextval('coupons_id_seq'::regclass),
  coupon_code character varying(50) NOT NULL,
  title character varying(255) NOT NULL,
  description text,
  discount_type character varying(20) NOT NULL DEFAULT 'percentage'::character varying,
  discount_value numeric(10,2) NOT NULL DEFAULT 0,
  min_purchase_amount numeric(10,2) DEFAULT 0,
  max_discount_amount numeric(10,2),
  applicable_to character varying(20) NOT NULL DEFAULT 'all'::character varying,
  usage_limit integer,
  usage_per_user integer DEFAULT 1,
  used_count integer DEFAULT 0,
  valid_from timestamp with time zone,
  valid_until timestamp with time zone,
  is_active boolean DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_batches (
  id integer NOT NULL DEFAULT nextval('course_batches_id_seq'::regclass),
  course_id integer NOT NULL,
  title text NOT NULL,
  code text,
  slug text,
  batch_owner text DEFAULT 'system'::text,
  batch_status text DEFAULT 'upcoming'::text,
  instructor_id integer,
  max_students integer,
  enrolled_count integer DEFAULT 0,
  price numeric(10,2) DEFAULT 0,
  is_free boolean DEFAULT false,
  includes_course_access boolean DEFAULT true,
  start_date date,
  end_date date,
  meeting_platform text,
  meeting_link text,
  schedule jsonb,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  deleted_at timestamp with time zone,
  created_by integer,
  updated_by integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  rating_average numeric NOT NULL DEFAULT 0.00,
  rating_count bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.course_chapter_topics (
  id bigint NOT NULL,
  course_id bigint NOT NULL,
  course_chapter_id bigint NOT NULL,
  topic_id bigint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.course_chapters (
  id bigint NOT NULL,
  course_id bigint NOT NULL,
  course_module_subject_id bigint NOT NULL,
  chapter_id bigint NOT NULL,
  is_free_trial boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.course_module_subjects (
  id bigint NOT NULL,
  course_id bigint NOT NULL,
  course_module_id bigint NOT NULL,
  subject_id bigint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.course_module_translations (
  id bigint NOT NULL,
  course_module_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name citext NOT NULL,
  short_intro text,
  description text,
  image text,
  tags jsonb DEFAULT '[]'::jsonb,
  meta_title text,
  meta_description text,
  meta_keywords text,
  canonical_url text,
  og_site_name text,
  og_title text,
  og_description text,
  og_type text,
  og_image text,
  og_url text,
  twitter_site text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  twitter_card text DEFAULT 'summary_large_image'::text,
  robots_directive text DEFAULT 'index,follow'::text,
  focus_keyword text,
  search_vector tsvector DEFAULT ((((((setweight(to_tsvector('simple'::regconfig, COALESCE((name)::text, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(short_intro, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(description, ''::text)), 'C'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_title, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(focus_keyword, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((tags)::text, ''::text)), 'D'::"char")),
  structured_data jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.course_modules (
  id bigint NOT NULL,
  course_id bigint NOT NULL,
  name text,
  slug citext,
  view_count bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.course_sub_categories (
  id bigint NOT NULL,
  course_id bigint NOT NULL,
  sub_category_id bigint NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.course_translations (
  id bigint NOT NULL,
  course_id bigint NOT NULL,
  language_id bigint NOT NULL,
  title citext NOT NULL,
  short_intro text,
  long_intro text,
  tagline text,
  web_thumbnail text,
  web_banner text,
  app_thumbnail text,
  app_banner text,
  video_title text,
  video_description text,
  video_thumbnail text,
  video_duration_minutes integer,
  tags jsonb DEFAULT '[]'::jsonb,
  is_new_title text,
  prerequisites jsonb DEFAULT '[]'::jsonb,
  skills_gain jsonb DEFAULT '[]'::jsonb,
  what_you_will_learn jsonb DEFAULT '[]'::jsonb,
  course_includes jsonb DEFAULT '[]'::jsonb,
  course_is_for jsonb DEFAULT '[]'::jsonb,
  apply_for_designations jsonb DEFAULT '[]'::jsonb,
  demand_in_countries jsonb DEFAULT '[]'::jsonb,
  salary_standard jsonb DEFAULT '[]'::jsonb,
  future_courses jsonb DEFAULT '[]'::jsonb,
  meta_title text,
  meta_description text,
  meta_keywords text,
  canonical_url text,
  og_site_name text,
  og_title text,
  og_description text,
  og_type text,
  og_image text,
  og_url text,
  twitter_site text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  twitter_card text DEFAULT 'summary_large_image'::text,
  robots_directive text DEFAULT 'index,follow'::text,
  focus_keyword text,
  search_vector tsvector DEFAULT (((((((((setweight(to_tsvector('simple'::regconfig, COALESCE((title)::text, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(short_intro, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(long_intro, ''::text)), 'C'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(tagline, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_title, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(video_title, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(video_description, ''::text)), 'C'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(focus_keyword, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((tags)::text, ''::text)), 'D'::"char")),
  structured_data jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.courses (
  id bigint NOT NULL,
  instructor_id bigint,
  course_language_id bigint,
  code citext,
  slug citext NOT NULL,
  name text,
  difficulty_level text DEFAULT 'beginner'::text,
  course_status text NOT NULL DEFAULT 'draft'::text,
  duration_hours numeric(6,1),
  price numeric(10,2) NOT NULL DEFAULT 0.00,
  original_price numeric(10,2),
  discount_percentage numeric(5,2),
  is_free boolean NOT NULL DEFAULT false,
  trailer_video_url text,
  trailer_thumbnail_url text,
  video_url text,
  brochure_url text,
  is_new boolean NOT NULL DEFAULT false,
  new_until date,
  is_featured boolean NOT NULL DEFAULT false,
  is_bestseller boolean NOT NULL DEFAULT false,
  has_placement_assistance boolean NOT NULL DEFAULT false,
  has_certificate boolean NOT NULL DEFAULT true,
  max_students integer,
  refund_days smallint DEFAULT 0,
  enrollment_count bigint NOT NULL DEFAULT 0,
  rating_average numeric(3,2) DEFAULT 0.00,
  rating_count bigint NOT NULL DEFAULT 0,
  view_count bigint NOT NULL DEFAULT 0,
  total_lessons integer NOT NULL DEFAULT 0,
  total_assignments integer NOT NULL DEFAULT 0,
  total_projects integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.custom_emojis (
  id bigint NOT NULL DEFAULT nextval('custom_emojis_id_seq'::regclass),
  category_id bigint NOT NULL,
  name character varying(100) NOT NULL,
  shortcode character varying(50) NOT NULL,
  image_url text NOT NULL,
  is_animated boolean NOT NULL DEFAULT false,
  created_by bigint,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.data_activity_log (
  id bigint NOT NULL,
  actor_id bigint,
  action character varying(30) NOT NULL,
  resource_type character varying(50) NOT NULL,
  resource_id bigint,
  resource_name character varying(255),
  changes jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.departments (
  id bigint NOT NULL,
  parent_department_id bigint,
  head_user_id bigint,
  name citext NOT NULL,
  code citext NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.descriptive_question_translations (
  id bigint NOT NULL,
  descriptive_question_id bigint NOT NULL,
  language_id bigint NOT NULL,
  question_text text NOT NULL,
  explanation text,
  hint text,
  image_1 text,
  image_2 text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.descriptive_questions (
  id bigint NOT NULL,
  topic_id bigint NOT NULL,
  answer_type text NOT NULL DEFAULT 'short_answer'::text,
  code citext,
  slug citext,
  points numeric(6,2) NOT NULL DEFAULT 1.00,
  min_words integer,
  max_words integer,
  display_order smallint NOT NULL DEFAULT 0,
  difficulty_level text DEFAULT 'medium'::text,
  is_mandatory boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.designations (
  id bigint NOT NULL,
  name citext NOT NULL,
  code citext,
  level integer NOT NULL DEFAULT 1,
  level_band text NOT NULL DEFAULT 'entry'::text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.discussion_replies (
  id bigint NOT NULL DEFAULT nextval('discussion_replies_id_seq'::regclass),
  thread_id bigint NOT NULL,
  parent_reply_id bigint,
  author_id bigint NOT NULL,
  body text NOT NULL,
  is_accepted_answer boolean NOT NULL DEFAULT false,
  upvote_count integer NOT NULL DEFAULT 0,
  is_instructor_reply boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.discussion_threads (
  id bigint NOT NULL DEFAULT nextval('discussion_threads_id_seq'::regclass),
  title character varying(500) NOT NULL,
  body text,
  item_type character varying(20) NOT NULL,
  item_id bigint NOT NULL,
  author_id bigint NOT NULL,
  thread_status character varying(20) NOT NULL DEFAULT 'open'::character varying,
  is_pinned boolean NOT NULL DEFAULT false,
  is_answered boolean NOT NULL DEFAULT false,
  reply_count integer NOT NULL DEFAULT 0,
  last_reply_at timestamp with time zone,
  last_reply_by bigint,
  upvote_count integer NOT NULL DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.document_types (
  id bigint NOT NULL,
  name citext NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.documents (
  id bigint NOT NULL,
  document_type_id bigint NOT NULL,
  name citext NOT NULL,
  description text,
  file_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.education_levels (
  id bigint NOT NULL,
  name citext NOT NULL,
  abbreviation text,
  level_order integer NOT NULL DEFAULT 0,
  level_category text NOT NULL DEFAULT 'other'::text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.email_templates (
  id bigint NOT NULL DEFAULT nextval('email_templates_id_seq'::regclass),
  template_key character varying(100) NOT NULL,
  template_name character varying(255) NOT NULL,
  brevo_template_id integer,
  subject character varying(500),
  html_body text,
  text_body text,
  variables jsonb DEFAULT '[]'::jsonb,
  notification_type character varying(50),
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.emoji_categories (
  id bigint NOT NULL DEFAULT nextval('emoji_categories_id_seq'::regclass),
  name character varying(100) NOT NULL,
  slug character varying(100),
  icon character varying(10),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.employee_profiles (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  employee_code text NOT NULL,
  employee_type text NOT NULL DEFAULT 'full_time'::text,
  designation_id bigint NOT NULL,
  department_id bigint NOT NULL,
  branch_id bigint NOT NULL,
  reporting_manager_id bigint,
  joining_date date NOT NULL,
  confirmation_date date,
  probation_end_date date,
  contract_end_date date,
  resignation_date date,
  last_working_date date,
  relieving_date date,
  work_mode text NOT NULL DEFAULT 'on_site'::text,
  shift_type text DEFAULT 'general'::text,
  shift_branch_id bigint,
  work_location text,
  weekly_off_days text DEFAULT 'saturday,sunday'::text,
  pay_grade text,
  salary_currency text DEFAULT 'INR'::text,
  ctc_annual numeric(12,2),
  basic_salary_monthly numeric(10,2),
  payment_mode text DEFAULT 'bank_transfer'::text,
  pf_number text,
  esi_number text,
  uan_number text,
  professional_tax_number text,
  tax_regime text DEFAULT 'new'::text,
  leave_balance_casual numeric(4,1) DEFAULT 0,
  leave_balance_sick numeric(4,1) DEFAULT 0,
  leave_balance_earned numeric(4,1) DEFAULT 0,
  leave_balance_compensatory numeric(4,1) DEFAULT 0,
  total_experience_years numeric(4,1),
  experience_at_joining numeric(4,1),
  has_system_access boolean NOT NULL DEFAULT true,
  has_email_access boolean NOT NULL DEFAULT true,
  has_vpn_access boolean NOT NULL DEFAULT false,
  access_card_number text,
  laptop_asset_id text,
  exit_type text,
  exit_reason text,
  exit_interview_done boolean DEFAULT false,
  full_and_final_done boolean DEFAULT false,
  notice_period_days integer DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.enrollment_progress (
  id bigint NOT NULL DEFAULT nextval('enrollment_progress_id_seq'::regclass),
  enrollment_id bigint NOT NULL,
  user_id bigint NOT NULL,
  content_type character varying(30) NOT NULL,
  content_id bigint NOT NULL,
  progress_status character varying(20) NOT NULL DEFAULT 'not_started'::character varying,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  time_spent_secs integer NOT NULL DEFAULT 0,
  score numeric(5,2),
  max_score numeric(5,2),
  attempts integer NOT NULL DEFAULT 0,
  last_position character varying(100),
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.enrollments (
  id bigint NOT NULL DEFAULT nextval('enrollments_id_seq'::regclass),
  user_id bigint NOT NULL,
  order_id bigint,
  order_item_id bigint,
  item_type character varying(20) NOT NULL,
  item_id bigint NOT NULL,
  enrollment_status character varying(30) NOT NULL DEFAULT 'active'::character varying,
  enrolled_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  expires_at timestamp with time zone,
  progress_pct numeric(5,2) NOT NULL DEFAULT 0,
  last_accessed_at timestamp with time zone,
  certificate_url character varying(500),
  certificate_issued_at timestamp with time zone,
  notes text,
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.faq_categories (
  id bigint NOT NULL DEFAULT nextval('faq_categories_id_seq'::regclass),
  name character varying(255) NOT NULL,
  slug character varying(255),
  description text,
  item_type character varying(20),
  item_id bigint,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.faq_category_translations (
  id bigint NOT NULL DEFAULT nextval('faq_category_translations_id_seq'::regclass),
  faq_category_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name character varying(255) NOT NULL,
  description text,
  meta_title character varying(255),
  meta_description text,
  meta_keywords text,
  og_title text,
  og_description text,
  focus_keyword text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.faq_translations (
  id bigint NOT NULL DEFAULT nextval('faq_translations_id_seq'::regclass),
  faq_id bigint NOT NULL,
  language_id bigint NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  meta_title character varying(255),
  meta_description text,
  meta_keywords text,
  og_title text,
  og_description text,
  twitter_title text,
  twitter_description text,
  focus_keyword text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.faqs (
  id bigint NOT NULL DEFAULT nextval('faqs_id_seq'::regclass),
  category_id bigint,
  item_type character varying(20) NOT NULL,
  item_id bigint,
  question text NOT NULL,
  answer text NOT NULL,
  author_id bigint,
  author_type character varying(20) NOT NULL DEFAULT 'system'::character varying,
  display_order integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.instructor_earnings (
  id bigint NOT NULL DEFAULT nextval('instructor_earnings_id_seq'::regclass),
  instructor_id bigint NOT NULL,
  order_id bigint,
  order_item_id bigint,
  item_type character varying(20) NOT NULL,
  item_id bigint NOT NULL,
  student_id bigint,
  order_amount numeric(12,2) NOT NULL DEFAULT 0,
  platform_fee numeric(12,2) NOT NULL DEFAULT 0,
  gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  instructor_share numeric(5,2) NOT NULL DEFAULT 70.00,
  earning_amount numeric(12,2) NOT NULL DEFAULT 0,
  earning_status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
  confirmed_at timestamp with time zone,
  paid_at timestamp with time zone,
  reversed_at timestamp with time zone,
  reversal_reason text,
  payout_request_id bigint,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.instructor_profiles (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  instructor_code text NOT NULL,
  instructor_type text NOT NULL DEFAULT 'external'::text,
  designation_id bigint,
  department_id bigint,
  branch_id bigint,
  joining_date date,
  specialization_id bigint,
  secondary_specialization_id bigint,
  teaching_experience_years numeric(4,1),
  industry_experience_years numeric(4,1),
  total_experience_years numeric(4,1),
  preferred_teaching_language_id bigint,
  teaching_mode text NOT NULL DEFAULT 'online'::text,
  instructor_bio text,
  tagline text,
  demo_video_url text,
  intro_video_duration_sec integer,
  highest_qualification text,
  certifications_summary text,
  awards_and_recognition text,
  publications_count integer NOT NULL DEFAULT 0,
  patents_count integer NOT NULL DEFAULT 0,
  total_courses_created integer NOT NULL DEFAULT 0,
  total_courses_published integer NOT NULL DEFAULT 0,
  total_students_taught integer NOT NULL DEFAULT 0,
  total_reviews_received integer NOT NULL DEFAULT 0,
  average_rating numeric(2,1) NOT NULL DEFAULT 0.0,
  total_teaching_hours numeric(8,1) NOT NULL DEFAULT 0,
  total_content_minutes integer NOT NULL DEFAULT 0,
  completion_rate numeric(5,2),
  is_available boolean NOT NULL DEFAULT true,
  available_hours_per_week numeric(4,1),
  available_from date,
  available_until date,
  preferred_time_slots text,
  max_concurrent_courses integer DEFAULT 3,
  payment_model text DEFAULT 'revenue_share'::text,
  revenue_share_percentage numeric(5,2),
  fixed_rate_per_course numeric(10,2),
  hourly_rate numeric(8,2),
  payment_currency text DEFAULT 'INR'::text,
  approval_status text NOT NULL DEFAULT 'pending'::text,
  approved_by bigint,
  approved_at timestamp with time zone,
  rejection_reason text,
  is_verified boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  badge text,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  total_earnings numeric(12,2) NOT NULL DEFAULT 0,
  pending_earnings numeric(12,2) NOT NULL DEFAULT 0,
  total_paid_out numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.instructor_promotion_courses (
  id bigint NOT NULL,
  promotion_id bigint NOT NULL,
  course_id bigint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.instructor_promotions (
  id bigint NOT NULL,
  instructor_id bigint NOT NULL,
  promotion_name text NOT NULL,
  description text,
  promo_code citext,
  discount_type text NOT NULL DEFAULT 'percentage'::text,
  discount_value numeric(10,2) NOT NULL,
  max_discount_amount numeric(10,2),
  min_purchase_amount numeric(10,2),
  applicable_to text NOT NULL DEFAULT 'all_my_courses'::text,
  valid_from timestamp with time zone NOT NULL,
  valid_until timestamp with time zone NOT NULL,
  usage_limit integer,
  usage_per_user smallint NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  promotion_status text NOT NULL DEFAULT 'draft'::text,
  requires_approval boolean NOT NULL DEFAULT true,
  approved_by bigint,
  approved_at timestamp with time zone,
  rejection_reason text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id bigint NOT NULL DEFAULT nextval('invoices_id_seq'::regclass),
  invoice_number character varying(30) NOT NULL,
  order_id bigint NOT NULL,
  user_id bigint NOT NULL,
  payment_id bigint,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  currency character varying(10) NOT NULL DEFAULT 'INR'::character varying,
  invoice_status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
  issued_at timestamp with time zone,
  due_at timestamp with time zone,
  paid_at timestamp with time zone,
  billing_name character varying(255),
  billing_email character varying(255),
  billing_phone character varying(20),
  billing_address text,
  billing_city character varying(100),
  billing_state character varying(100),
  billing_country character varying(100),
  billing_pincode character varying(20),
  gst_number character varying(20),
  pdf_url character varying(500),
  notes text,
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  gst_amount numeric(12,2) DEFAULT 0,
  cgst_amount numeric(12,2) DEFAULT 0,
  sgst_amount numeric(12,2) DEFAULT 0,
  igst_amount numeric(12,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.issued_certificates (
  id bigint NOT NULL,
  template_id bigint NOT NULL,
  user_id bigint NOT NULL,
  enrollment_id bigint,
  certificate_number text NOT NULL,
  certificate_url text,
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoke_reason text,
  score_achieved numeric,
  progress_achieved numeric,
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.languages (
  id bigint NOT NULL,
  name citext NOT NULL,
  native_name text,
  iso_code character varying(10),
  script text,
  for_material boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.learning_goals (
  id bigint NOT NULL,
  name citext NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id bigint NOT NULL DEFAULT nextval('live_sessions_id_seq'::regclass),
  title character varying(500) NOT NULL,
  description text,
  item_type character varying(20) NOT NULL,
  item_id bigint NOT NULL,
  instructor_id bigint NOT NULL,
  session_status character varying(20) NOT NULL DEFAULT 'scheduled'::character varying,
  scheduled_at timestamp with time zone NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  ended_at timestamp with time zone,
  meeting_platform character varying(50) DEFAULT 'zoom'::character varying,
  meeting_url text,
  meeting_id character varying(200),
  meeting_password character varying(100),
  max_attendees integer,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule jsonb,
  parent_session_id bigint,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.login_sessions (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  login_method character varying(20) NOT NULL,
  ip_address inet,
  user_agent text,
  device_type character varying(20),
  refresh_token_hash character varying(128) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_active_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  revoked_at timestamp with time zone,
  revoked_reason character varying(30),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.matching_pair_translations (
  id bigint NOT NULL,
  matching_pair_id bigint NOT NULL,
  language_id bigint NOT NULL,
  left_text text NOT NULL,
  right_text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.matching_pairs (
  id bigint NOT NULL,
  matching_question_id bigint NOT NULL,
  display_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.matching_question_translations (
  id bigint NOT NULL,
  matching_question_id bigint NOT NULL,
  language_id bigint NOT NULL,
  question_text text NOT NULL,
  explanation text,
  hint text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.matching_questions (
  id bigint NOT NULL,
  topic_id bigint NOT NULL,
  code citext NOT NULL,
  slug citext NOT NULL,
  points numeric(6,2) NOT NULL DEFAULT 1.00,
  partial_scoring boolean NOT NULL DEFAULT false,
  display_order smallint NOT NULL DEFAULT 0,
  difficulty_level text NOT NULL DEFAULT 'medium'::text,
  is_mandatory boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.mcq_option_translations (
  id bigint NOT NULL,
  mcq_option_id bigint NOT NULL,
  language_id bigint NOT NULL,
  option_text text NOT NULL,
  image text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.mcq_options (
  id bigint NOT NULL,
  mcq_question_id bigint NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  display_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.mcq_question_translations (
  id bigint NOT NULL,
  mcq_question_id bigint NOT NULL,
  language_id bigint NOT NULL,
  question_text text NOT NULL,
  explanation text,
  hint text,
  image_1 text,
  image_2 text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  hint_text text,
  explanation_text text
);

CREATE TABLE IF NOT EXISTS public.mcq_questions (
  id bigint NOT NULL,
  topic_id bigint NOT NULL,
  mcq_type text NOT NULL DEFAULT 'single'::text,
  code citext,
  slug citext,
  points numeric(6,2) NOT NULL DEFAULT 1.00,
  display_order smallint NOT NULL DEFAULT 0,
  difficulty_level text DEFAULT 'medium'::text,
  is_mandatory boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id bigint NOT NULL DEFAULT nextval('notification_preferences_id_seq'::regclass),
  user_id bigint NOT NULL,
  notification_type character varying(50) NOT NULL,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  in_app_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id bigint NOT NULL DEFAULT nextval('notifications_id_seq'::regclass),
  user_id bigint NOT NULL,
  notification_type character varying(50) NOT NULL,
  title character varying(255) NOT NULL,
  message text,
  channel character varying(20) NOT NULL DEFAULT 'in_app'::character varying,
  delivery_status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamp with time zone,
  reference_type character varying(50),
  reference_id bigint,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.one_word_question_translations (
  id bigint NOT NULL,
  one_word_question_id bigint NOT NULL,
  language_id bigint NOT NULL,
  question_text text NOT NULL,
  correct_answer text NOT NULL,
  explanation text,
  hint text,
  image_1 text,
  image_2 text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.one_word_questions (
  id bigint NOT NULL,
  topic_id bigint NOT NULL,
  question_type text NOT NULL DEFAULT 'one_word'::text,
  code citext,
  slug citext,
  points numeric(6,2) NOT NULL DEFAULT 1.00,
  is_case_sensitive boolean NOT NULL DEFAULT false,
  is_trim_whitespace boolean NOT NULL DEFAULT true,
  display_order smallint NOT NULL DEFAULT 0,
  difficulty_level text DEFAULT 'medium'::text,
  is_mandatory boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.one_word_synonym_translations (
  id bigint NOT NULL,
  one_word_synonym_id bigint NOT NULL,
  language_id bigint NOT NULL,
  synonym_text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.one_word_synonyms (
  id bigint NOT NULL,
  one_word_question_id bigint NOT NULL,
  display_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id bigint NOT NULL DEFAULT nextval('order_items_id_seq'::regclass),
  order_id bigint NOT NULL,
  item_type character varying(20) NOT NULL,
  item_id bigint NOT NULL,
  item_name character varying(500),
  item_slug character varying(500),
  original_price numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  final_price numeric(10,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ordering_item_translations (
  id bigint NOT NULL,
  ordering_item_id bigint NOT NULL,
  language_id bigint NOT NULL,
  item_text text NOT NULL,
  image text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ordering_items (
  id bigint NOT NULL,
  ordering_question_id bigint NOT NULL,
  correct_position smallint NOT NULL,
  display_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ordering_question_translations (
  id bigint NOT NULL,
  ordering_question_id bigint NOT NULL,
  language_id bigint NOT NULL,
  question_text text NOT NULL,
  explanation text,
  hint text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ordering_questions (
  id bigint NOT NULL,
  topic_id bigint NOT NULL,
  code citext,
  slug citext,
  points numeric(6,2) NOT NULL DEFAULT 1.00,
  partial_scoring boolean NOT NULL DEFAULT false,
  display_order smallint NOT NULL DEFAULT 0,
  difficulty_level text DEFAULT 'medium'::text,
  is_mandatory boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.orders (
  id bigint NOT NULL DEFAULT nextval('orders_id_seq'::regclass),
  order_number character varying(30) NOT NULL,
  user_id bigint NOT NULL,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  currency character varying(10) NOT NULL DEFAULT 'INR'::character varying,
  coupon_id bigint,
  coupon_code character varying(50),
  promotion_id bigint,
  promo_code character varying(50),
  razorpay_order_id character varying(100),
  razorpay_payment_id character varying(100),
  razorpay_signature character varying(255),
  order_status character varying(30) NOT NULL DEFAULT 'pending'::character varying,
  payment_status character varying(30) NOT NULL DEFAULT 'unpaid'::character varying,
  payment_method character varying(30),
  paid_at timestamp with time zone,
  expires_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  cancellation_reason text,
  notes text,
  admin_notes text,
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.payments (
  id bigint NOT NULL DEFAULT nextval('payments_id_seq'::regclass),
  order_id bigint NOT NULL,
  user_id bigint NOT NULL,
  razorpay_payment_id character varying(100),
  razorpay_order_id character varying(100),
  razorpay_signature character varying(255),
  amount numeric(10,2) NOT NULL DEFAULT 0,
  currency character varying(10) NOT NULL DEFAULT 'INR'::character varying,
  payment_method character varying(30),
  payment_status character varying(30) NOT NULL DEFAULT 'initiated'::character varying,
  bank character varying(100),
  wallet character varying(50),
  vpa character varying(100),
  card_last4 character varying(4),
  card_network character varying(20),
  card_type character varying(20),
  fee numeric(10,2) DEFAULT 0,
  tax numeric(10,2) DEFAULT 0,
  error_code character varying(100),
  error_description text,
  error_source character varying(50),
  error_step character varying(50),
  error_reason character varying(100),
  refund_amount numeric(10,2) DEFAULT 0,
  refunded_at timestamp with time zone,
  captured_at timestamp with time zone,
  ip_address character varying(45),
  user_agent text,
  notes text,
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id bigint NOT NULL DEFAULT nextval('payout_requests_id_seq'::regclass),
  instructor_id bigint NOT NULL,
  request_number character varying(30) NOT NULL,
  requested_amount numeric(12,2) NOT NULL,
  approved_amount numeric(12,2),
  request_status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
  payment_method character varying(30) DEFAULT 'bank_transfer'::character varying,
  bank_details jsonb DEFAULT '{}'::jsonb,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_by bigint,
  reviewed_at timestamp with time zone,
  review_notes text,
  rejection_reason text,
  earnings_from timestamp with time zone,
  earnings_to timestamp with time zone,
  total_orders integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.payout_settlements (
  id bigint NOT NULL DEFAULT nextval('payout_settlements_id_seq'::regclass),
  payout_request_id bigint NOT NULL,
  instructor_id bigint NOT NULL,
  settlement_number character varying(30) NOT NULL,
  settled_amount numeric(12,2) NOT NULL,
  payment_method character varying(30) DEFAULT 'bank_transfer'::character varying,
  transaction_reference character varying(100),
  settlement_status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
  settled_at timestamp with time zone,
  failure_reason text,
  bank_details jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id bigint NOT NULL,
  resource character varying(50) NOT NULL,
  action character varying(30) NOT NULL,
  display_name character varying(150) NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.policies (
  id bigint NOT NULL DEFAULT nextval('policies_id_seq'::regclass),
  policy_type_id bigint NOT NULL,
  version character varying(50) NOT NULL,
  version_notes text,
  title character varying(500) NOT NULL,
  content text NOT NULL,
  content_format character varying(20) NOT NULL DEFAULT 'html'::character varying,
  slug character varying(255),
  meta_title text,
  meta_description text,
  policy_status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
  effective_from date,
  effective_until date,
  is_current boolean NOT NULL DEFAULT false,
  published_at timestamp with time zone,
  created_by bigint,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.policy_translations (
  id bigint NOT NULL DEFAULT nextval('policy_translations_id_seq'::regclass),
  policy_id bigint NOT NULL,
  language_id bigint NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  meta_title text,
  meta_description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.policy_type_translations (
  id bigint NOT NULL DEFAULT nextval('policy_type_translations_id_seq'::regclass),
  policy_type_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.policy_types (
  id bigint NOT NULL DEFAULT nextval('policy_types_id_seq'::regclass),
  name character varying(255) NOT NULL,
  code character varying(50),
  slug character varying(255),
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.post_payment_steps (
  order_id bigint NOT NULL,
  step_name character varying(64) NOT NULL,
  status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
  attempts integer NOT NULL DEFAULT 0,
  result jsonb,
  error text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.project_submissions (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  enrollment_id bigint,
  project_type text NOT NULL,
  project_id bigint NOT NULL,
  submission_url text,
  submission_notes text,
  score numeric(10,2),
  max_score numeric(10,2),
  status text NOT NULL DEFAULT 'submitted'::text,
  feedback text,
  reviewed_by bigint,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id bigint NOT NULL DEFAULT nextval('quick_replies_id_seq'::regclass),
  scope character varying(20) NOT NULL DEFAULT 'personal'::character varying,
  user_id bigint,
  shortcut character varying(50),
  title character varying(100) NOT NULL,
  content text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.quiz_answers (
  id bigint NOT NULL,
  attempt_id bigint NOT NULL,
  question_type text NOT NULL,
  question_id bigint NOT NULL,
  answer_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_correct boolean,
  score numeric(10,2) DEFAULT 0,
  max_score numeric(10,2) DEFAULT 0,
  time_spent_secs integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  enrollment_id bigint,
  quiz_type text NOT NULL,
  quiz_ref_id bigint NOT NULL,
  topic_id bigint,
  score numeric(10,2) DEFAULT 0,
  max_score numeric(10,2) DEFAULT 0,
  pct_score numeric(5,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress'::text,
  attempt_number integer NOT NULL DEFAULT 1,
  time_spent_secs integer DEFAULT 0,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  submitted_at timestamp with time zone,
  graded_at timestamp with time zone,
  graded_by bigint,
  feedback text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id bigint NOT NULL,
  student_id bigint NOT NULL,
  referral_code citext NOT NULL,
  discount_percentage numeric(5,2) NOT NULL DEFAULT 20.00,
  max_discount_amount numeric(10,2),
  referrer_reward_percentage numeric(5,2) NOT NULL DEFAULT 10.00,
  referrer_reward_type text NOT NULL DEFAULT 'wallet_credit'::text,
  total_referrals integer NOT NULL DEFAULT 0,
  successful_referrals integer NOT NULL DEFAULT 0,
  total_earnings numeric(10,2) NOT NULL DEFAULT 0.00,
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  referrer_reward_amount numeric(12,2) DEFAULT NULL::numeric
);

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id bigint NOT NULL,
  referral_code_id bigint NOT NULL,
  referral_usage_id bigint NOT NULL,
  reward_type text NOT NULL DEFAULT 'wallet_credit'::text,
  reward_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'pending'::text,
  credited_at timestamp with time zone,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_usages (
  id bigint NOT NULL,
  referral_code_id bigint NOT NULL,
  referred_user_id bigint NOT NULL,
  usage_status text NOT NULL DEFAULT 'pending'::text,
  discount_applied numeric(10,2) DEFAULT 0.00,
  order_id bigint,
  order_amount numeric(10,2),
  converted_at timestamp with time zone,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id bigint NOT NULL DEFAULT nextval('refunds_id_seq'::regclass),
  refund_number character varying(30) NOT NULL,
  order_id bigint NOT NULL,
  payment_id bigint NOT NULL,
  user_id bigint NOT NULL,
  razorpay_refund_id character varying(100),
  amount numeric(10,2) NOT NULL DEFAULT 0,
  currency character varying(10) NOT NULL DEFAULT 'INR'::character varying,
  refund_status character varying(20) NOT NULL DEFAULT 'requested'::character varying,
  refund_type character varying(20) NOT NULL DEFAULT 'full'::character varying,
  reason text,
  admin_notes text,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  approved_by bigint,
  processed_at timestamp with time zone,
  completed_at timestamp with time zone,
  rejected_at timestamp with time zone,
  rejected_by bigint,
  rejection_reason text,
  notes text,
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.resource_access (
  id bigint NOT NULL,
  resource_type character varying(50) NOT NULL,
  resource_id bigint NOT NULL,
  user_id bigint NOT NULL,
  access_level character varying(20) NOT NULL DEFAULT 'owner'::character varying,
  granted_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_helpfulness (
  id bigint NOT NULL DEFAULT nextval('review_helpfulness_id_seq'::regclass),
  review_id bigint NOT NULL,
  user_id bigint NOT NULL,
  is_helpful boolean NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id bigint NOT NULL DEFAULT nextval('reviews_id_seq'::regclass),
  user_id bigint NOT NULL,
  item_type character varying(20) NOT NULL,
  item_id bigint NOT NULL,
  rating smallint NOT NULL,
  title character varying(255),
  review_text text,
  status character varying(20) NOT NULL DEFAULT 'published'::character varying,
  is_verified_purchase boolean NOT NULL DEFAULT false,
  admin_notes text,
  helpful_count integer NOT NULL DEFAULT 0,
  reported_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id bigint NOT NULL,
  role_id bigint NOT NULL,
  permission_id bigint NOT NULL,
  conditions jsonb,
  granted_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id bigint NOT NULL,
  name character varying(50) NOT NULL,
  display_name character varying(100) NOT NULL,
  description text,
  level smallint NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.session_attendance (
  id bigint NOT NULL DEFAULT nextval('session_attendance_id_seq'::regclass),
  session_id bigint NOT NULL,
  user_id bigint NOT NULL,
  attendance_status character varying(20) NOT NULL DEFAULT 'registered'::character varying,
  joined_at timestamp with time zone,
  left_at timestamp with time zone,
  duration_attended integer DEFAULT 0,
  feedback text,
  rating smallint,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.session_recordings (
  id bigint NOT NULL DEFAULT nextval('session_recordings_id_seq'::regclass),
  session_id bigint NOT NULL,
  title character varying(500),
  recording_url text,
  bunny_video_id character varying(200),
  duration_seconds integer,
  file_size_bytes bigint,
  recording_status character varying(20) NOT NULL DEFAULT 'processing'::character varying,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.skills (
  id bigint NOT NULL,
  name citext NOT NULL,
  category text NOT NULL DEFAULT 'technical'::text,
  description text,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.social_medias (
  id bigint NOT NULL,
  name citext NOT NULL,
  code citext NOT NULL,
  base_url text,
  icon text,
  placeholder text,
  platform_type text NOT NULL DEFAULT 'social'::text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.specializations (
  id bigint NOT NULL,
  name citext NOT NULL,
  category text NOT NULL DEFAULT 'technology'::text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.states (
  id bigint NOT NULL,
  country_id bigint NOT NULL,
  name text NOT NULL,
  state_code character varying(10),
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.sticker_categories (
  id bigint NOT NULL DEFAULT nextval('sticker_categories_id_seq'::regclass),
  name character varying(100) NOT NULL,
  slug character varying(100),
  thumbnail_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.stickers (
  id bigint NOT NULL DEFAULT nextval('stickers_id_seq'::regclass),
  category_id bigint NOT NULL,
  name character varying(100) NOT NULL,
  slug character varying(100),
  image_url text NOT NULL,
  is_animated boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.student_profiles (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  enrollment_number text NOT NULL,
  enrollment_date date NOT NULL DEFAULT CURRENT_DATE,
  enrollment_type text NOT NULL DEFAULT 'self'::text,
  education_level_id bigint,
  current_institution text,
  current_field_of_study text,
  current_semester_or_year text,
  expected_graduation_date date,
  is_currently_studying boolean NOT NULL DEFAULT false,
  learning_goal_id bigint,
  specialization_id bigint,
  preferred_learning_mode text DEFAULT 'self_paced'::text,
  preferred_learning_language_id bigint,
  preferred_content_type text DEFAULT 'video'::text,
  daily_learning_hours numeric(3,1),
  weekly_available_days integer DEFAULT 5,
  difficulty_preference text DEFAULT 'intermediate'::text,
  parent_guardian_name text,
  parent_guardian_phone text,
  parent_guardian_email citext,
  parent_guardian_relation text,
  courses_enrolled integer NOT NULL DEFAULT 0,
  courses_completed integer NOT NULL DEFAULT 0,
  courses_in_progress integer NOT NULL DEFAULT 0,
  certificates_earned integer NOT NULL DEFAULT 0,
  total_learning_hours numeric(8,1) NOT NULL DEFAULT 0,
  average_score numeric(5,2),
  current_streak_days integer NOT NULL DEFAULT 0,
  longest_streak_days integer NOT NULL DEFAULT 0,
  xp_points integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  subscription_plan text DEFAULT 'free'::text,
  subscription_start_date date,
  subscription_end_date date,
  total_amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  has_active_subscription boolean NOT NULL DEFAULT false,
  referred_by_user_id bigint,
  referral_code text,
  is_seeking_job boolean NOT NULL DEFAULT false,
  preferred_job_roles text,
  preferred_locations text,
  expected_salary_range text,
  resume_url text,
  portfolio_url text,
  is_open_to_internship boolean NOT NULL DEFAULT false,
  is_open_to_freelance boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  referral_code_used character varying(50) DEFAULT NULL::character varying,
  total_quiz_attempts integer NOT NULL DEFAULT 0,
  last_active_at timestamp with time zone,
  total_badges_earned integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sub_categories (
  id bigint NOT NULL,
  category_id bigint NOT NULL,
  code citext NOT NULL,
  slug citext NOT NULL,
  display_order smallint DEFAULT 0,
  image text,
  is_new boolean NOT NULL DEFAULT false,
  new_until date,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  og_site_name text,
  og_type text,
  twitter_site text,
  twitter_card text,
  robots_directive text,
  created_by bigint,
  updated_by bigint,
  deleted_by bigint,
  name text
);

CREATE TABLE IF NOT EXISTS public.sub_category_translations (
  id bigint NOT NULL,
  sub_category_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name citext NOT NULL,
  description text,
  is_new_title text,
  image text,
  tags jsonb DEFAULT '[]'::jsonb,
  meta_title text,
  meta_description text,
  meta_keywords text,
  canonical_url text,
  og_site_name text,
  og_title text,
  og_description text,
  og_type text,
  og_image text,
  og_url text,
  twitter_site text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  twitter_card text DEFAULT 'summary_large_image'::text,
  robots_directive text DEFAULT 'index,follow'::text,
  focus_keyword text,
  search_vector tsvector DEFAULT (((((setweight(to_tsvector('simple'::regconfig, (COALESCE(name, ''::citext))::text), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_title, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(focus_keyword, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((tags)::text, ''::text)), 'D'::"char")),
  structured_data jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.sub_topic_translations (
  id bigint NOT NULL,
  sub_topic_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name citext NOT NULL,
  short_intro text,
  long_intro text,
  image text,
  video_title text,
  video_description text,
  video_thumbnail text,
  video_duration_minutes integer,
  tags jsonb DEFAULT '[]'::jsonb,
  page text,
  meta_title text,
  meta_description text,
  meta_keywords text,
  canonical_url text,
  og_site_name text,
  og_title text,
  og_description text,
  og_type text,
  og_image text,
  og_url text,
  twitter_site text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  twitter_card character varying(50) DEFAULT 'summary_large_image'::character varying,
  robots_directive text DEFAULT 'index,follow'::text,
  focus_keyword text,
  search_vector tsvector DEFAULT ((((((((setweight(to_tsvector('simple'::regconfig, (COALESCE(name, ''::citext))::text), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(short_intro, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(long_intro, ''::text)), 'C'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_title, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(video_title, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(video_description, ''::text)), 'C'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(focus_keyword, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((tags)::text, ''::text)), 'D'::"char")),
  structured_data jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sub_topics (
  id bigint NOT NULL,
  topic_id bigint NOT NULL,
  slug citext,
  display_order smallint DEFAULT 0,
  difficulty_level text DEFAULT 'beginner'::text,
  estimated_minutes integer,
  view_count bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  video_id text,
  video_url text,
  video_thumbnail_url text,
  video_status text,
  youtube_url text,
  video_source text,
  name text
);

CREATE TABLE IF NOT EXISTS public.subject_translations (
  id bigint NOT NULL,
  subject_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name citext NOT NULL,
  short_intro text,
  long_intro text,
  image text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.subjects (
  id bigint NOT NULL,
  code citext NOT NULL,
  slug citext NOT NULL,
  difficulty_level text DEFAULT 'beginner'::text,
  estimated_hours numeric(6,1),
  view_count bigint NOT NULL DEFAULT 0,
  display_order smallint DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  name text
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id bigint NOT NULL DEFAULT nextval('support_tickets_id_seq'::regclass),
  ticket_number character varying(30) NOT NULL,
  subject character varying(500) NOT NULL,
  description text,
  category_id bigint,
  priority_id bigint,
  ticket_status character varying(30) NOT NULL DEFAULT 'open'::character varying,
  user_id bigint NOT NULL,
  assigned_to bigint,
  related_type character varying(30),
  related_id bigint,
  resolved_at timestamp with time zone,
  closed_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.system_activity_log (
  id bigint NOT NULL,
  level character varying(10) NOT NULL DEFAULT 'info'::character varying,
  source character varying(50) NOT NULL,
  action character varying(50) NOT NULL,
  message text NOT NULL,
  user_id bigint,
  ip_address inet,
  endpoint character varying(255),
  http_method character varying(10),
  status_code smallint,
  response_time integer,
  error_stack text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.table_summary (
  id integer NOT NULL,
  table_name citext NOT NULL,
  is_active integer NOT NULL DEFAULT 0,
  is_inactive integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_deleted integer NOT NULL DEFAULT 0,
  total integer DEFAULT (is_active + is_inactive)
);

CREATE TABLE IF NOT EXISTS public.ticket_attachments (
  id bigint NOT NULL DEFAULT nextval('ticket_attachments_id_seq'::regclass),
  ticket_id bigint NOT NULL,
  message_id bigint,
  file_name character varying(500) NOT NULL,
  file_url text NOT NULL,
  file_size bigint DEFAULT 0,
  file_type character varying(100),
  uploaded_by bigint,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id bigint NOT NULL DEFAULT nextval('ticket_categories_id_seq'::regclass),
  name character varying(255) NOT NULL,
  slug character varying(255),
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id bigint NOT NULL DEFAULT nextval('ticket_messages_id_seq'::regclass),
  ticket_id bigint NOT NULL,
  sender_id bigint NOT NULL,
  sender_type character varying(20) NOT NULL DEFAULT 'user'::character varying,
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ticket_priorities (
  id bigint NOT NULL DEFAULT nextval('ticket_priorities_id_seq'::regclass),
  name character varying(100) NOT NULL,
  code character varying(20),
  color character varying(20) DEFAULT '#6b7280'::character varying,
  sla_hours integer NOT NULL DEFAULT 24,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id bigint NOT NULL DEFAULT nextval('ticket_status_history_id_seq'::regclass),
  ticket_id bigint NOT NULL,
  from_status character varying(30),
  to_status character varying(30) NOT NULL,
  changed_by bigint,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.topic_translations (
  id bigint NOT NULL,
  topic_id bigint NOT NULL,
  language_id bigint NOT NULL,
  name citext NOT NULL,
  short_intro text,
  long_intro text,
  prerequisites text,
  learning_objectives text,
  image text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint
);

CREATE TABLE IF NOT EXISTS public.topics (
  id bigint NOT NULL,
  chapter_id bigint,
  slug citext,
  display_order smallint DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  name text
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id bigint NOT NULL DEFAULT nextval('transactions_id_seq'::regclass),
  transaction_number character varying(30) NOT NULL,
  order_id bigint,
  payment_id bigint,
  user_id bigint NOT NULL,
  transaction_type character varying(30) NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  currency character varying(10) NOT NULL DEFAULT 'INR'::character varying,
  balance_before numeric(10,2),
  balance_after numeric(10,2),
  description text,
  reference_type character varying(30),
  reference_id bigint,
  razorpay_refund_id character varying(100),
  razorpay_payment_id character varying(100),
  status character varying(20) NOT NULL DEFAULT 'completed'::character varying,
  notes text,
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.user_badges (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  badge_id bigint NOT NULL,
  enrollment_id bigint,
  earned_at timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_documents (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  document_type_id bigint NOT NULL,
  document_number text,
  file text NOT NULL,
  issue_date date,
  expiry_date date,
  verification_status text NOT NULL DEFAULT 'pending'::text,
  verified_by bigint,
  verified_at timestamp with time zone,
  rejection_reason text,
  admin_notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by bigint,
  deleted_at timestamp with time zone,
  deleted_by bigint,
  document_id bigint
);

CREATE TABLE IF NOT EXISTS public.user_education (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  education_level_id bigint NOT NULL,
  institution_name text NOT NULL,
  board_or_university text,
  field_of_study text,
  specialization text,
  grade_or_percentage text,
  grade_type text,
  start_date date,
  end_date date,
  is_currently_studying boolean NOT NULL DEFAULT false,
  is_highest_qualification boolean NOT NULL DEFAULT false,
  certificate_url text,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone,
  deleted_by bigint
);

CREATE TABLE IF NOT EXISTS public.user_experience (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  designation_id bigint,
  company_name text NOT NULL,
  job_title text NOT NULL,
  employment_type text NOT NULL DEFAULT 'full_time'::text,
  department text,
  location text,
  work_mode text DEFAULT 'on_site'::text,
  start_date date NOT NULL,
  end_date date,
  is_current_job boolean NOT NULL DEFAULT false,
  description text,
  key_achievements text,
  skills_used text,
  salary_range text,
  reference_name text,
  reference_phone text,
  reference_email citext,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by bigint,
  deleted_at timestamp with time zone,
  deleted_by bigint
);

CREATE TABLE IF NOT EXISTS public.user_languages (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  language_id bigint NOT NULL,
  proficiency_level text NOT NULL DEFAULT 'basic'::text,
  can_read boolean NOT NULL DEFAULT false,
  can_write boolean NOT NULL DEFAULT false,
  can_speak boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  is_native boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by bigint,
  deleted_at timestamp with time zone,
  deleted_by bigint
);

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  permission_id bigint NOT NULL,
  type character varying(10) NOT NULL DEFAULT 'grant'::character varying,
  scope character varying(20) NOT NULL DEFAULT 'global'::character varying,
  scope_id bigint,
  reason text,
  expires_at timestamp with time zone,
  granted_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id bigint NOT NULL DEFAULT nextval('user_profiles_id_seq'::regclass),
  user_id bigint NOT NULL,
  date_of_birth date,
  gender character varying(20),
  blood_group character varying(5),
  marital_status character varying(20),
  profile_image_url text,
  cover_image_url text,
  permanent_address_line1 character varying(255),
  permanent_address_line2 character varying(255),
  permanent_city_id bigint,
  permanent_state_id bigint,
  permanent_country_id bigint,
  permanent_postal_code character varying(20),
  current_address_line1 character varying(255),
  current_address_line2 character varying(255),
  current_city_id bigint,
  current_state_id bigint,
  current_country_id bigint,
  current_postal_code character varying(20),
  alternate_email character varying(255),
  alternate_phone character varying(20),
  emergency_contact_name character varying(100),
  emergency_contact_relationship character varying(50),
  emergency_contact_phone character varying(20),
  emergency_contact_email character varying(255),
  aadhar_number character varying(12),
  pan_number character varying(10),
  passport_number character varying(20),
  driving_license_number character varying(20),
  voter_id character varying(20),
  bank_account_name character varying(100),
  bank_account_number character varying(30),
  bank_ifsc_code character varying(11),
  bank_name character varying(100),
  bank_branch character varying(100),
  preferred_language_id bigint,
  notification_email boolean DEFAULT true,
  notification_sms boolean DEFAULT true,
  notification_push boolean DEFAULT true,
  profile_completion_percentage smallint DEFAULT 0,
  is_profile_verified boolean DEFAULT false,
  profile_verified_at timestamp with time zone,
  profile_verified_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by bigint,
  updated_by bigint,
  deleted_at timestamp with time zone,
  deleted_by bigint,
  upi_id character varying(100),
  upi_number character varying(20),
  is_profile_public boolean NOT NULL DEFAULT false,
  profile_slug citext,
  bio text,
  headline text
);

CREATE TABLE IF NOT EXISTS public.user_projects (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  project_title text NOT NULL,
  project_code citext,
  project_type text NOT NULL DEFAULT 'personal'::text,
  description text,
  objectives text,
  role_in_project text,
  responsibilities text,
  team_size smallint,
  is_solo_project boolean NOT NULL DEFAULT false,
  organization_name text,
  client_name text,
  industry text,
  technologies_used text,
  tools_used text,
  programming_languages text,
  frameworks text,
  databases_used text,
  platform text,
  start_date date,
  end_date date,
  is_ongoing boolean NOT NULL DEFAULT false,
  duration_months smallint,
  project_status text NOT NULL DEFAULT 'completed'::text,
  key_achievements text,
  challenges_faced text,
  lessons_learned text,
  impact_summary text,
  users_served text,
  project_url text,
  repository_url text,
  demo_url text,
  documentation_url text,
  thumbnail_url text,
  case_study_url text,
  is_featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  awards text,
  certifications text,
  reference_name text,
  reference_email citext,
  reference_phone text,
  display_order smallint DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by bigint,
  deleted_at timestamp with time zone,
  deleted_by bigint
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  role_id bigint NOT NULL,
  scope character varying(20) NOT NULL DEFAULT 'global'::character varying,
  scope_id bigint,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamp with time zone,
  granted_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_skills (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  skill_id bigint NOT NULL,
  proficiency_level text NOT NULL DEFAULT 'beginner'::text,
  years_of_experience numeric(4,1),
  is_primary boolean NOT NULL DEFAULT false,
  certificate_url text,
  endorsement_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by bigint,
  deleted_at timestamp with time zone,
  deleted_by bigint
);

CREATE TABLE IF NOT EXISTS public.user_social_medias (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  social_media_id bigint NOT NULL,
  profile_url text NOT NULL,
  username text,
  is_primary boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by bigint,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by bigint,
  deleted_at timestamp with time zone,
  deleted_by bigint
);

CREATE TABLE IF NOT EXISTS public.users (
  id bigint NOT NULL,
  first_name character varying(75) NOT NULL,
  last_name character varying(75) NOT NULL,
  full_name character varying(150) DEFAULT (((first_name)::text || ' '::text) || (last_name)::text),
  display_name character varying(50),
  avatar_url text,
  email character varying(255) NOT NULL,
  mobile character varying(15) NOT NULL,
  password_hash character varying(255) NOT NULL,
  status character varying(20) NOT NULL DEFAULT 'active'::character varying,
  locale character varying(5) NOT NULL DEFAULT 'hi'::character varying,
  preferences jsonb NOT NULL DEFAULT '{"theme": "system", "language": "hi", "notifications_sms": true, "notifications_email": true}'::jsonb,
  last_login_at timestamp with time zone,
  last_login_method character varying(20),
  login_count integer NOT NULL DEFAULT 0,
  password_changed_at timestamp with time zone,
  failed_login_count smallint NOT NULL DEFAULT 0,
  locked_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  type text NOT NULL DEFAULT 'student'::text
);

CREATE TABLE IF NOT EXISTS public.video_watch_history (
  id bigint NOT NULL,
  user_id bigint NOT NULL,
  enrollment_id bigint,
  content_type text NOT NULL,
  content_id bigint NOT NULL,
  video_url text,
  watch_duration_secs integer NOT NULL DEFAULT 0,
  total_duration_secs integer NOT NULL DEFAULT 0,
  last_position_secs integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  watched_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id bigint NOT NULL DEFAULT nextval('wallet_transactions_id_seq'::regclass),
  wallet_id bigint NOT NULL,
  transaction_type character varying(20) NOT NULL,
  amount numeric(12,2) NOT NULL,
  balance_before numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  source_type character varying(30),
  source_id bigint,
  description text,
  status character varying(20) NOT NULL DEFAULT 'completed'::character varying,
  metadata jsonb,
  created_by bigint,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.wallets (
  id bigint NOT NULL DEFAULT nextval('wallets_id_seq'::regclass),
  user_id bigint NOT NULL,
  balance numeric(12,2) NOT NULL DEFAULT 0.00,
  total_credited numeric(12,2) NOT NULL DEFAULT 0.00,
  total_debited numeric(12,2) NOT NULL DEFAULT 0.00,
  total_withdrawn numeric(12,2) NOT NULL DEFAULT 0.00,
  currency character varying(5) NOT NULL DEFAULT 'INR'::character varying,
  is_frozen boolean NOT NULL DEFAULT false,
  auto_payout_enabled boolean NOT NULL DEFAULT false,
  payout_day integer,
  min_payout_amount numeric(12,2) NOT NULL DEFAULT 500.00,
  payout_method character varying(20),
  payout_details jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id bigint NOT NULL DEFAULT nextval('webhook_events_id_seq'::regclass),
  provider character varying(32) NOT NULL,
  event_id character varying(255) NOT NULL,
  event_type character varying(100) NOT NULL,
  payload_hash character varying(64),
  payload jsonb,
  status character varying(20) NOT NULL DEFAULT 'received'::character varying,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  related_type character varying(50),
  related_id bigint,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  ip_address character varying(45),
  user_agent text
);

CREATE TABLE IF NOT EXISTS public.webinar_translations (
  id bigint NOT NULL,
  webinar_id bigint NOT NULL,
  language_id bigint NOT NULL,
  title citext NOT NULL,
  description text,
  short_description text,
  thumbnail text,
  tags jsonb DEFAULT '[]'::jsonb,
  meta_title text,
  meta_description text,
  meta_keywords text,
  canonical_url text,
  og_site_name text,
  og_title text,
  og_description text,
  og_type text,
  og_image text,
  og_url text,
  twitter_site text,
  twitter_title text,
  twitter_description text,
  twitter_image text,
  twitter_card text DEFAULT 'summary_large_image'::text,
  robots_directive text DEFAULT 'index,follow'::text,
  focus_keyword text,
  search_vector tsvector DEFAULT ((((((setweight(to_tsvector('simple'::regconfig, COALESCE((title)::text, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(short_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_title, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(meta_description, ''::text)), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(focus_keyword, ''::text)), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE((tags)::text, ''::text)), 'D'::"char")),
  structured_data jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webinars (
  id bigint NOT NULL,
  webinar_owner text NOT NULL DEFAULT 'system'::text,
  instructor_id bigint,
  title citext NOT NULL,
  course_id bigint,
  chapter_id bigint,
  code citext,
  slug citext,
  is_free boolean NOT NULL DEFAULT false,
  price numeric(10,2) NOT NULL DEFAULT 0.00,
  scheduled_at timestamp with time zone,
  duration_minutes smallint,
  max_attendees integer,
  registered_count integer NOT NULL DEFAULT 0,
  meeting_platform text DEFAULT 'zoom'::text,
  meeting_url text,
  meeting_id text,
  meeting_password text,
  recording_url text,
  webinar_status text NOT NULL DEFAULT 'scheduled'::text,
  display_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  rating_average numeric NOT NULL DEFAULT 0.00,
  rating_count bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.wishlists (
  id bigint NOT NULL DEFAULT nextval('wishlists_id_seq'::regclass),
  user_id bigint NOT NULL,
  item_type character varying(20) NOT NULL,
  item_id bigint NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by bigint,
  updated_by bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.youtube_descriptions (
  id integer NOT NULL DEFAULT nextval('youtube_descriptions_id_seq'::regclass),
  sub_topic_id integer NOT NULL,
  video_title text,
  description text,
  source_file_path text,
  generated_by integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youtube_url_archive (
  id integer NOT NULL DEFAULT nextval('youtube_url_archive_id_seq'::regclass),
  subject_slug text NOT NULL,
  chapter_slug text NOT NULL,
  topic_slug text NOT NULL,
  sub_topic_slug text NOT NULL,
  sub_topic_display_order integer,
  youtube_url text NOT NULL,
  video_source text DEFAULT 'youtube'::text,
  archived_at timestamp with time zone DEFAULT now(),
  restored_at timestamp with time zone,
  archived_by integer
);