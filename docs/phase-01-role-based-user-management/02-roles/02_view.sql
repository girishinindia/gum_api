-- ══════════════════════════════════════════════════════════════════════════════
-- FILE: 02_view.sql
-- PURPOSE: Create views for roles
-- CREATED: 2026-03-23
-- ══════════════════════════════════════════════════════════════════════════════

-- ══════ DROP EXISTING VIEWS ══════
DROP VIEW IF EXISTS uv_roles CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW: uv_roles
-- PURPOSE: Roles with parent role info and permission counts
-- ══════════════════════════════════════════════════════════════════════════════
CREATE VIEW uv_roles
WITH (security_invoker = true) AS
SELECT
    r.id                        AS role_id,
    r.name                      AS role_name,
    r.code                      AS role_code,
    r.slug                      AS role_slug,
    r.description               AS role_description,
    r.parent_role_id            AS role_parent_role_id,
    pr.name                     AS role_parent_name,
    pr.code                     AS role_parent_code,
    r.level                     AS role_level,
    r.is_system_role            AS role_is_system_role,
    r.display_order             AS role_display_order,
    r.icon                      AS role_icon,
    r.color                     AS role_color,
    r.created_by                AS role_created_by,
    r.updated_by                AS role_updated_by,
    r.is_active                 AS role_is_active,
    r.is_deleted                AS role_is_deleted,
    r.created_at                AS role_created_at,
    r.updated_at                AS role_updated_at,
    r.deleted_at                AS role_deleted_at
FROM roles r
LEFT JOIN roles pr ON r.parent_role_id = pr.id AND pr.is_deleted = FALSE
WHERE r.is_deleted = FALSE;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: View all roles with hierarchy
-- SELECT role_id, role_name, role_code, role_level, role_parent_name FROM uv_roles ORDER BY role_level, role_display_order;

-- Test: View system roles only
-- SELECT role_name, role_code, role_level FROM uv_roles WHERE role_is_system_role = TRUE ORDER BY role_level;

-- ══════════════════════════════════════════════════════════════════════════════
