-- ============================================================
-- Phase 0: Audit Trigger Functions
-- ============================================================
-- 1. fn_audit_log_trigger()   — auto-fires on INSERT/UPDATE
-- 2. udf_log_custom_event()   — callable for LOGIN, LOGOUT, etc.
-- ============================================================
-- Application context is passed via SET LOCAL session variables:
--   SET LOCAL app.user_id       = '123';
--   SET LOCAL app.user_email    = 'girish@test.com';
--   SET LOCAL app.ip_address    = '203.0.113.45';
--   SET LOCAL app.device_type   = 'mobile';
--   SET LOCAL app.os            = 'iOS 17';
--   SET LOCAL app.browser       = 'Safari 17';
--   SET LOCAL app.user_agent    = 'Mozilla/5.0 ...';
--   SET LOCAL app.app_version   = '2.1.0';
--   SET LOCAL app.session_id    = 'sess_abc123';
--   SET LOCAL app.request_id    = 'req_xyz789';
--   SET LOCAL app.endpoint      = '/api/users/update';
--   SET LOCAL app.location      = '{"lat":19.076,"lng":72.877,"city":"Mumbai","country":"India"}';
--
-- If no session variables are set (migration, direct SQL),
-- all context fields default to NULL — never errors.
--
-- Depends : 10_audit_log_table.sql
-- Used By : 12_audit_register_helper.sql
-- ============================================================


-- =============================================
-- HELPER: _nullif_setting (internal)
-- =============================================
-- Safely reads a session variable, returns NULL if
-- not set, empty, or 'null' string.

CREATE OR REPLACE FUNCTION _nullif_setting(p_key TEXT)
RETURNS TEXT
SET search_path = public
AS $$
DECLARE
    v_val TEXT;
BEGIN
    v_val := current_setting(p_key, true);  -- true = return NULL if missing
    IF v_val IS NULL OR btrim(v_val) = '' OR lower(btrim(v_val)) = 'null' THEN
        RETURN NULL;
    END IF;
    RETURN btrim(v_val);
END;
$$ LANGUAGE plpgsql STABLE;


-- =============================================
-- FUNCTION 1: fn_audit_log_trigger
-- =============================================
-- Purpose : Automatic audit trail for every table.
-- Fires   : AFTER INSERT OR UPDATE (per row)
-- Logic   :
--   INSERT → operation = INSERT, new_values = NEW
--   UPDATE → detects SOFT_DELETE, RESTORE, ROLE_CHANGE,
--            PASSWORD_CHANGE, or plain UPDATE.
--            Captures old_values, new_values, changed_fields.
-- Context : Reads app.* session variables for who/where/how.
-- =============================================

CREATE OR REPLACE FUNCTION fn_audit_log_trigger()
RETURNS TRIGGER
SET search_path = public
AS $$
DECLARE
    v_old_json      JSONB;
    v_new_json      JSONB;
    v_operation      audit_operation;
    v_changed        TEXT[] := '{}';
    v_severity       audit_severity := 'info';
    v_description    TEXT;
    v_key            TEXT;
    v_user_id        BIGINT;
    v_user_email     TEXT;
    v_ip             INET;
    v_device         audit_device_type;
    v_session        TEXT;
    v_request        TEXT;
    v_location       JSONB;
    v_setting        TEXT;
BEGIN

    -- ── Read application context from session variables ──

    v_setting := _nullif_setting('app.user_id');
    IF v_setting IS NOT NULL THEN
        v_user_id := v_setting::BIGINT;
    END IF;

    v_user_email := _nullif_setting('app.user_email');

    v_setting := _nullif_setting('app.ip_address');
    IF v_setting IS NOT NULL THEN
        v_ip := v_setting::INET;
    END IF;

    v_setting := _nullif_setting('app.device_type');
    IF v_setting IS NOT NULL THEN
        BEGIN
            v_device := v_setting::audit_device_type;
        EXCEPTION WHEN invalid_text_representation THEN
            v_device := 'unknown';
        END;
    ELSE
        v_device := 'unknown';
    END IF;

    v_session := _nullif_setting('app.session_id');
    v_request := _nullif_setting('app.request_id');

    v_setting := _nullif_setting('app.location');
    IF v_setting IS NOT NULL THEN
        BEGIN
            v_location := v_setting::JSONB;
        EXCEPTION WHEN OTHERS THEN
            v_location := NULL;  -- ignore malformed JSON
        END;
    END IF;


    -- ── Determine operation and build payloads ──

    IF TG_OP = 'INSERT' THEN

        v_operation  := 'INSERT';
        v_new_json   := row_to_json(NEW)::JSONB;
        v_old_json   := NULL;
        v_description := format('New %s record created (id: %s)', TG_TABLE_NAME, v_new_json ->> 'id');

    ELSIF TG_OP = 'UPDATE' THEN

        v_old_json := row_to_json(OLD)::JSONB;
        v_new_json := row_to_json(NEW)::JSONB;

        -- Build changed_fields array (compare old vs new key by key)
        FOR v_key IN SELECT jsonb_object_keys(v_new_json)
        LOOP
            -- Skip audit columns from change detection
            IF v_key IN ('updated_at', 'updated_by') THEN
                CONTINUE;
            END IF;

            IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
                v_changed := array_append(v_changed, v_key);
            END IF;
        END LOOP;

        -- Skip logging if nothing meaningful changed
        IF array_length(v_changed, 1) IS NULL OR array_length(v_changed, 1) = 0 THEN
            RETURN NEW;
        END IF;

        -- Detect operation sub-type from the change
        IF 'is_deleted' = ANY(v_changed)
           AND (v_new_json ->> 'is_deleted')::BOOLEAN = TRUE
           AND (v_old_json ->> 'is_deleted')::BOOLEAN = FALSE THEN

            v_operation   := 'SOFT_DELETE';
            v_severity    := 'warning';
            v_description := format('%s record soft-deleted (id: %s)', TG_TABLE_NAME, v_new_json ->> 'id');

        ELSIF 'is_deleted' = ANY(v_changed)
              AND (v_new_json ->> 'is_deleted')::BOOLEAN = FALSE
              AND (v_old_json ->> 'is_deleted')::BOOLEAN = TRUE THEN

            v_operation   := 'RESTORE';
            v_severity    := 'warning';
            v_description := format('%s record restored (id: %s)', TG_TABLE_NAME, v_new_json ->> 'id');

        ELSIF 'password' = ANY(v_changed) THEN

            v_operation   := 'PASSWORD_CHANGE';
            v_severity    := 'warning';
            v_description := format('Password changed for %s (id: %s)', TG_TABLE_NAME, v_new_json ->> 'id');

            -- Strip password hashes from audit log for security
            v_old_json := v_old_json - 'password';
            v_new_json := v_new_json - 'password';
            v_changed  := array_remove(v_changed, 'password');

        ELSIF 'role_id' = ANY(v_changed) THEN

            v_operation   := 'ROLE_CHANGE';
            v_severity    := 'critical';
            v_description := format('Role changed for %s (id: %s) from role %s to %s',
                                    TG_TABLE_NAME,
                                    v_new_json ->> 'id',
                                    v_old_json ->> 'role_id',
                                    v_new_json ->> 'role_id');

        ELSE
            v_operation   := 'UPDATE';
            v_description := format('%s record updated (id: %s), fields: %s',
                                    TG_TABLE_NAME,
                                    v_new_json ->> 'id',
                                    array_to_string(v_changed, ', '));
        END IF;

        -- Always strip password from payloads (even on non-password updates)
        v_old_json := v_old_json - 'password';
        v_new_json := v_new_json - 'password';

    END IF;


    -- ── Insert audit log entry ──

    INSERT INTO audit_logs (
        table_name,
        record_id,
        operation,
        old_values,
        new_values,
        changed_fields,
        user_id,
        user_email,
        ip_address,
        location,
        user_agent,
        device_type,
        os,
        browser,
        app_version,
        session_id,
        request_id,
        endpoint,
        action_source,
        severity,
        description
    )
    VALUES (
        TG_TABLE_NAME,
        COALESCE((v_new_json ->> 'id')::BIGINT, (v_old_json ->> 'id')::BIGINT),
        v_operation,
        v_old_json,
        v_new_json,
        CASE WHEN array_length(v_changed, 1) > 0 THEN v_changed ELSE NULL END,
        v_user_id,
        v_user_email,
        v_ip,
        v_location,
        _nullif_setting('app.user_agent'),
        v_device,
        _nullif_setting('app.os'),
        _nullif_setting('app.browser'),
        _nullif_setting('app.app_version'),
        v_session,
        v_request,
        _nullif_setting('app.endpoint'),
        'trigger',
        v_severity,
        v_description
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================
-- FUNCTION 2: udf_log_custom_event
-- =============================================
-- Purpose : Log application-level events that don't
--           come from table triggers (LOGIN, LOGOUT,
--           EXPORT, IMPORT, CUSTOM).
-- Usage   :
--   SELECT udf_log_custom_event(
--       p_operation    := 'LOGIN',
--       p_user_id      := 123,
--       p_user_email   := 'girish@test.com',
--       p_ip_address   := '203.0.113.45'::INET,
--       p_device_type  := 'mobile',
--       p_os           := 'iOS 17',
--       p_browser      := 'Safari 17'
--   );
-- =============================================

CREATE OR REPLACE FUNCTION udf_log_custom_event(
    p_operation         audit_operation,
    p_table_name        TEXT                DEFAULT 'system',
    p_record_id         BIGINT              DEFAULT NULL,
    p_user_id           BIGINT              DEFAULT NULL,
    p_user_email        TEXT                DEFAULT NULL,
    p_ip_address        INET                DEFAULT NULL,
    p_device_type       audit_device_type   DEFAULT 'unknown',
    p_os                TEXT                DEFAULT NULL,
    p_browser           TEXT                DEFAULT NULL,
    p_user_agent        TEXT                DEFAULT NULL,
    p_app_version       TEXT                DEFAULT NULL,
    p_session_id        TEXT                DEFAULT NULL,
    p_request_id        TEXT                DEFAULT NULL,
    p_endpoint          TEXT                DEFAULT NULL,
    p_action_source     audit_action_source DEFAULT 'api',
    p_severity          audit_severity      DEFAULT 'info',
    p_description       TEXT                DEFAULT NULL,
    p_location          JSONB               DEFAULT NULL,          -- e.g. '{"lat":19.076,"lng":72.877,"city":"Mumbai"}'
    p_metadata          JSONB               DEFAULT NULL,
    p_new_values        JSONB               DEFAULT NULL,
    p_old_values        JSONB               DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_id BIGINT;
BEGIN

    INSERT INTO audit_logs (
        table_name,
        record_id,
        operation,
        old_values,
        new_values,
        user_id,
        user_email,
        ip_address,
        location,
        user_agent,
        device_type,
        os,
        browser,
        app_version,
        session_id,
        request_id,
        endpoint,
        action_source,
        severity,
        description,
        metadata
    )
    VALUES (
        p_table_name,
        p_record_id,
        p_operation,
        p_old_values,
        p_new_values,
        p_user_id,
        p_user_email,
        p_ip_address,
        p_location,
        p_user_agent,
        p_device_type,
        p_os,
        p_browser,
        p_app_version,
        p_session_id,
        p_request_id,
        p_endpoint,
        p_action_source,
        p_severity,
        p_description,
        p_metadata
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Audit event logged: %s', p_operation),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error logging audit event: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Log a login event (with location from mobile app)
-- SELECT udf_log_custom_event(
--     p_operation    := 'LOGIN',
--     p_user_id      := 1,
--     p_user_email   := 'sa@growupmore.com',
--     p_ip_address   := '203.0.113.45'::INET,
--     p_device_type  := 'mobile',
--     p_os           := 'iOS 17',
--     p_browser      := 'Safari 17',
--     p_description  := 'Super Admin logged in',
--     p_location     := '{"lat":19.076,"lng":72.877,"city":"Mumbai","state":"Maharashtra","country":"India","accuracy":10.5,"source":"gps"}'::JSONB
-- );

-- Test 2: Log a logout event
-- SELECT udf_log_custom_event(
--     p_operation    := 'LOGOUT',
--     p_user_id      := 1,
--     p_user_email   := 'sa@growupmore.com',
--     p_ip_address   := '203.0.113.45'::INET,
--     p_description  := 'Super Admin logged out'
-- );

-- Test 3: Log an export event
-- SELECT udf_log_custom_event(
--     p_operation    := 'EXPORT',
--     p_table_name   := 'users',
--     p_user_id      := 1,
--     p_description  := 'Exported all users to CSV',
--     p_severity     := 'warning',
--     p_metadata     := '{"format": "csv", "row_count": 5000}'::JSONB
-- );

-- Test 4: Query recent audit logs
-- SELECT event_id, table_name, operation, user_email, ip_address, severity, description, created_at
-- FROM audit_logs
-- ORDER BY created_at DESC
-- LIMIT 20;

-- Test 5: Query all actions by a specific user
-- SELECT operation, table_name, record_id, description, created_at
-- FROM audit_logs
-- WHERE user_id = 1
-- ORDER BY created_at DESC;

-- Test 6: Query all changes to a specific record
-- SELECT operation, changed_fields, old_values, new_values, user_email, created_at
-- FROM audit_logs
-- WHERE table_name = 'users' AND record_id = 1
-- ORDER BY created_at DESC;

-- Test 7: Security investigation — all actions from an IP
-- SELECT operation, table_name, user_email, description, created_at
-- FROM audit_logs
-- WHERE ip_address = '203.0.113.45'::INET
-- ORDER BY created_at DESC;

-- ══════════════════════════════════════════════════════════════════════════════
