-- ============================================================
-- View: uv_social_medias
-- Purpose: All social media platforms with full metadata
-- ============================================================


CREATE OR REPLACE VIEW uv_social_medias
WITH (security_invoker = true) AS
SELECT
    sm.id                   AS social_media_id,
    sm.name                 AS social_media_name,
    sm.code                 AS social_media_code,
    sm.base_url             AS social_media_base_url,
    sm.icon_url             AS social_media_icon_url,
    sm.placeholder          AS social_media_placeholder,
    sm.platform_type        AS social_media_platform_type,
    sm.display_order        AS social_media_display_order,
    sm.created_by           AS social_media_created_by,
    sm.updated_by           AS social_media_updated_by,
    sm.is_active            AS social_media_is_active,
    sm.is_deleted           AS social_media_is_deleted,
    sm.created_at           AS social_media_created_at,
    sm.updated_at           AS social_media_updated_at,
    sm.deleted_at           AS social_media_deleted_at
FROM social_medias sm;
-- NOTE: intentionally no WHERE is_deleted = FALSE. The view exposes
-- soft-deleted rows so udf_get_social_medias(p_id := X) can still
-- find a row after it was soft-deleted. List queries default-exclude
-- deleted rows via udf_get_social_medias.p_filter_is_deleted
-- DEFAULT FALSE.




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All social medias via view
-- SELECT * FROM uv_social_medias;

-- 2. Single social media by ID
-- SELECT * FROM uv_social_medias WHERE social_media_id = 1;

-- 3. Active social medias sorted by display order
-- SELECT * FROM uv_social_medias WHERE social_media_is_active = TRUE ORDER BY social_media_display_order;

-- 4. Filter by platform type (social)
-- SELECT social_media_name, social_media_code, social_media_platform_type FROM uv_social_medias WHERE social_media_platform_type = 'social';

-- 5. Filter by platform type (professional)
-- SELECT social_media_name, social_media_code FROM uv_social_medias WHERE social_media_platform_type = 'professional';

-- 6. Search by name or code
-- SELECT social_media_name, social_media_code, social_media_base_url FROM uv_social_medias WHERE social_media_name ILIKE '%twitter%' OR social_media_code = 'twitter';

-- 7. All active platforms for UI dropdown
-- SELECT social_media_id, social_media_name, social_media_code FROM uv_social_medias WHERE social_media_is_active = TRUE ORDER BY social_media_display_order;

-- 8. Platforms with base URLs
-- SELECT social_media_name, social_media_code, social_media_base_url FROM uv_social_medias WHERE social_media_base_url IS NOT NULL;

-- 9. Platforms with placeholders
-- SELECT social_media_name, social_media_placeholder FROM uv_social_medias WHERE social_media_placeholder IS NOT NULL;

-- 10. Count platforms by type
-- SELECT social_media_platform_type, COUNT(*) AS cnt FROM uv_social_medias GROUP BY social_media_platform_type;

-- 11. Inactive social medias
-- SELECT social_media_name, social_media_is_active FROM uv_social_medias WHERE social_media_is_active = FALSE;

-- 12. All platform types available
-- SELECT DISTINCT social_media_platform_type FROM uv_social_medias;

-- 13. Code-based platforms
-- SELECT social_media_name, social_media_code FROM uv_social_medias WHERE social_media_platform_type = 'code';
