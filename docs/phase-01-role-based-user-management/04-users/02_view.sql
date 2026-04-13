-- ============================================================
-- View: uv_users (full — with role + country joins)
-- ============================================================
-- Joins users → roles, users → countries.
-- Password column excluded for security.
-- DEPENDS ON: users (phase-01/01-users), roles (phase-01/00-roles),
--             countries (future phase)
-- ============================================================


CREATE OR REPLACE VIEW uv_users
WITH (security_invoker = true) AS
SELECT
    -- ── User columns ──
    u.id                    AS user_id,
    u.role_id               AS user_role_id,
    u.country_id            AS user_country_id,
    u.first_name            AS user_first_name,
    u.last_name             AS user_last_name,
    u.email                 AS user_email,
    u.mobile                AS user_mobile,
    u.is_active             AS user_is_active,
    u.is_deleted            AS user_is_deleted,
    u.is_email_verified     AS user_is_email_verified,
    u.is_mobile_verified    AS user_is_mobile_verified,
    u.email_verified_at     AS user_email_verified_at,
    u.mobile_verified_at    AS user_mobile_verified_at,
    u.created_at            AS user_created_at,
    u.updated_at            AS user_updated_at,
    u.deleted_at            AS user_deleted_at,

    -- ── Role columns (from roles table) ──
    r.name                  AS role_name,
    r.code                  AS role_code,
    r.slug                  AS role_slug,
    r.level                 AS role_level,
    r.is_system_role        AS role_is_system_role,
    r.icon                  AS role_icon,
    r.color                 AS role_color,
    r.is_active             AS role_is_active,
    r.is_deleted            AS role_is_deleted,

    -- ── Country columns (from countries table) ──
    c.name                  AS country_name,
    c.iso2                  AS country_iso2,
    c.iso3                  AS country_iso3,
    c.phone_code            AS country_phone_code,
    c.nationality           AS country_nationality,
    c.national_language     AS country_national_language,
    c.languages             AS country_languages,
    c.currency              AS country_currency,
    c.currency_name         AS country_currency_name,
    c.currency_symbol       AS country_currency_symbol,
    c.flag_image            AS country_flag_image,
    c.is_active             AS country_is_active,
    c.is_deleted            AS country_is_deleted
FROM users u
LEFT JOIN roles r     ON r.id = u.role_id
LEFT JOIN countries c ON c.id = u.country_id;



-- ══════════════════════════════════════════════
-- Testing Queries
-- ══════════════════════════════════════════════

-- 1. All users via view
-- SELECT * FROM uv_users;

-- 2. Single user by ID
-- SELECT * FROM uv_users WHERE user_id = 1;

-- 3. Active users sorted by name
-- SELECT * FROM uv_users WHERE user_is_active = TRUE AND user_is_deleted = FALSE ORDER BY user_first_name;

-- 4. Search by email
-- SELECT user_first_name, user_email FROM uv_users WHERE user_email ILIKE '%growupmore%';

-- 5. Users by role
-- SELECT user_first_name, user_last_name, role_name, role_code FROM uv_users WHERE role_code = 'student';

-- 6. Users from India
-- SELECT user_first_name, user_last_name, role_name, country_name, country_phone_code FROM uv_users WHERE country_name = 'India';

-- 7. Users with country flag
-- SELECT user_first_name, country_name, country_flag_image FROM uv_users WHERE user_is_deleted = FALSE;

-- 8. Users by country ISO2
-- SELECT user_first_name, user_email, country_iso2 FROM uv_users WHERE country_iso2 = 'US';

-- 9. Unverified email users
-- SELECT user_first_name, user_email, user_is_email_verified FROM uv_users WHERE user_is_email_verified = FALSE;

-- 10. Recently active users (via audit_logs)
-- SELECT DISTINCT ON (al.user_id) al.user_id, u.user_first_name, al.created_at AS last_login
-- FROM audit_logs al JOIN uv_users u ON u.user_id = al.user_id
-- WHERE al.operation = 'LOGIN' ORDER BY al.user_id, al.created_at DESC;

-- 11. Users grouped by role
-- SELECT role_name, role_code, COUNT(*) AS user_count FROM uv_users WHERE user_is_deleted = FALSE GROUP BY role_name, role_code ORDER BY user_count DESC;
