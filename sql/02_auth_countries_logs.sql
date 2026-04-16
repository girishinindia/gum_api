-- ============================================================
-- 02_auth_countries_logs.sql
-- Users, Sessions, Countries, Activity Logs
-- Run AFTER: 01_rbac.sql
-- ============================================================


-- ============================================================
-- 1. USERS
-- ============================================================

CREATE TABLE users (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name          VARCHAR(75) NOT NULL,
    last_name           VARCHAR(75) NOT NULL,
    full_name           VARCHAR(150) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    display_name        VARCHAR(50),
    avatar_url          TEXT,
    email               VARCHAR(255) NOT NULL,
    mobile              VARCHAR(15) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status = ANY(ARRAY['active','inactive','suspended'])),
    locale              VARCHAR(5) NOT NULL DEFAULT 'hi'
                        CHECK (locale = ANY(ARRAY['en','hi','gu'])),
    preferences         JSONB NOT NULL DEFAULT '{"language":"hi","notifications_email":true,"notifications_sms":true,"theme":"system"}'::JSONB,
    last_login_at       TIMESTAMPTZ,
    last_login_method   VARCHAR(20),
    login_count         INTEGER NOT NULL DEFAULT 0,
    password_changed_at TIMESTAMPTZ,
    failed_login_count  SMALLINT NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_email_format CHECK (email ~* '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'),
    CONSTRAINT users_mobile_format CHECK (mobile ~ '^\+[1-9]\d{6,14}$')
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_mobile ON users(mobile);
CREATE INDEX idx_users_status ON users(status) WHERE status = 'active';
CREATE INDEX idx_users_name ON users(full_name);
CREATE INDEX idx_users_created ON users(created_at DESC);


-- ============================================================
-- 2. LOGIN_SESSIONS
-- ============================================================

CREATE TABLE login_sessions (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_method        VARCHAR(20) NOT NULL
                        CHECK (login_method = ANY(ARRAY['email_password','mobile_otp'])),
    ip_address          INET,
    user_agent          TEXT,
    device_type         VARCHAR(20),
    refresh_token_hash  VARCHAR(128) NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_active_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    revoked_at          TIMESTAMPTZ,
    revoked_reason      VARCHAR(30),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_active ON login_sessions(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_refresh ON login_sessions(refresh_token_hash) WHERE is_active = TRUE;


-- ============================================================
-- 3. COUNTRIES
-- ============================================================

CREATE TABLE countries (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                TEXT NOT NULL,
    iso2                VARCHAR(2) NOT NULL UNIQUE,
    iso3                VARCHAR(3) NOT NULL UNIQUE,
    phone_code          VARCHAR(10),
    nationality         TEXT,
    national_language   TEXT,
    languages           JSONB DEFAULT '[]'::JSONB,
    tld                 VARCHAR(10),
    currency            VARCHAR(5),
    currency_name       TEXT,
    currency_symbol     VARCHAR(5),
    flag_image          TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order          SMALLINT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_countries_iso2 ON countries(iso2);
CREATE INDEX idx_countries_active ON countries(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_countries_sort ON countries(sort_order, name);


-- ============================================================
-- 4. ACTIVITY LOGS (Comprehensive)
-- ============================================================

-- ── 4a. AUTH ACTIVITY LOG ──
-- Tracks: register, login, logout, OTP, password change, lockout

CREATE TABLE auth_activity_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(30) NOT NULL
                    CHECK (action = ANY(ARRAY[
                        'register_initiated', 'register_completed',
                        'otp_sent_email', 'otp_sent_sms',
                        'otp_verified_email', 'otp_verified_sms',
                        'otp_failed_email', 'otp_failed_sms',
                        'otp_expired', 'otp_resent',
                        'login_success', 'login_failed',
                        'logout',
                        'token_refreshed',
                        'password_changed', 'password_reset_requested',
                        'account_locked', 'account_unlocked',
                        'account_suspended', 'account_reactivated'
                    ])),
    identifier      VARCHAR(255),           -- email or mobile used
    ip_address      INET,
    user_agent      TEXT,
    device_type     VARCHAR(20),
    metadata        JSONB DEFAULT '{}',     -- extra context: {login_method, otp_channel, failure_reason, etc.}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_log_user ON auth_activity_log(user_id);
CREATE INDEX idx_auth_log_action ON auth_activity_log(action);
CREATE INDEX idx_auth_log_created ON auth_activity_log(created_at DESC);
CREATE INDEX idx_auth_log_ip ON auth_activity_log(ip_address);


-- ── 4b. ADMIN ACTIVITY LOG ──
-- Tracks: role changes, permission changes, user management, settings

CREATE TABLE admin_activity_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,  -- who did it
    action          VARCHAR(40) NOT NULL
                    CHECK (action = ANY(ARRAY[
                        'role_created', 'role_updated', 'role_deleted',
                        'role_assigned', 'role_revoked',
                        'permission_granted', 'permission_denied', 'permission_revoked',
                        'user_created', 'user_updated', 'user_suspended',
                        'user_reactivated', 'user_deleted',
                        'session_revoked', 'all_sessions_revoked',
                        'settings_updated',
                        'country_created', 'country_updated', 'country_deleted',
                        'country_imported'
                    ])),
    target_type     VARCHAR(30),            -- 'user', 'role', 'permission', 'country', 'settings'
    target_id       BIGINT,                 -- ID of affected record
    target_name     VARCHAR(255),           -- human-readable: "student role", "girish@...", "India"
    changes         JSONB DEFAULT '{}',     -- {field: {old: x, new: y}} for updates
    ip_address      INET,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_log_actor ON admin_activity_log(actor_id);
CREATE INDEX idx_admin_log_action ON admin_activity_log(action);
CREATE INDEX idx_admin_log_target ON admin_activity_log(target_type, target_id);
CREATE INDEX idx_admin_log_created ON admin_activity_log(created_at DESC);


-- ── 4c. DATA ACTIVITY LOG ──
-- Tracks: CRUD on business tables (courses, modules, enrollments, payments, media)

CREATE TABLE data_activity_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(30) NOT NULL
                    CHECK (action = ANY(ARRAY[
                        'created', 'updated', 'deleted',
                        'published', 'unpublished',
                        'duplicated', 'reordered',
                        'enrolled', 'unenrolled',
                        'payment_created', 'payment_refunded',
                        'media_uploaded', 'media_deleted',
                        'exported', 'imported'
                    ])),
    resource_type   VARCHAR(50) NOT NULL,   -- 'course', 'module', 'enrollment', 'payment', 'media'
    resource_id     BIGINT,
    resource_name   VARCHAR(255),           -- "Python Basics", "Module 3: Loops"
    changes         JSONB DEFAULT '{}',     -- {field: {old: x, new: y}} for updates
    ip_address      INET,
    metadata        JSONB DEFAULT '{}',     -- {course_id, batch_size, file_name, etc.}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_log_actor ON data_activity_log(actor_id);
CREATE INDEX idx_data_log_action ON data_activity_log(action);
CREATE INDEX idx_data_log_resource ON data_activity_log(resource_type, resource_id);
CREATE INDEX idx_data_log_created ON data_activity_log(created_at DESC);


-- ── 4d. SYSTEM ACTIVITY LOG ──
-- Tracks: API errors, rate limits, security events, cron jobs

CREATE TABLE system_activity_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    level           VARCHAR(10) NOT NULL DEFAULT 'info'
                    CHECK (level = ANY(ARRAY['debug','info','warn','error','critical'])),
    source          VARCHAR(50) NOT NULL,   -- 'api', 'cron', 'webhook', 'middleware', 'worker'
    action          VARCHAR(50) NOT NULL,   -- 'rate_limit_hit', 'api_error', 'cron_executed', etc.
    message         TEXT NOT NULL,
    user_id         BIGINT,                 -- optional, if related to a user
    ip_address      INET,
    endpoint        VARCHAR(255),           -- '/api/v1/auth/login'
    http_method     VARCHAR(10),            -- 'GET', 'POST', etc.
    status_code     SMALLINT,               -- 429, 500, etc.
    response_time   INTEGER,                -- milliseconds
    error_stack     TEXT,                    -- stack trace for errors
    metadata        JSONB DEFAULT '{}',     -- {query_params, request_body_size, etc.}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_log_level ON system_activity_log(level) WHERE level IN ('error','critical');
CREATE INDEX idx_system_log_source ON system_activity_log(source);
CREATE INDEX idx_system_log_created ON system_activity_log(created_at DESC);
CREATE INDEX idx_system_log_endpoint ON system_activity_log(endpoint);
CREATE INDEX idx_system_log_user ON system_activity_log(user_id) WHERE user_id IS NOT NULL;


-- ============================================================
-- 5. ADD FKs FROM RBAC → USERS
-- ============================================================

ALTER TABLE user_roles
    ADD CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_permissions
    ADD CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE resource_access
    ADD CONSTRAINT fk_resource_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


-- ============================================================
-- 6. TRIGGERS
-- ============================================================

CREATE TRIGGER tr_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_countries_updated_at BEFORE UPDATE ON countries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 7. LOG HELPER FUNCTIONS (call from Express API)
-- ============================================================

-- Auth log
CREATE OR REPLACE FUNCTION log_auth_activity(
    p_user_id BIGINT, p_action VARCHAR, p_identifier VARCHAR DEFAULT NULL,
    p_ip INET DEFAULT NULL, p_user_agent TEXT DEFAULT NULL,
    p_device_type VARCHAR DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
    INSERT INTO auth_activity_log (user_id, action, identifier, ip_address, user_agent, device_type, metadata)
    VALUES (p_user_id, p_action, p_identifier, p_ip, p_user_agent, p_device_type, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

-- Admin log
CREATE OR REPLACE FUNCTION log_admin_activity(
    p_actor_id BIGINT, p_action VARCHAR, p_target_type VARCHAR DEFAULT NULL,
    p_target_id BIGINT DEFAULT NULL, p_target_name VARCHAR DEFAULT NULL,
    p_changes JSONB DEFAULT '{}', p_ip INET DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
    INSERT INTO admin_activity_log (actor_id, action, target_type, target_id, target_name, changes, ip_address, metadata)
    VALUES (p_actor_id, p_action, p_target_type, p_target_id, p_target_name, p_changes, p_ip, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

-- Data log
CREATE OR REPLACE FUNCTION log_data_activity(
    p_actor_id BIGINT, p_action VARCHAR, p_resource_type VARCHAR,
    p_resource_id BIGINT DEFAULT NULL, p_resource_name VARCHAR DEFAULT NULL,
    p_changes JSONB DEFAULT '{}', p_ip INET DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
    INSERT INTO data_activity_log (actor_id, action, resource_type, resource_id, resource_name, changes, ip_address, metadata)
    VALUES (p_actor_id, p_action, p_resource_type, p_resource_id, p_resource_name, p_changes, p_ip, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

-- System log
CREATE OR REPLACE FUNCTION log_system_activity(
    p_level VARCHAR, p_source VARCHAR, p_action VARCHAR, p_message TEXT,
    p_user_id BIGINT DEFAULT NULL, p_ip INET DEFAULT NULL,
    p_endpoint VARCHAR DEFAULT NULL, p_http_method VARCHAR DEFAULT NULL,
    p_status_code SMALLINT DEFAULT NULL, p_response_time INTEGER DEFAULT NULL,
    p_error_stack TEXT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
    INSERT INTO system_activity_log (level, source, action, message, user_id, ip_address, endpoint, http_method, status_code, response_time, error_stack, metadata)
    VALUES (p_level, p_source, p_action, p_message, p_user_id, p_ip, p_endpoint, p_http_method, p_status_code, p_response_time, p_error_stack, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;


-- ============================================================
-- 8. USER AUTH FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION is_email_available(p_email VARCHAR)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT NOT EXISTS(SELECT 1 FROM users WHERE email = LOWER(TRIM(p_email)));
$$;

CREATE OR REPLACE FUNCTION is_mobile_available(p_mobile VARCHAR)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT NOT EXISTS(SELECT 1 FROM users WHERE mobile = p_mobile);
$$;

CREATE OR REPLACE FUNCTION create_verified_user(
    p_first_name VARCHAR, p_last_name VARCHAR,
    p_email VARCHAR, p_mobile VARCHAR, p_password_hash VARCHAR
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id BIGINT; v_role_id BIGINT;
BEGIN
    INSERT INTO users (first_name, last_name, email, mobile, password_hash)
    VALUES (TRIM(p_first_name), TRIM(p_last_name), LOWER(TRIM(p_email)), p_mobile, p_password_hash)
    RETURNING id INTO v_user_id;

    SELECT id INTO v_role_id FROM roles WHERE name = 'student' LIMIT 1;
    IF v_role_id IS NOT NULL THEN
        INSERT INTO user_roles (user_id, role_id, scope, is_active)
        VALUES (v_user_id, v_role_id, 'global', TRUE);
    END IF;
    RETURN v_user_id;
END; $$;

CREATE OR REPLACE FUNCTION find_user_for_login(p_identifier VARCHAR)
RETURNS TABLE (
    user_id BIGINT, first_name VARCHAR(75), last_name VARCHAR(75),
    email VARCHAR(255), mobile VARCHAR(15), password_hash VARCHAR(255),
    status VARCHAR(20), failed_login_count SMALLINT, locked_until TIMESTAMPTZ,
    detected_method VARCHAR(20)
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clean VARCHAR;
BEGIN
    v_clean := TRIM(p_identifier);
    IF v_clean ~ '^\+?[0-9]{10,15}$' THEN
        v_clean := REGEXP_REPLACE(v_clean, '[^0-9]', '', 'g');
        IF LENGTH(v_clean) = 10 THEN v_clean := '+91' || v_clean;
        ELSE v_clean := '+' || v_clean; END IF;
        RETURN QUERY SELECT u.id, u.first_name, u.last_name, u.email, u.mobile,
            u.password_hash, u.status, u.failed_login_count, u.locked_until, 'mobile'::VARCHAR(20)
        FROM users u WHERE u.mobile = v_clean LIMIT 1;
    ELSE
        RETURN QUERY SELECT u.id, u.first_name, u.last_name, u.email, u.mobile,
            u.password_hash, u.status, u.failed_login_count, u.locked_until, 'email'::VARCHAR(20)
        FROM users u WHERE u.email = LOWER(v_clean) LIMIT 1;
    END IF;
END; $$;

CREATE OR REPLACE FUNCTION update_login_success(p_user_id BIGINT, p_method VARCHAR)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE users SET last_login_at = NOW(), last_login_method = p_method,
        login_count = login_count + 1, failed_login_count = 0,
        locked_until = NULL, updated_at = NOW()
    WHERE id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION update_login_failure(p_user_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE users SET failed_login_count = failed_login_count + 1,
        locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
        updated_at = NOW()
    WHERE id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION change_password(p_user_id BIGINT, p_new_hash VARCHAR)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE users SET password_hash = p_new_hash, password_changed_at = NOW(),
        failed_login_count = 0, locked_until = NULL, updated_at = NOW()
    WHERE id = p_user_id;
    UPDATE login_sessions SET is_active = FALSE, revoked_at = NOW(), revoked_reason = 'password_change'
    WHERE user_id = p_user_id AND is_active = TRUE;
END; $$;

CREATE OR REPLACE FUNCTION create_session(
    p_user_id BIGINT, p_login_method VARCHAR, p_refresh_hash VARCHAR,
    p_ip INET DEFAULT NULL, p_user_agent TEXT DEFAULT NULL, p_device_type VARCHAR DEFAULT NULL
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
    INSERT INTO login_sessions (user_id, login_method, refresh_token_hash, ip_address, user_agent, device_type)
    VALUES (p_user_id, p_login_method, p_refresh_hash, p_ip, p_user_agent, p_device_type)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION revoke_session(p_session_id BIGINT, p_reason VARCHAR DEFAULT 'logout')
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE login_sessions SET is_active = FALSE, revoked_at = NOW(), revoked_reason = p_reason
    WHERE id = p_session_id AND is_active = TRUE;
    RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION revoke_all_sessions(p_user_id BIGINT, p_reason VARCHAR DEFAULT 'admin')
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
    UPDATE login_sessions SET is_active = FALSE, revoked_at = NOW(), revoked_reason = p_reason
    WHERE user_id = p_user_id AND is_active = TRUE;
    GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION verify_refresh_session(p_refresh_hash VARCHAR)
RETURNS TABLE (session_id BIGINT, user_id BIGINT, first_name VARCHAR(75), last_name VARCHAR(75),
    email VARCHAR(255), mobile VARCHAR(15), status VARCHAR(20))
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY SELECT ls.id, u.id, u.first_name, u.last_name, u.email, u.mobile, u.status
    FROM login_sessions ls JOIN users u ON ls.user_id = u.id
    WHERE ls.refresh_token_hash = p_refresh_hash AND ls.is_active = TRUE
        AND ls.expires_at > NOW() AND u.status = 'active' LIMIT 1;
    UPDATE login_sessions SET last_active_at = NOW()
    WHERE refresh_token_hash = p_refresh_hash AND is_active = TRUE;
END; $$;


-- ============================================================
-- 9. RLS
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access" ON users FOR ALL USING (FALSE);
CREATE POLICY "No direct access" ON login_sessions FOR ALL USING (FALSE);
CREATE POLICY "No direct access" ON countries FOR ALL USING (FALSE);
CREATE POLICY "No direct access" ON auth_activity_log FOR ALL USING (FALSE);
CREATE POLICY "No direct access" ON admin_activity_log FOR ALL USING (FALSE);
CREATE POLICY "No direct access" ON data_activity_log FOR ALL USING (FALSE);
CREATE POLICY "No direct access" ON system_activity_log FOR ALL USING (FALSE);


-- ============================================================
-- 10. VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_user_profile AS
SELECT u.id, u.first_name, u.last_name, u.full_name,
    u.email, u.mobile, u.avatar_url, u.status, u.locale,
    u.last_login_at, u.last_login_method, u.login_count,
    u.preferences, u.created_at,
    COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'role', r.name, 'display_name', r.display_name, 'level', r.level
    )) FILTER (WHERE ur.is_active = TRUE AND r.id IS NOT NULL), '[]'::JSONB) AS roles,
    COALESCE(MAX(r.level) FILTER (WHERE ur.is_active = TRUE), 0) AS max_role_level
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
LEFT JOIN roles r ON ur.role_id = r.id AND r.is_active = TRUE
GROUP BY u.id;

CREATE OR REPLACE VIEW v_user_sessions AS
SELECT ls.id AS session_id, ls.user_id, u.full_name,
    ls.login_method, ls.device_type, ls.ip_address,
    ls.last_active_at, ls.created_at, ls.expires_at
FROM login_sessions ls JOIN users u ON ls.user_id = u.id
WHERE ls.is_active = TRUE AND ls.expires_at > NOW()
ORDER BY ls.last_active_at DESC;


-- ============================================================
-- 11. SEED: India in countries (you'll import rest via bulk)
-- ============================================================

INSERT INTO countries (name, iso2, iso3, phone_code, nationality, national_language, languages, tld, currency, currency_name, currency_symbol, sort_order) VALUES
    ('India', 'IN', 'IND', '+91', 'Indian', 'Hindi', '["Hindi","English","Gujarati","Tamil","Telugu","Marathi","Kannada"]'::JSONB, '.in', 'INR', 'Indian Rupee', '₹', 1);


-- ============================================================
-- DONE. Tables created:
--   users, login_sessions, countries
--   auth_activity_log, admin_activity_log,
--   data_activity_log, system_activity_log
-- + FKs from RBAC tables → users
-- + All helper functions + log functions
-- ============================================================
