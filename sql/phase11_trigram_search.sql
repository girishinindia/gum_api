-- ─────────────────────────────────────────────────────────────────
-- Phase 11.5 — Trigram fuzzy search
--
-- 11.5.1 — GIN trigram indexes
-- 11.5.2 — fn_search_courses / fn_search_instructors
--
-- Applied to live DB on 2026-05-13 via two Supabase MCP migrations:
--   - phase11_trigram_search_indexes
--   - phase11_search_rpcs           (+ phase11_search_rpcs_fix_display_name)
--
-- Mirrored here for the repo history.
-- ─────────────────────────────────────────────────────────────────

-- ─── 11.5.1 — GIN trigram indexes ────────────────────────────────
CREATE INDEX IF NOT EXISTS courses_name_trgm_idx
  ON public.courses USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS categories_name_trgm_idx
  ON public.categories USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS instructor_profiles_tagline_trgm_idx
  ON public.instructor_profiles USING gin (tagline gin_trgm_ops);

CREATE INDEX IF NOT EXISTS instructor_profiles_bio_trgm_idx
  ON public.instructor_profiles USING gin (LEFT(instructor_bio, 500) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_display_name_trgm_idx
  ON public.users USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_first_name_trgm_idx
  ON public.users USING gin (first_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_last_name_trgm_idx
  ON public.users USING gin (last_name gin_trgm_ops);

ANALYZE public.courses;
ANALYZE public.categories;
ANALYZE public.instructor_profiles;
ANALYZE public.users;


-- ─── 11.5.2 — Search RPCs ────────────────────────────────────────
SET pg_trgm.similarity_threshold = 0.15;


DROP FUNCTION IF EXISTS public.fn_search_courses(text, int, int);

CREATE OR REPLACE FUNCTION public.fn_search_courses(
  q       text,
  lim     int  DEFAULT 25,
  ofs     int  DEFAULT 0
)
RETURNS TABLE (
  id            bigint,
  slug          text,
  name          text,
  price         numeric,
  course_status text,
  similarity    real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT c.id,
         c.slug::text,
         c.name,
         c.price,
         c.course_status,
         similarity(c.name, q) AS similarity
    FROM public.courses c
   WHERE c.is_active = true
     AND c.deleted_at IS NULL
     AND c.course_status = 'published'
     AND c.name % q
   ORDER BY similarity(c.name, q) DESC,
            c.id ASC
   OFFSET COALESCE(ofs, 0)
   LIMIT  LEAST(COALESCE(lim, 25), 100);
$fn$;


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
  tagline         text,
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
           ip.tagline,
           ip.badge,
           ip.instructor_bio
      FROM public.instructor_profiles ip
      JOIN public.users u ON u.id = ip.user_id
     WHERE ip.is_active = true
       AND ip.deleted_at IS NULL
       AND ip.approval_status = 'approved'
       AND u.deleted_at IS NULL
  )
  SELECT b.id,
         b.user_id,
         b.display_name,
         b.tagline,
         b.badge,
         GREATEST(
           similarity(COALESCE(b.display_name, ''),                       q),
           similarity(COALESCE(b.tagline, ''),                            q),
           similarity(LEFT(COALESCE(b.instructor_bio, ''), 500),          q)
         ) AS similarity
    FROM base b
   WHERE (
            COALESCE(b.display_name, '')                       % q
         OR COALESCE(b.tagline, '')                            % q
         OR LEFT(COALESCE(b.instructor_bio, ''), 500)          % q
         )
   ORDER BY similarity DESC,
            b.id ASC
   OFFSET COALESCE(ofs, 0)
   LIMIT  LEAST(COALESCE(lim, 25), 100);
$fn$;


REVOKE EXECUTE ON FUNCTION public.fn_search_courses(text, int, int)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_search_instructors(text, int, int) FROM PUBLIC;

GRANT  EXECUTE ON FUNCTION public.fn_search_courses(text, int, int)     TO service_role, authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.fn_search_instructors(text, int, int) TO service_role, authenticated, anon;
