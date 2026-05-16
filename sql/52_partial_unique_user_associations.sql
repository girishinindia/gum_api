-- ============================================================
-- 52_partial_unique_user_associations.sql
-- Bug 4 — "already added" error after delete + re-add.
--
-- The three user-association tables (user_languages, user_skills,
-- user_social_medias) all soft-delete via `deleted_at`. But the
-- uniqueness constraints created in 19_user_profile_modules.sql
-- (uq_user_language, uq_user_skill, uq_user_social_media) are plain
-- UNIQUE — they don't have a partial predicate. So a soft-deleted row
-- still occupies the (user_id, X_id) slot, and re-INSERTing the same
-- pair hits a 23505 → "already added".
--
-- This migration:
--   1. Drops the three plain UNIQUE constraints.
--   2. Recreates them as PARTIAL UNIQUE INDEXES that only enforce
--      uniqueness for live rows (WHERE deleted_at IS NULL).
--
-- After this migration:
--   • A user can re-add a previously-soft-deleted language/skill/social
--   • Two live rows for the same pair are still impossible
--   • Multiple soft-deleted rows for the same pair are allowed (which is
--     fine — they're history)
--
-- The controller-level defence (UPDATE deleted_at=NULL on conflict, see
-- the matching changes in *.controller.ts) layers on top of this so that
-- callers get an "undelete" rather than an insert-of-a-duplicate.
--
-- Idempotent: uses IF EXISTS / IF NOT EXISTS so safe to re-run.
-- ============================================================

-- ── user_languages ──────────────────────────────────────────
ALTER TABLE public.user_languages
    DROP CONSTRAINT IF EXISTS uq_user_language;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_language_live
    ON public.user_languages (user_id, language_id)
    WHERE deleted_at IS NULL;

-- ── user_skills ─────────────────────────────────────────────
ALTER TABLE public.user_skills
    DROP CONSTRAINT IF EXISTS uq_user_skill;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_skill_live
    ON public.user_skills (user_id, skill_id)
    WHERE deleted_at IS NULL;

-- ── user_social_medias ─────────────────────────────────────
ALTER TABLE public.user_social_medias
    DROP CONSTRAINT IF EXISTS uq_user_social_media;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_social_media_live
    ON public.user_social_medias (user_id, social_media_id)
    WHERE deleted_at IS NULL;
