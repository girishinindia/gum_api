-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW: uv_user_permissions
-- PURPOSE: User-permission overrides with user and permission details
-- ══════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS uv_user_permissions CASCADE;

CREATE VIEW uv_user_permissions
WITH (security_invoker = true) AS
SELECT
    up.id                       AS up_id,
    up.user_id                  AS up_user_id,
    u.first_name                AS up_user_first_name,
    u.last_name                 AS up_user_last_name,
    u.email                     AS up_user_email,
    up.permission_id            AS up_permission_id,
    p.name                      AS up_perm_name,
    p.code                      AS up_perm_code,
    p.resource                  AS up_perm_resource,
    p.action                    AS up_perm_action,
    p.scope                     AS up_perm_scope,
    up.grant_type               AS up_grant_type,
    up.is_active                AS up_is_active,
    up.is_deleted               AS up_is_deleted,
    up.created_at               AS up_created_at,
    up.updated_at               AS up_updated_at,
    up.deleted_at               AS up_deleted_at
FROM user_permissions up
    INNER JOIN users u       ON up.user_id       = u.id
    INNER JOIN permissions p ON up.permission_id  = p.id;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: View all active user-permission overrides
-- SELECT up_user_email, up_perm_name, up_grant_type FROM uv_user_permissions WHERE up_is_deleted = FALSE;

-- Test: View denied permissions for a specific user
-- SELECT up_perm_name, up_perm_code FROM uv_user_permissions WHERE up_user_id = 5 AND up_grant_type = 'deny' AND up_is_deleted = FALSE;

-- ══════════════════════════════════════════════════════════════════════════════
