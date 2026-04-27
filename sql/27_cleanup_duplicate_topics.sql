-- ============================================================================
-- SQL Script: Clean up duplicate topics created by repeated CDN imports
-- ============================================================================
-- Root cause: generateUniqueSlug() checked slug uniqueness globally across
-- the entire topics table instead of scoping to the same chapter_id.
-- This caused topics with slugs like "data-types-2", "data-types-3" to be
-- created under the same chapter when re-importing.
--
-- This script:
-- 1. Identifies duplicate topics (slugs matching base-slug-N pattern)
-- 2. Moves any unique sub-topics from duplicates to the original topic
-- 3. Deletes duplicate sub-topic translations
-- 4. Deletes duplicate sub-topics that already exist in the original
-- 5. Deletes duplicate topic translations
-- 6. Deletes the duplicate topics themselves
--
-- RUN STEP 1 FIRST (dry-run) to review what will be affected.
-- Then run steps 2-6 in a transaction.
-- ============================================================================

-- ============================================================================
-- STEP 1: DRY RUN - Review duplicate topics (SELECT only, safe to run)
-- ============================================================================

-- Find all topics whose slug matches a "base-slug-N" pattern
-- and where the original "base-slug" topic exists in the same chapter
WITH duplicate_candidates AS (
  SELECT
    t.id AS dup_id,
    t.slug AS dup_slug,
    t.chapter_id,
    t.name AS dup_name,
    regexp_replace(t.slug, '-(\d+)$', '') AS base_slug,
    substring(t.slug from '-(\d+)$')::int AS suffix_num
  FROM topics t
  WHERE t.deleted_at IS NULL
    AND t.slug ~ '-\d+$'
),
originals AS (
  SELECT
    dc.dup_id,
    dc.dup_slug,
    dc.dup_name,
    dc.chapter_id,
    dc.base_slug,
    dc.suffix_num,
    orig.id AS original_id,
    orig.slug AS original_slug,
    orig.name AS original_name
  FROM duplicate_candidates dc
  JOIN topics orig
    ON orig.chapter_id = dc.chapter_id
    AND orig.slug = dc.base_slug
    AND orig.deleted_at IS NULL
    AND orig.id != dc.dup_id
)
SELECT
  o.chapter_id,
  o.original_id,
  o.original_slug,
  o.original_name,
  o.dup_id,
  o.dup_slug,
  o.dup_name,
  o.suffix_num,
  (SELECT count(*) FROM sub_topics st WHERE st.topic_id = o.dup_id AND st.deleted_at IS NULL) AS dup_sub_topics,
  (SELECT count(*) FROM topic_translations tt WHERE tt.topic_id = o.dup_id) AS dup_translations,
  (SELECT count(*) FROM sub_topics st WHERE st.topic_id = o.original_id AND st.deleted_at IS NULL) AS orig_sub_topics
FROM originals o
ORDER BY o.chapter_id, o.base_slug, o.suffix_num;


-- ============================================================================
-- STEP 2-6: CLEANUP (run inside a transaction)
-- ============================================================================
-- Uncomment and run the following after reviewing Step 1 results.
-- ============================================================================

-- BEGIN;

-- -- Step 2: For each duplicate topic, move its sub-topics to the original topic
-- -- (only if the sub-topic slug doesn't already exist under the original)
-- WITH duplicate_pairs AS (
--   SELECT
--     t.id AS dup_id,
--     regexp_replace(t.slug, '-(\d+)$', '') AS base_slug,
--     t.chapter_id
--   FROM topics t
--   WHERE t.deleted_at IS NULL
--     AND t.slug ~ '-\d+$'
-- ),
-- originals AS (
--   SELECT dp.dup_id, orig.id AS original_id
--   FROM duplicate_pairs dp
--   JOIN topics orig
--     ON orig.chapter_id = dp.chapter_id
--     AND orig.slug = dp.base_slug
--     AND orig.deleted_at IS NULL
-- ),
-- sub_topics_to_move AS (
--   SELECT st.id AS st_id, o.original_id
--   FROM originals o
--   JOIN sub_topics st ON st.topic_id = o.dup_id AND st.deleted_at IS NULL
--   WHERE NOT EXISTS (
--     SELECT 1 FROM sub_topics existing
--     WHERE existing.topic_id = o.original_id
--       AND existing.slug = regexp_replace(st.slug, '-(\d+)$', '')
--       AND existing.deleted_at IS NULL
--   )
--   AND NOT EXISTS (
--     SELECT 1 FROM sub_topics existing
--     WHERE existing.topic_id = o.original_id
--       AND existing.slug = st.slug
--       AND existing.deleted_at IS NULL
--   )
-- )
-- UPDATE sub_topics SET topic_id = stm.original_id
-- FROM sub_topics_to_move stm
-- WHERE sub_topics.id = stm.st_id;

-- -- Step 3: Delete sub-topic translations for remaining duplicate sub-topics
-- WITH duplicate_pairs AS (
--   SELECT
--     t.id AS dup_id,
--     regexp_replace(t.slug, '-(\d+)$', '') AS base_slug,
--     t.chapter_id
--   FROM topics t
--   WHERE t.deleted_at IS NULL
--     AND t.slug ~ '-\d+$'
-- ),
-- originals AS (
--   SELECT dp.dup_id
--   FROM duplicate_pairs dp
--   JOIN topics orig
--     ON orig.chapter_id = dp.chapter_id
--     AND orig.slug = dp.base_slug
--     AND orig.deleted_at IS NULL
-- )
-- DELETE FROM sub_topic_translations
-- WHERE sub_topic_id IN (
--   SELECT st.id FROM sub_topics st
--   JOIN originals o ON st.topic_id = o.dup_id
-- );

-- -- Step 4: Delete remaining sub-topics under duplicate topics
-- WITH duplicate_pairs AS (
--   SELECT
--     t.id AS dup_id,
--     regexp_replace(t.slug, '-(\d+)$', '') AS base_slug,
--     t.chapter_id
--   FROM topics t
--   WHERE t.deleted_at IS NULL
--     AND t.slug ~ '-\d+$'
-- ),
-- originals AS (
--   SELECT dp.dup_id
--   FROM duplicate_pairs dp
--   JOIN topics orig
--     ON orig.chapter_id = dp.chapter_id
--     AND orig.slug = dp.base_slug
--     AND orig.deleted_at IS NULL
-- )
-- DELETE FROM sub_topics
-- WHERE topic_id IN (SELECT dup_id FROM originals);

-- -- Step 5: Delete topic translations for duplicate topics
-- WITH duplicate_pairs AS (
--   SELECT
--     t.id AS dup_id,
--     regexp_replace(t.slug, '-(\d+)$', '') AS base_slug,
--     t.chapter_id
--   FROM topics t
--   WHERE t.deleted_at IS NULL
--     AND t.slug ~ '-\d+$'
-- ),
-- originals AS (
--   SELECT dp.dup_id
--   FROM duplicate_pairs dp
--   JOIN topics orig
--     ON orig.chapter_id = dp.chapter_id
--     AND orig.slug = dp.base_slug
--     AND orig.deleted_at IS NULL
-- )
-- DELETE FROM topic_translations
-- WHERE topic_id IN (SELECT dup_id FROM originals);

-- -- Step 6: Delete the duplicate topics themselves
-- WITH duplicate_pairs AS (
--   SELECT
--     t.id AS dup_id,
--     regexp_replace(t.slug, '-(\d+)$', '') AS base_slug,
--     t.chapter_id
--   FROM topics t
--   WHERE t.deleted_at IS NULL
--     AND t.slug ~ '-\d+$'
-- ),
-- originals AS (
--   SELECT dp.dup_id
--   FROM duplicate_pairs dp
--   JOIN topics orig
--     ON orig.chapter_id = dp.chapter_id
--     AND orig.slug = dp.base_slug
--     AND orig.deleted_at IS NULL
-- )
-- DELETE FROM topics
-- WHERE id IN (SELECT dup_id FROM originals);

-- COMMIT;
