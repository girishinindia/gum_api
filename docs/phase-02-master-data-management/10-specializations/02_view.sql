-- ============================================================
-- Views: specializations
-- ============================================================


CREATE OR REPLACE VIEW uv_specializations
WITH (security_invoker = true) AS
SELECT
    s.id                    AS specialization_id,
    s.name                  AS specialization_name,
    s.category              AS specialization_category,
    s.description           AS specialization_description,
    s.icon_url              AS specialization_icon_url,
    s.created_by            AS specialization_created_by,
    s.updated_by            AS specialization_updated_by,
    s.is_active             AS specialization_is_active,
    s.is_deleted            AS specialization_is_deleted,
    s.created_at            AS specialization_created_at,
    s.updated_at            AS specialization_updated_at,
    s.deleted_at            AS specialization_deleted_at
FROM specializations s;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All specializations via view
-- SELECT * FROM uv_specializations;

-- 2. Single specialization by ID
-- SELECT * FROM uv_specializations WHERE specialization_id = 1;

-- 3. Active specializations sorted by name
-- SELECT * FROM uv_specializations WHERE specialization_is_active = TRUE AND specialization_is_deleted = FALSE ORDER BY specialization_name;

-- 4. Filter by category (technology) via view
-- SELECT specialization_name, specialization_category FROM uv_specializations WHERE specialization_category = 'technology' AND specialization_is_deleted = FALSE;

-- 5. Search by name via view
-- SELECT specialization_name, specialization_category FROM uv_specializations WHERE specialization_name ILIKE '%python%';

-- 6. Specializations grouped by category
-- SELECT specialization_category, COUNT(*) AS cnt FROM uv_specializations WHERE specialization_is_deleted = FALSE GROUP BY specialization_category ORDER BY cnt DESC;

-- 7. Inactive specializations
-- SELECT specialization_name, specialization_is_active FROM uv_specializations WHERE specialization_is_active = FALSE;
