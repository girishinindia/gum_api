-- ============================================================
-- Views: education_levels
-- ============================================================


CREATE OR REPLACE VIEW uv_education_levels
WITH (security_invoker = true) AS
SELECT
    el.id                   AS education_level_id,
    el.name                 AS education_level_name,
    el.abbreviation         AS education_level_abbreviation,
    el.level_order          AS education_level_order,
    el.level_category       AS education_level_category,
    el.description          AS education_level_description,
    el.typical_duration     AS education_level_typical_duration,
    el.typical_age_range    AS education_level_typical_age_range,
    el.created_by           AS education_level_created_by,
    el.updated_by           AS education_level_updated_by,
    el.is_active            AS education_level_is_active,
    el.is_deleted           AS education_level_is_deleted,
    el.created_at           AS education_level_created_at,
    el.updated_at           AS education_level_updated_at,
    el.deleted_at           AS education_level_deleted_at
FROM education_levels el;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All education levels via view
-- SELECT * FROM uv_education_levels;

-- 2. Single education level by ID
-- SELECT * FROM uv_education_levels WHERE education_level_id = 19;

-- 3. Active education levels sorted by order (for dropdowns)
-- SELECT * FROM uv_education_levels WHERE education_level_is_active = TRUE AND education_level_is_deleted = FALSE ORDER BY education_level_order;

-- 4. Filter by category via view
-- SELECT education_level_name, education_level_abbreviation, education_level_category FROM uv_education_levels WHERE education_level_category = 'undergraduate' AND education_level_is_deleted = FALSE ORDER BY education_level_order;

-- 5. Search by name via view
-- SELECT education_level_name, education_level_abbreviation FROM uv_education_levels WHERE education_level_name ILIKE '%bachelor%';

-- 6. Education levels grouped by category
-- SELECT education_level_category, COUNT(*) AS cnt FROM uv_education_levels WHERE education_level_is_deleted = FALSE GROUP BY education_level_category ORDER BY MIN(education_level_order);

-- 7. Postgraduate levels only
-- SELECT education_level_name, education_level_abbreviation, education_level_typical_duration FROM uv_education_levels WHERE education_level_category = 'postgraduate' AND education_level_is_deleted = FALSE ORDER BY education_level_order;

-- 8. Professional qualifications (CA, CS, CMA, CFA, etc.)
-- SELECT education_level_name, education_level_abbreviation, education_level_description FROM uv_education_levels WHERE education_level_category = 'professional' AND education_level_is_deleted = FALSE ORDER BY education_level_order;

-- 9. School levels sorted by order
-- SELECT education_level_name, education_level_order, education_level_typical_age_range FROM uv_education_levels WHERE education_level_category = 'school' AND education_level_is_deleted = FALSE ORDER BY education_level_order;

-- 10. Inactive education levels
-- SELECT education_level_name, education_level_is_active FROM uv_education_levels WHERE education_level_is_active = FALSE;
