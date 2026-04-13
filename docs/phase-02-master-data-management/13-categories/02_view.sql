-- ══════════════════════════════════════════════════════════════════════════════
-- FILE: 02_view.sql
-- PURPOSE: Create views for categories and category_translations (UDF-ready)
-- CREATED: 2026-03-21 (updated for UDF conversion)
-- ══════════════════════════════════════════════════════════════════════════════

-- ══════ DROP EXISTING VIEWS ══════
DROP VIEW IF EXISTS uv_category_translations CASCADE;
DROP VIEW IF EXISTS uv_categories CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW 1: uv_categories
-- PURPOSE: Provide a standardized view of the categories table with prefixed columns
-- SECURITY: security_invoker
-- ══════════════════════════════════════════════════════════════════════════════
CREATE VIEW uv_categories
WITH (security_invoker = true) AS
SELECT
    c.id                      AS category_id,
    c.code                    AS category_code,
    c.slug                    AS category_slug,
    c.display_order           AS category_display_order,
    c.icon_url                AS category_icon_url,
    c.image_url               AS category_image_url,
    c.is_new                  AS category_is_new,
    c.new_until               AS category_new_until,
    c.created_by              AS category_created_by,
    c.updated_by              AS category_updated_by,
    c.is_active               AS category_is_active,
    c.is_deleted              AS category_is_deleted,
    c.created_at              AS category_created_at,
    c.updated_at              AS category_updated_at,
    c.deleted_at              AS category_deleted_at
FROM categories c;
-- NOTE: intentionally no WHERE is_deleted = FALSE. The view exposes
-- soft-deleted rows so udf_get_categories(p_id := X) can still find
-- a row after it was soft-deleted (single-record lookup should not
-- be silently filtered). List queries default-exclude deleted rows
-- via udf_get_categories.p_filter_is_deleted DEFAULT FALSE.


-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW 2: uv_category_translations
-- PURPOSE: JOIN category_translations with parent category data from uv_categories
--          Filters out orphaned translations (parent soft-deleted)
-- SECURITY: security_invoker
-- ══════════════════════════════════════════════════════════════════════════════
CREATE VIEW uv_category_translations
WITH (security_invoker = true) AS
SELECT
    -- Translation columns with cat_trans_ prefix
    ct.id                     AS cat_trans_id,
    ct.category_id            AS cat_trans_category_id,
    ct.language_id            AS cat_trans_language_id,
    ct.name::TEXT             AS cat_trans_name,
    ct.description            AS cat_trans_description,
    ct.is_new_title           AS cat_trans_is_new_title,
    ct.icon                   AS cat_trans_icon,
    ct.image                  AS cat_trans_image,
    ct.tags                   AS cat_trans_tags,
    ct.meta_title             AS cat_trans_meta_title,
    ct.meta_description       AS cat_trans_meta_description,
    ct.meta_keywords          AS cat_trans_meta_keywords,
    ct.canonical_url          AS cat_trans_canonical_url,
    ct.og_site_name           AS cat_trans_og_site_name,
    ct.og_title               AS cat_trans_og_title,
    ct.og_description         AS cat_trans_og_description,
    ct.og_type                AS cat_trans_og_type,
    ct.og_image               AS cat_trans_og_image,
    ct.og_url                 AS cat_trans_og_url,
    ct.twitter_site           AS cat_trans_twitter_site,
    ct.twitter_title          AS cat_trans_twitter_title,
    ct.twitter_description    AS cat_trans_twitter_description,
    ct.twitter_image          AS cat_trans_twitter_image,
    ct.twitter_card           AS cat_trans_twitter_card,
    ct.robots_directive       AS cat_trans_robots_directive,
    ct.focus_keyword          AS cat_trans_focus_keyword,
    ct.structured_data        AS cat_trans_structured_data,
    ct.created_by             AS cat_trans_created_by,
    ct.updated_by             AS cat_trans_updated_by,
    ct.is_active              AS cat_trans_is_active,
    ct.is_deleted             AS cat_trans_is_deleted,
    ct.created_at             AS cat_trans_created_at,
    ct.updated_at             AS cat_trans_updated_at,
    ct.deleted_at             AS cat_trans_deleted_at,

    -- Parent category columns
    uc.category_id,
    uc.category_code::TEXT    AS category_code,
    uc.category_slug::TEXT    AS category_slug,
    uc.category_display_order,
    uc.category_icon_url,
    uc.category_image_url,
    uc.category_is_new,
    uc.category_new_until,
    uc.category_created_by,
    uc.category_updated_by,
    uc.category_is_active,
    uc.category_created_at,
    uc.category_updated_at
FROM category_translations ct
INNER JOIN uv_categories uc ON ct.category_id = uc.category_id
-- Filter here (not in uv_categories) so this view keeps its prior
-- "no orphaned or deleted translations" semantics now that
-- uv_categories no longer filters deleted rows.
WHERE ct.is_deleted = FALSE
  AND uc.category_is_deleted = FALSE;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test uv_categories view structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'uv_categories' ORDER BY ordinal_position;

-- Test uv_category_translations view structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'uv_category_translations' ORDER BY ordinal_position;

-- Test basic query from uv_categories
-- SELECT * FROM uv_categories LIMIT 5;

-- Test basic query from uv_category_translations
-- SELECT * FROM uv_category_translations LIMIT 5;
