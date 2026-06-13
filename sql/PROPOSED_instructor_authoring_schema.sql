-- =====================================================================
-- PROPOSED — Instructor Authoring Schema  (NOT YET APPLIED)
-- =====================================================================
-- Purpose: a simple, instructor-facing "draft" layer that maps onto the
-- existing canonical course tables only at PUBLISH time. The canonical
-- engine (courses, subjects/chapters/topics/sub_topics, course_modules +
-- junctions, mcq_*, assesment_*, faqs, *_translations) is NEVER written to
-- by instructors directly — only by a publishCourseDraft() service.
--
-- ⚠ This file is for REVIEW ONLY. Do not run it until approved.
--
-- Design decisions baked in (change before building if you disagree):
--   A · Question types : multiple supported via question_type (default mcq)
--   B · Content scope  : COURSE-SCOPED (each draft is private to its course)
--   C · Base language  : instructor picks via language_id (default English)
--   D · Approval       : status flow draft → submitted → pending_approval → published/rejected
--   E · Edit policy    : draft is source-of-truth; re-publish UPDATES canonical
--                        rows via published_ref_* (idempotent), version bumps.
--
-- Conventions matched to the existing codebase:
--   • bigint identity PKs, nullable created_by/updated_by bigint (no FK),
--     soft-delete via deleted_at, text status columns with CHECK constraints.
--   • RLS enabled with a service_role policy (the API uses the service role
--     and enforces instructor ownership in its controllers, like other modules).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. authoring_courses           → courses (+ course_translations via AI)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.authoring_courses (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instructor_id       bigint NOT NULL REFERENCES public.users(id),
  title               text   NOT NULL,
  subtitle            text,
  short_intro         text,
  long_intro           text,
  category_id         bigint REFERENCES public.course_sub_categories(id),
  language_id         bigint REFERENCES public.languages(id),         -- base authoring language
  level               text   NOT NULL DEFAULT 'beginner'
                        CHECK (level IN ('beginner','intermediate','advanced')),
  price               numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  original_price      numeric(10,2) CHECK (original_price IS NULL OR original_price >= 0),
  is_free             boolean NOT NULL DEFAULT false,
  thumbnail_url       text, 
  trailer_video       text,
  has_certificate     boolean NOT NULL DEFAULT false,
  status              text   NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','pending_approval','published','rejected','archived')),
  rejection_reason    text,
  -- Super-admin verification gate: an instructor course must be verified
  -- before it goes live. requires_verification stays true for instructor
  -- drafts; verified_by/at record who cleared it and when.
  requires_verification boolean NOT NULL DEFAULT true,
  verified_by         bigint,
  verified_at         timestamptz,
  last_published_at   timestamptz,
  created_by          bigint,
  updated_by          bigint,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS idx_authoring_courses_instructor ON public.authoring_courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_authoring_courses_status     ON public.authoring_courses(status);


-- ---------------------------------------------------------------------
-- 2. authoring_course_highlights → course_translations bullet fields
--    (prerequisites / what_you_will_learn / skills_gain / course_is_for / requirements)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.authoring_course_highlights (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  authoring_course_id bigint NOT NULL REFERENCES public.authoring_courses(id) ON DELETE CASCADE,
  kind                text   NOT NULL
                        CHECK (kind IN ('prerequisite','outcome','skill','audience','requirement')),
  text                text   NOT NULL,
  display_order       integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_authoring_highlights_course
  ON public.authoring_course_highlights(authoring_course_id, kind, display_order);

-- ---------------------------------------------------------------------
-- 3. authoring_units (self-referencing tree)
--    module  → course_modules (+ auto subject)
--    chapter → chapters (+ course_chapters)
--    topic   → topics + sub_topics (+ course_chapter_topics) / assesment_* by topic_type
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.authoring_units (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  authoring_course_id bigint NOT NULL REFERENCES public.authoring_courses(id) ON DELETE CASCADE,
  parent_unit_id      bigint REFERENCES public.authoring_units(id) ON DELETE CASCADE,  -- null = top-level module
  unit_type           text   NOT NULL CHECK (unit_type IN ('module','chapter','topic')),
  title               text   NOT NULL,
  summary             text,
  display_order       integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),

  -- topic-only fields (null for module/chapter)
  topic_type         text CHECK (topic_type IN ('video','article','quiz','exercise','project')),
  is_free_preview     boolean NOT NULL DEFAULT false,

  -- video
  video           text,
  youtube_url           text,
  video_title     text,
  video_thumbnail text,
  -- article
  article_pdf        text,
  -- exercise
  exercise_pdf     text,
  exercise_solution_pdf   text,
  -- project
  project_pdf        text,
  project_scope        text CHECK (project_scope IS NULL OR project_scope IN ('mini','capstone')),
  project_git_url text,
  -- shared assessment-ish
  points              integer CHECK (points IS NULL OR points >= 0),
  
  created_by          bigint,
  updated_by          bigint,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  -- BUG-16: topics may have a NULL topic_type (the builder no longer forces one);
  -- only non-topics are required to leave it NULL. Kept in sync with migration
  -- 71_relax_authoring_units_topic_type_chk.sql (the production state).
  CONSTRAINT authoring_units_topic_type_chk
    CHECK ( (unit_type = 'topic') OR (topic_type IS NULL) )
);
CREATE INDEX IF NOT EXISTS idx_authoring_units_tree
  ON public.authoring_units(authoring_course_id, parent_unit_id, display_order);
CREATE INDEX IF NOT EXISTS idx_authoring_units_type
  ON public.authoring_units(authoring_course_id, unit_type);

-- ---------------------------------------------------------------------
-- 6. authoring_faqs              → faqs (+ a per-course faq_categories row)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.authoring_faqs (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  authoring_course_id bigint NOT NULL REFERENCES public.authoring_courses(id) ON DELETE CASCADE,
  question            text   NOT NULL,
  answer              text   NOT NULL,
  display_order       integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS idx_authoring_faqs_course
  ON public.authoring_faqs(authoring_course_id, display_order);

-- ---------------------------------------------------------------------
-- RLS — enable + service-role policy (the API uses the service role and
-- enforces instructor ownership in its controllers, like other modules).
-- ---------------------------------------------------------------------
ALTER TABLE public.authoring_courses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authoring_course_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authoring_units             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authoring_faqs              ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'authoring_courses','authoring_course_highlights','authoring_units','authoring_faqs'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      t || '_service_role', t);
  END LOOP;
END $$;

COMMIT;

-- =====================================================================
-- ROLLBACK (if needed):
--   DROP TABLE IF EXISTS public.authoring_faqs, public.authoring_units,
--     public.authoring_course_highlights, public.authoring_courses CASCADE;
-- =====================================================================
