-- ══════════════════════════════════════════════════════════════════════════════
-- FILE: 02_view.sql
-- PURPOSE: Create views for sub_categories and sub_category_translations (UDF-ready)
-- CREATED: 2026-03-21 (updated for UDF conversion)
-- ══════════════════════════════════════════════════════════════════════════════

-- ══════ DROP EXISTING VIEWS ══════
DROP VIEW IF EXISTS uv_sub_category_translations CASCADE;
DROP VIEW IF EXISTS uv_sub_categories CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW 1: uv_sub_categories
-- PURPOSE: Provide a standardized view of the sub_categories table with prefixed columns
-- SECURITY: security_invoker
-- ══════════════════════════════════════════════════════════════════════════════
CREATE VIEW uv_sub_categories
WITH (security_invoker = true) AS
SELECT
    sc.id                        AS sub_category_id,
    sc.category_id               AS sub_category_category_id,
    sc.code                      AS sub_category_code,
    sc.slug                      AS sub_category_slug,
    sc.display_order             AS sub_category_display_order,
    sc.icon_url                  AS sub_category_icon_url,
    sc.image_url                 AS sub_category_image_url,
    sc.is_new                    AS sub_category_is_new,
    sc.new_until                 AS sub_category_new_until,
    sc.created_by                AS sub_category_created_by,
    sc.updated_by                AS sub_category_updated_by,
    sc.is_active                 AS sub_category_is_active,
    sc.is_deleted                AS sub_category_is_deleted,
    sc.created_at                AS sub_category_created_at,
    sc.updated_at                AS sub_category_updated_at,
    sc.deleted_at                AS sub_category_deleted_at
FROM sub_categories sc;
-- NOTE: intentionally no WHERE is_deleted = FALSE. The view exposes
-- soft-deleted rows so udf_get_sub_categories(p_id := X) can still
-- find a row after it was soft-deleted. List queries default-exclude
-- deleted rows via udf_get_sub_categories.p_filter_is_deleted
-- DEFAULT FALSE.


-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW 2: uv_sub_category_translations
-- PURPOSE: JOIN sub_category_translations with parent sub_category data
--          Filters out orphaned translations (parent soft-deleted)
-- SECURITY: security_invoker
-- ══════════════════════════════════════════════════════════════════════════════
CREATE VIEW uv_sub_category_translations
WITH (security_invoker = true) AS
SELECT
    -- Translation columns with sub_cat_trans_ prefix
    sct.id                    AS sub_cat_trans_id,
    sct.sub_category_id       AS sub_cat_trans_sub_category_id,
    sct.language_id           AS sub_cat_trans_language_id,
    sct.name::TEXT            AS sub_cat_trans_name,
    sct.description           AS sub_cat_trans_description,
    sct.is_new_title          AS sub_cat_trans_is_new_title,
    sct.icon                  AS sub_cat_trans_icon,
    sct.image                 AS sub_cat_trans_image,
    sct.tags                  AS sub_cat_trans_tags,
    sct.meta_title            AS sub_cat_trans_meta_title,
    sct.meta_description      AS sub_cat_trans_meta_description,
    sct.meta_keywords         AS sub_cat_trans_meta_keywords,
    sct.canonical_url         AS sub_cat_trans_canonical_url,
    sct.og_site_name          AS sub_cat_trans_og_site_name,
    sct.og_title              AS sub_cat_trans_og_title,
    sct.og_description        AS sub_cat_trans_og_description,
    sct.og_type               AS sub_cat_trans_og_type,
    sct.og_image              AS sub_cat_trans_og_image,
    sct.og_url                AS sub_cat_trans_og_url,
    sct.twitter_site          AS sub_cat_trans_twitter_site,
    sct.twitter_title         AS sub_cat_trans_twitter_title,
    sct.twitter_description   AS sub_cat_trans_twitter_description,
    sct.twitter_image         AS sub_cat_trans_twitter_image,
    sct.twitter_card          AS sub_cat_trans_twitter_card,
    sct.robots_directive      AS sub_cat_trans_robots_directive,
    sct.focus_keyword         AS sub_cat_trans_focus_keyword,
    sct.structured_data       AS sub_cat_trans_structured_data,
    sct.created_by            AS sub_cat_trans_created_by,
    sct.updated_by            AS sub_cat_trans_updated_by,
    sct.is_active             AS sub_cat_trans_is_active,
    sct.is_deleted            AS sub_cat_trans_is_deleted,
    sct.created_at            AS sub_cat_trans_created_at,
    sct.updated_at            AS sub_cat_trans_updated_at,
    sct.deleted_at            AS sub_cat_trans_deleted_at,

    -- Parent sub_category columns
    usc.sub_category_id,
    usc.sub_category_category_id,
    usc.sub_category_code::TEXT AS sub_category_code,
    usc.sub_category_slug::TEXT AS sub_category_slug,
    usc.sub_category_display_order,
    usc.sub_category_icon_url,
    usc.sub_category_image_url,
    usc.sub_category_is_new,
    usc.sub_category_new_until,
    usc.sub_category_created_by,
    usc.sub_category_updated_by,
    usc.sub_category_is_active,
    usc.sub_category_created_at,
    usc.sub_category_updated_at
FROM sub_category_translations sct
INNER JOIN uv_sub_categories usc ON sct.sub_category_id = usc.sub_category_id
-- Filter here (not in uv_sub_categories) so this view keeps its prior
-- "no orphaned or deleted translations" semantics now that
-- uv_sub_categories no longer filters deleted rows.
WHERE sct.is_deleted = FALSE
  AND usc.sub_category_is_deleted = FALSE;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test uv_sub_categories view structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'uv_sub_categories' ORDER BY ordinal_position;

-- Test uv_sub_category_translations view structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'uv_sub_category_translations' ORDER BY ordinal_position;

-- Test basic query from uv_sub_categories
-- SELECT * FROM uv_sub_categories LIMIT 5;

-- Test basic query from uv_sub_category_translations
-- SELECT * FROM uv_sub_category_translations LIMIT 5;
