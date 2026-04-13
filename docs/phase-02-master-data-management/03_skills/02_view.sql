-- ============================================================
-- Views: skills
-- ============================================================


CREATE OR REPLACE VIEW uv_skills
WITH (security_invoker = true) AS
SELECT
    s.id                    AS skill_id,
    s.name                  AS skill_name,
    s.category              AS skill_category,
    s.description           AS skill_description,
    s.icon_url              AS skill_icon_url,
    s.created_by            AS skill_created_by,
    s.updated_by            AS skill_updated_by,
    s.is_active             AS skill_is_active,
    s.is_deleted            AS skill_is_deleted,
    s.created_at            AS skill_created_at,
    s.updated_at            AS skill_updated_at,
    s.deleted_at            AS skill_deleted_at
FROM skills s;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All skills via view
-- SELECT * FROM uv_skills;

-- 2. Single skill by ID
-- SELECT * FROM uv_skills WHERE skill_id = 1;

-- 3. Active skills sorted by name
-- SELECT * FROM uv_skills WHERE skill_is_active = TRUE AND skill_is_deleted = FALSE ORDER BY skill_name;

-- 4. Filter by category via view
-- SELECT skill_name, skill_category FROM uv_skills WHERE skill_category = 'technical' AND skill_is_deleted = FALSE;

-- 5. Search by name via view
-- SELECT skill_name, skill_category FROM uv_skills WHERE skill_name ILIKE '%python%';

-- 6. Skills grouped by category
-- SELECT skill_category, COUNT(*) AS cnt FROM uv_skills WHERE skill_is_deleted = FALSE GROUP BY skill_category ORDER BY cnt DESC;

-- 7. Inactive skills
-- SELECT skill_name, skill_is_active FROM uv_skills WHERE skill_is_active = FALSE;
