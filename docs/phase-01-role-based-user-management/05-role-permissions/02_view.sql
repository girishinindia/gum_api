-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW: uv_role_permissions
-- PURPOSE: Role-permission assignments with role and permission details
-- ══════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS uv_role_permissions CASCADE;

CREATE VIEW uv_role_permissions
WITH (security_invoker = true) AS
SELECT
    rp.id                       AS rp_id,
    rp.role_id                  AS rp_role_id,
    r.name                      AS rp_role_name,
    r.code                      AS rp_role_code,
    r.level                     AS rp_role_level,
    rp.permission_id            AS rp_permission_id,
    p.name                      AS rp_perm_name,
    p.code                      AS rp_perm_code,
    p.resource                  AS rp_perm_resource,
    p.action                    AS rp_perm_action,
    p.scope                     AS rp_perm_scope,
    rp.is_active                AS rp_is_active,
    rp.is_deleted               AS rp_is_deleted,
    rp.created_at               AS rp_created_at,
    rp.updated_at               AS rp_updated_at,
    rp.deleted_at               AS rp_deleted_at
FROM role_permissions rp
    INNER JOIN roles r       ON rp.role_id       = r.id
    INNER JOIN permissions p ON rp.permission_id  = p.id;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: View all active role-permission mappings
-- SELECT rp_role_name, rp_perm_name, rp_perm_resource, rp_perm_action FROM uv_role_permissions WHERE rp_is_deleted = FALSE ORDER BY rp_role_level, rp_perm_name;

-- Test: View permissions for Admin role
-- SELECT rp_perm_name, rp_perm_code FROM uv_role_permissions WHERE rp_role_code = 'admin' AND rp_is_deleted = FALSE;

-- ══════════════════════════════════════════════════════════════════════════════
