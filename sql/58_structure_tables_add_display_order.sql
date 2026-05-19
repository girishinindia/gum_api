-- Phase 44.7 Bug 1 — Course Structure schema drift fix.
--
-- The admin "Save Structure" endpoint writes display_order + sort_order to
-- four tables (course_modules, course_chapters, course_module_subjects,
-- course_chapter_topics). Only course_modules had the columns; the other
-- three never got the migration when drag-reorder was extended past the
-- module level. Every save crashed with PGRST "Could not find display_order
-- column" on whichever table was the first miss.
--
-- This adds the columns + supporting indexes so ORDER BY queries stay fast.
-- All defaults are 0 so existing rows are valid without backfill; UI sort
-- still places them in insertion order until an admin reorders them.

ALTER TABLE public.course_chapters
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order    INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.course_module_subjects
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order    INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.course_chapter_topics
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order    INTEGER NOT NULL DEFAULT 0;

-- Indexes for ORDER BY parent-then-display_order — the structure tree's
-- main read pattern. Partial indexes scoped to non-deleted rows to keep
-- them small.
CREATE INDEX IF NOT EXISTS idx_course_chapters_order
  ON public.course_chapters(course_module_subject_id, display_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_course_module_subjects_order
  ON public.course_module_subjects(course_module_id, display_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_course_chapter_topics_order
  ON public.course_chapter_topics(course_chapter_id, display_order)
  WHERE deleted_at IS NULL;

-- Tell PostgREST to rebuild its schema cache so the new columns are visible
-- via /rest/v1/* immediately, no restart needed.
NOTIFY pgrst, 'reload schema';
