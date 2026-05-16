-- ============================================================
-- 51_seed_instructor_role.sql
-- Phase 22 — Self-service role assignment at signup.
--
-- Adds the 'instructor' role (level 20, same tier as student) to the
-- roles table so the new POST /users/me/roles endpoint can resolve it.
-- Both student and instructor are level-20 (non-privileged) roles —
-- self-assignment between them is safe.
--
-- Idempotent: safe to re-run. Uses INSERT … WHERE NOT EXISTS so it
-- doesn't fight the `roles_name_key` UNIQUE on `name`. The live DB
-- already has this row (id 15); this seed is for fresh installs.
--
-- Pairs with:
--   src/modules/users/user.controller.ts  → assignMyRole()
--   src/modules/users/user.schema.ts      → SELF_ASSIGNABLE_ROLES
--   src/modules/users/user.routes.ts      → r.post('/me/roles', ...)
--   sql/02_auth_countries_logs.sql        → create_verified_user no
--                                            longer auto-assigns student
-- ============================================================

INSERT INTO roles (name, display_name, description, level, is_system)
SELECT 'instructor', 'Instructor', 'Teach and manage own courses', 20, TRUE
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'instructor');

-- Sanity check — both self-assignable roles must exist or signup will 404
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'student' AND is_active = TRUE) THEN
        RAISE EXCEPTION 'Seed integrity: student role missing or inactive';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'instructor' AND is_active = TRUE) THEN
        RAISE EXCEPTION 'Seed integrity: instructor role missing or inactive';
    END IF;
END $$;
