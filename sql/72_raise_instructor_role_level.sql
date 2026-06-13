-- 72_raise_instructor_role_level.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-40/51: a super admin assigned the Instructor role to a student, but the
-- web profile still showed "Student".
--
-- Root cause: the `instructor` role shared level 20 with `student`, and the web
-- derives the displayed role label + instructor profile sections from
-- max_role_level (Instructor requires level >= 60). So an instructor at level 20
-- always rendered as "Student".
--
-- Decision (June 2026): raise the instructor role to the instructor/faculty tier
-- (level 60). The API does not use level-based `requireRole` guards (access is
-- permission-based via role_permissions), so this only affects the displayed role
-- and max_role_level — no new API access is granted. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.roles SET level = 60 WHERE name = 'instructor' AND level <> 60;
