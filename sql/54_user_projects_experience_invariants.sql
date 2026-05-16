-- ============================================================
-- 54_user_projects_experience_invariants.sql
--
-- Phase 38.1 — defensive DB invariants on user_projects and
-- user_experience, mirroring the user_education invariants
-- (migration 53). The same "current → end_date" race-condition class
-- exists in these tables:
--
--   user_projects.is_ongoing  ⇒ end_date IS NULL
--   user_experience.is_current_job ⇒ end_date IS NULL
--
-- Plus date-order sanity (end_date >= start_date when both set).
--
-- Idempotent.
-- ============================================================

-- Repair: clean up any already-inconsistent rows.
UPDATE public.user_projects
   SET end_date = NULL
 WHERE is_ongoing = TRUE
   AND end_date IS NOT NULL;

UPDATE public.user_experience
   SET end_date = NULL
 WHERE is_current_job = TRUE
   AND end_date IS NOT NULL;

-- ── user_projects ──────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_user_projects_ongoing_no_end_date'
    ) THEN
        ALTER TABLE public.user_projects
        ADD CONSTRAINT chk_user_projects_ongoing_no_end_date
        CHECK (is_ongoing IS NOT TRUE OR end_date IS NULL);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_user_projects_date_order'
    ) THEN
        ALTER TABLE public.user_projects
        ADD CONSTRAINT chk_user_projects_date_order
        CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
    END IF;
END$$;

-- ── user_experience ────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_user_experience_current_no_end_date'
    ) THEN
        ALTER TABLE public.user_experience
        ADD CONSTRAINT chk_user_experience_current_no_end_date
        CHECK (is_current_job IS NOT TRUE OR end_date IS NULL);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_user_experience_date_order'
    ) THEN
        ALTER TABLE public.user_experience
        ADD CONSTRAINT chk_user_experience_date_order
        CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
    END IF;
END$$;
