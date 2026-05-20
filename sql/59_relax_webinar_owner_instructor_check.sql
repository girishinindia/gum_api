-- Phase 45.2 — Owner ↔ Instructor relationship across bundles / webinars / batches
-- ---------------------------------------------------------------------------
-- Context
--   The "Instructor ID" on bundles, webinars and course_batches becomes an
--   owner-aware user picker:
--     • owner = instructor      → instructor_id is REQUIRED and must reference
--                                  a user with users.type = 'instructor'
--     • owner = gum_admin/system → instructor_id is OPTIONAL but, when set,
--                                  must reference a user holding the
--                                  super_admin role (user_roles.role_id = 1)
--
-- Enforcement strategy (deliberate)
--   The *type / role* matching is enforced at the API layer
--   (validateOwnerInstructor) rather than a DB trigger. Reason: ~25 legacy
--   rows already point owner='instructor' at employees/students, and a blanket
--   row-level trigger would reject ANY future UPDATE to those rows (even an
--   unrelated title/price edit), which is too disruptive. The API validates
--   only when owner / instructor_id actually change, with friendly messages,
--   and the portal's owner-aware dropdown prevents bad picks up front.
--
-- This migration only RELAXES the one DB constraint that would otherwise block
-- the new model: webinars currently force `system → instructor_id IS NULL`,
-- which prevents attributing a system/admin-owned webinar to a specific super
-- admin. We replace it with a softer rule that only keeps the half we still
-- want: an instructor-owned webinar must name an instructor.
-- ---------------------------------------------------------------------------

BEGIN;

-- Drop the rigid pairing check (system → NULL, instructor → NOT NULL).
ALTER TABLE public.webinars DROP CONSTRAINT IF EXISTS chk_webinars_owner_fk;

-- Keep only the structural guarantee that an instructor-owned webinar has an
-- instructor. System/admin-owned webinars may now optionally carry a
-- super-admin id (validated in the API), or stay NULL.
ALTER TABLE public.webinars
  ADD CONSTRAINT chk_webinars_owner_fk
  CHECK (webinar_owner <> 'instructor' OR instructor_id IS NOT NULL);

COMMIT;
