-- ============================================================
-- Views: designations
-- ============================================================


CREATE OR REPLACE VIEW uv_designations
WITH (security_invoker = true) AS
SELECT
    d.id                    AS designation_id,
    d.name                  AS designation_name,
    d.code                  AS designation_code,
    d.level                 AS designation_level,
    d.level_band            AS designation_level_band,
    d.description           AS designation_description,
    d.created_by            AS designation_created_by,
    d.updated_by            AS designation_updated_by,
    d.is_active             AS designation_is_active,
    d.is_deleted            AS designation_is_deleted,
    d.created_at            AS designation_created_at,
    d.updated_at            AS designation_updated_at,
    d.deleted_at            AS designation_deleted_at
FROM designations d;




-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All designations via view
-- SELECT * FROM uv_designations;

-- 2. Single designation by ID
-- SELECT * FROM uv_designations WHERE designation_id = 1;

-- 3. Active designations sorted by level
-- SELECT * FROM uv_designations WHERE designation_is_active = TRUE AND designation_is_deleted = FALSE ORDER BY designation_level;

-- 4. Search by name via view
-- SELECT designation_name, designation_code, designation_level_band FROM uv_designations WHERE designation_name ILIKE '%developer%';

-- 5. Filter by level_band (senior)
-- SELECT designation_name, designation_code, designation_level FROM uv_designations WHERE designation_level_band = 'senior' AND designation_is_deleted = FALSE;

-- 6. Inactive designations
-- SELECT designation_name, designation_is_active FROM uv_designations WHERE designation_is_active = FALSE;
