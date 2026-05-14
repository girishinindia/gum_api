-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ─────────────────────────────────────────────────────────────────
-- Phase 13.4 — Trim instructor_profiles (62 cols → 30 cols)
--
-- Keep list (used by Phase 8 + 9 code paths):
--   id, user_id, instructor_code, instructor_type, badge,
--   approval_status, approved_at, approved_by, rejection_reason,
--   is_active, is_verified, is_featured,
--   gstin, pan_number, pan_verified,
--   payment_model, payment_currency, hourly_rate,
--   fixed_rate_per_course, revenue_share_percentage,
--   total_earnings, pending_earnings, total_paid_out,
--   average_rating, total_reviews_received,
--   created_at, updated_at, deleted_at, created_by, updated_by
--
-- Applied to live DB on 2026-05-13 via two Supabase MCP migrations:
--   - phase13_trim_instructor_profiles
--   - phase13_fn_search_instructors_post_trim_v2
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.instructor_profiles
  DROP COLUMN IF EXISTS tagline,
  DROP COLUMN IF EXISTS instructor_bio,
  DROP COLUMN IF EXISTS demo_video_url,
  DROP COLUMN IF EXISTS intro_video_duration_sec,
  DROP COLUMN IF EXISTS teaching_mode,
  DROP COLUMN IF EXISTS teaching_experience_years,
  DROP COLUMN IF EXISTS total_teaching_hours,
  DROP COLUMN IF EXISTS industry_experience_years,
  DROP COLUMN IF EXISTS specialization_id,
  DROP COLUMN IF EXISTS secondary_specialization_id,
  DROP COLUMN IF EXISTS preferred_teaching_language_id,
  DROP COLUMN IF EXISTS preferred_time_slots,
  DROP COLUMN IF EXISTS highest_qualification,
  DROP COLUMN IF EXISTS certifications_summary,
  DROP COLUMN IF EXISTS awards_and_recognition,
  DROP COLUMN IF EXISTS max_concurrent_courses,
  DROP COLUMN IF EXISTS available_from,
  DROP COLUMN IF EXISTS available_until,
  DROP COLUMN IF EXISTS available_hours_per_week,
  DROP COLUMN IF EXISTS is_available,
  DROP COLUMN IF EXISTS total_courses_created,
  DROP COLUMN IF EXISTS total_courses_published,
  DROP COLUMN IF EXISTS total_students_taught,
  DROP COLUMN IF EXISTS completion_rate,
  DROP COLUMN IF EXISTS total_content_minutes,
  DROP COLUMN IF EXISTS patents_count,
  DROP COLUMN IF EXISTS publications_count,
  DROP COLUMN IF EXISTS joining_date,
  DROP COLUMN IF EXISTS branch_id,
  DROP COLUMN IF EXISTS department_id,
  DROP COLUMN IF EXISTS designation_id,
  DROP COLUMN IF EXISTS total_experience_years;

DROP INDEX IF EXISTS public.instructor_profiles_tagline_trgm_idx;
DROP INDEX IF EXISTS public.instructor_profiles_bio_trgm_idx;

-- ─── Rebuild fn_search_instructors after the drop ───
DROP FUNCTION IF EXISTS public.fn_search_instructors(text, int, int);

CREATE OR REPLACE FUNCTION public.fn_search_instructors(
  q       text,
  lim     int  DEFAULT 25,
  ofs     int  DEFAULT 0
)
RETURNS TABLE (
  id              bigint,
  user_id         bigint,
  display_name    text,
  badge           text,
  similarity      real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  WITH base AS (
    SELECT ip.id,
           u.id AS user_id,
           COALESCE(NULLIF(u.display_name, ''),
                    TRIM(BOTH FROM (COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')))
           ) AS display_name,
           ip.badge
      FROM public.instructor_profiles ip
      JOIN public.users u ON u.id = ip.user_id
     WHERE ip.is_active = true
       AND ip.deleted_at IS NULL
       AND ip.approval_status = 'approved'
       AND u.deleted_at IS NULL
  )
  SELECT b.id, b.user_id, b.display_name, b.badge,
         similarity(COALESCE(b.display_name, ''), q) AS similarity
    FROM base b
   WHERE COALESCE(b.display_name, '') % q
   ORDER BY similarity DESC, b.id ASC
   OFFSET COALESCE(ofs, 0)
   LIMIT  LEAST(COALESCE(lim, 25), 100);
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_search_instructors(text, int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_search_instructors(text, int, int) TO service_role, authenticated, anon;