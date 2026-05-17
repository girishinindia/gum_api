-- Phase 44.2 — extend course_status to include `coming_soon`.
--
-- Why:
--   The admin portal's Course Status dropdown (gum_admin_portal/app/(admin)/
--   courses/page.tsx) offered "Coming Soon" → value 'coming_soon', but the
--   live DB CHECK constraint `chk_courses_status` only allowed
--   {draft, under_review, published, archived, suspended}. Picking
--   "Coming Soon" on the form triggered a constraint-violation 500 on
--   save (UI exposed it after Phase 44 made the api.ts wrapper throw
--   on failures).
--
-- Fix:
--   Drop the existing CHECK and recreate with `coming_soon` added. This
--   aligns DB / admin dropdown / API on one canonical set of 6 values:
--     draft · under_review · published · archived · suspended · coming_soon
--
-- Safety:
--   Live data uses only {draft, published, archived} at the time of this
--   migration. All existing rows remain valid under the new constraint
--   (it's a STRICT SUPERSET of the old one). No backfill needed.
--
-- Applied live via Supabase MCP `apply_migration` on Phase 44.2 day.

ALTER TABLE courses DROP CONSTRAINT IF EXISTS chk_courses_status;
ALTER TABLE courses ADD CONSTRAINT chk_courses_status
  CHECK (course_status = ANY (ARRAY[
    'draft', 'under_review', 'published',
    'archived', 'suspended', 'coming_soon'
  ]::text[]));
