-- ══════════════════════════════════════════════════════════════════════════════
-- FILE: 02_view.sql
-- PURPOSE: Create views for permissions
-- ══════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS uv_permissions CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW: uv_permissions
-- PURPOSE: All permission columns with prefixed aliases
-- ══════════════════════════════════════════════════════════════════════════════
CREATE VIEW uv_permissions
WITH (security_invoker = true) AS
SELECT
    p.id                        AS perm_id,
    p.name                      AS perm_name,
    p.code                      AS perm_code,
    p.description               AS perm_description,
    p.resource                  AS perm_resource,
    p.action                    AS perm_action,
    p.scope                     AS perm_scope,
    p.display_order             AS perm_display_order,
    p.is_active                 AS perm_is_active,
    p.is_deleted                AS perm_is_deleted,
    p.created_at                AS perm_created_at,
    p.updated_at                AS perm_updated_at,
    p.deleted_at                AS perm_deleted_at
FROM permissions p;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: View all active permissions
-- SELECT perm_name, perm_code, perm_resource, perm_action, perm_scope FROM uv_permissions WHERE perm_is_deleted = FALSE ORDER BY perm_display_order;

-- Test: View permissions for a specific resource
-- SELECT perm_name, perm_code, perm_action FROM uv_permissions WHERE perm_resource = 'course' AND perm_is_deleted = FALSE ORDER BY perm_display_order;

-- Test: View global-scope permissions
-- SELECT perm_name, perm_code FROM uv_permissions WHERE perm_scope = 'global' AND perm_is_deleted = FALSE;

-- ══════════════════════════════════════════════════════════════════════════════
