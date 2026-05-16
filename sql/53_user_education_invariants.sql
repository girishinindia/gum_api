-- ============================================================
-- 53_user_education_invariants.sql
--
-- Phase 35.2 — defensive DB invariants on user_education.
--
-- Past bug: rows were ending up with `is_currently_studying = true`
-- AND `end_date IS NOT NULL` — a logically impossible state caused by
-- a race between the client form's "currently studying" toggle and the
-- submit handler. The API now enforces the invariant in both the
-- create and update controllers (35.2), but a CHECK constraint at the
-- DB level makes it impossible for ANY path (raw SQL, a future client
-- regression, a script) to produce the bad state again.
--
-- Also: enforces end_date >= start_date when both are set.
--
-- Idempotent — uses `IF NOT EXISTS` patterns via DO blocks.
-- ============================================================

-- First, repair any rows that still violate the invariant (in case
-- this migration runs against a DB that wasn't already cleaned up).
UPDATE public.user_education
   SET end_date = NULL
 WHERE is_currently_studying = TRUE
   AND end_date IS NOT NULL;

-- Constraint 1: currently studying → end_date must be NULL.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_user_education_currently_studying_no_end_date'
    ) THEN
        ALTER TABLE public.user_education
        ADD CONSTRAINT chk_user_education_currently_studying_no_end_date
        CHECK (
            is_currently_studying IS NOT TRUE
            OR end_date IS NULL
        );
    END IF;
END$$;

-- Constraint 2: when both dates set, end_date must not precede start_date.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_user_education_date_order'
    ) THEN
        ALTER TABLE public.user_education
        ADD CONSTRAINT chk_user_education_date_order
        CHECK (
            start_date IS NULL
            OR end_date  IS NULL
            OR end_date >= start_date
        );
    END IF;
END$$;
