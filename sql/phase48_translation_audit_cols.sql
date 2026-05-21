-- Phase 48 — add audit columns to the 4 "generic-path" translation tables.
--
-- The shared AI translation worker (ai.controller.ts → generateAllTranslationsForEntity)
-- writes created_by / updated_by on every insert and update. The 9 material
-- translation tables (subject_translations, …, webinar_translations) all have
-- these columns, but these 4 did not, so AI translation (e.g. Hindi) failed with
-- "Could not find the 'created_by' column in the schema cache" — leaving FAQ,
-- Category and Policy translations un-generated.
--
-- Mirrors the material tables: nullable bigint, no FK (matches subject_translations).
-- Idempotent — safe to re-run.

ALTER TABLE public.faq_translations          ADD COLUMN IF NOT EXISTS created_by bigint, ADD COLUMN IF NOT EXISTS updated_by bigint;
ALTER TABLE public.faq_category_translations ADD COLUMN IF NOT EXISTS created_by bigint, ADD COLUMN IF NOT EXISTS updated_by bigint;
ALTER TABLE public.policy_translations        ADD COLUMN IF NOT EXISTS created_by bigint, ADD COLUMN IF NOT EXISTS updated_by bigint;
ALTER TABLE public.policy_type_translations   ADD COLUMN IF NOT EXISTS created_by bigint, ADD COLUMN IF NOT EXISTS updated_by bigint;
