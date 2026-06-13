-- 71_relax_authoring_units_topic_type_chk.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-16: Adding a Topic unit in the course builder failed with HTTP 500 +
--   new row for relation "authoring_units" violates check constraint
--   "authoring_units_topic_type_chk"
--
-- Root cause: the course builder no longer sends a `topic_type` when creating a
-- Topic unit, so topics arrive with topic_type = NULL. The original constraint
-- (see PROPOSED_instructor_authoring_schema.sql) required a topic to HAVE a
-- non-null topic_type:
--     CHECK ((unit_type='topic' AND topic_type IS NOT NULL)
--         OR (unit_type<>'topic' AND topic_type IS NULL))
--
-- This was already relaxed directly on the production database but was NEVER
-- committed as a migration, so a fresh DB rebuild would re-introduce the 500.
-- This migration makes the schema-of-record match production. Idempotent.
--
-- Note: the column-level `authoring_units_topic_type_check`
--   CHECK (topic_type = ANY (ARRAY['video','article','quiz','exercise','project']))
-- is intentionally left untouched (it already permits NULL).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.authoring_units
  DROP CONSTRAINT IF EXISTS authoring_units_topic_type_chk;

ALTER TABLE public.authoring_units
  ADD CONSTRAINT authoring_units_topic_type_chk
  CHECK ( (unit_type = 'topic') OR (topic_type IS NULL) );
