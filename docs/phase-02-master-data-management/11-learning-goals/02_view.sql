-- ============================================================
-- View: uv_learning_goals
-- Purpose: All learning goals with full metadata
-- ============================================================


CREATE OR REPLACE VIEW uv_learning_goals
WITH (security_invoker = true) AS
SELECT
    lg.id                   AS learning_goal_id,
    lg.name                 AS learning_goal_name,
    lg.description          AS learning_goal_description,
    lg.icon_url             AS learning_goal_icon_url,
    lg.display_order        AS learning_goal_display_order,
    lg.created_by           AS learning_goal_created_by,
    lg.updated_by           AS learning_goal_updated_by,
    lg.is_active            AS learning_goal_is_active,
    lg.is_deleted           AS learning_goal_is_deleted,
    lg.created_at           AS learning_goal_created_at,
    lg.updated_at           AS learning_goal_updated_at,
    lg.deleted_at           AS learning_goal_deleted_at
FROM learning_goals lg;
-- NOTE: intentionally no WHERE is_deleted = FALSE. The view exposes
-- soft-deleted rows so udf_get_learning_goals(p_id := X) can still
-- find a row after it was soft-deleted. List queries default-exclude
-- deleted rows via udf_get_learning_goals.p_filter_is_deleted
-- DEFAULT FALSE.




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All learning goals via view
-- SELECT * FROM uv_learning_goals;

-- 2. Single learning goal by ID
-- SELECT * FROM uv_learning_goals WHERE learning_goal_id = 1;

-- 3. Active learning goals sorted by display order
-- SELECT * FROM uv_learning_goals WHERE learning_goal_is_active = TRUE ORDER BY learning_goal_display_order;

-- 4. Filter by active status
-- SELECT learning_goal_name, learning_goal_display_order FROM uv_learning_goals WHERE learning_goal_is_active = TRUE;

-- 5. Search by name via view
-- SELECT learning_goal_name, learning_goal_description FROM uv_learning_goals WHERE learning_goal_name ILIKE '%skill%';

-- 6. Learning goals with descriptions
-- SELECT learning_goal_name, learning_goal_description FROM uv_learning_goals WHERE learning_goal_description IS NOT NULL;

-- 7. Display order for UI dropdown
-- SELECT learning_goal_id, learning_goal_name, learning_goal_display_order FROM uv_learning_goals WHERE learning_goal_is_active = TRUE ORDER BY learning_goal_display_order ASC;

-- 8. Inactive learning goals
-- SELECT learning_goal_name, learning_goal_is_active FROM uv_learning_goals WHERE learning_goal_is_active = FALSE;

-- 9. Recently updated learning goals
-- SELECT learning_goal_name, learning_goal_updated_at FROM uv_learning_goals ORDER BY learning_goal_updated_at DESC LIMIT 5;

-- 10. Learning goals with icons
-- SELECT learning_goal_name, learning_goal_icon_url FROM uv_learning_goals WHERE learning_goal_icon_url IS NOT NULL;
