/**
 * Purpose: Authenticate user with email/mobile and password, create session
 * Handles verification checks, failed attempt tracking, and session creation
 * Depends: users table, roles table, udf_login_attempt_check(), udf_login_attempt_record(),
 *          udf_login_attempt_reset(), udf_session_create()
 * Usage: SELECT udf_auth_login('user@example.com', 'password123', 'token_abc', NULL, '192.168.1.1'::INET);
 */

CREATE OR REPLACE FUNCTION udf_auth_login(
    p_identifier TEXT,
    p_password TEXT,
    p_session_token TEXT,
    p_refresh_token TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_device_type TEXT DEFAULT NULL,
    p_os TEXT DEFAULT NULL,
    p_browser TEXT DEFAULT NULL,
    p_location JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id BIGINT;
    v_password_hash TEXT;
    v_is_active BOOLEAN;
    v_is_deleted BOOLEAN;
    v_is_email_verified BOOLEAN;
    v_is_mobile_verified BOOLEAN;
    v_user_email CITEXT;
    v_user_mobile TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
    v_role_code TEXT;
    v_role_level INT;
    v_session_id BIGINT;
    v_attempt_check JSONB;
    v_is_blocked BOOLEAN;
    v_blocked_until TIMESTAMP;
    v_session_result JSONB;
    v_unverified_channels JSONB;
BEGIN
    -- Step 1: Check if identifier is blocked due to failed attempts
    v_attempt_check := udf_login_attempt_check(p_identifier);
    v_is_blocked := (v_attempt_check->>'is_blocked')::BOOLEAN;

    IF v_is_blocked THEN
        v_blocked_until := (v_attempt_check->>'blocked_until')::TIMESTAMP;
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Too many failed attempts. Account temporarily locked until ' || v_blocked_until,
            'is_blocked', TRUE,
            'blocked_until', v_blocked_until
        );
    END IF;

    -- Step 2: Find user by email OR mobile
    --
    -- first_name / last_name are read here (cheap — same row) so the
    -- Node layer can return them in the login response body without
    -- a second round-trip through udf_get_users. See Phase-1 docs:
    -- "02 - auth core.md" §2.2 response shape.
    SELECT u.id, u.password, u.is_active, u.is_deleted,
           u.is_email_verified, u.is_mobile_verified, u.email, u.mobile,
           u.first_name, u.last_name
    INTO v_user_id, v_password_hash, v_is_active, v_is_deleted,
         v_is_email_verified, v_is_mobile_verified, v_user_email, v_user_mobile,
         v_first_name, v_last_name
    FROM users u
    WHERE (u.email = LOWER(TRIM(p_identifier)) OR u.mobile = TRIM(p_identifier))
    LIMIT 1;

    -- Step 3: User not found
    IF v_user_id IS NULL THEN
        PERFORM udf_login_attempt_record(
            NULL::BIGINT,
            p_identifier,
            p_ip_address,
            p_user_agent,
            p_device_type,
            p_os,
            p_browser,
            'failed',
            'invalid_credentials'
        );
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid email/mobile or password'
        );
    END IF;

    -- Step 4: Check if user is deleted
    IF v_is_deleted THEN
        PERFORM udf_login_attempt_record(
            v_user_id,
            p_identifier,
            p_ip_address,
            p_user_agent,
            p_device_type,
            p_os,
            p_browser,
            'failed',
            'account_deleted'
        );
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Account has been deleted'
        );
    END IF;

    -- Step 5: Check if user is active
    IF NOT v_is_active THEN
        PERFORM udf_login_attempt_record(
            v_user_id,
            p_identifier,
            p_ip_address,
            p_user_agent,
            p_device_type,
            p_os,
            p_browser,
            'failed',
            'account_deactivated'
        );
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Account is deactivated'
        );
    END IF;

    -- Step 6: Verify password
    IF v_password_hash IS NULL OR v_password_hash != crypt(p_password, v_password_hash) THEN
        PERFORM udf_login_attempt_record(
            v_user_id,
            p_identifier,
            p_ip_address,
            p_user_agent,
            p_device_type,
            p_os,
            p_browser,
            'failed',
            'invalid_credentials'
        );
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid email/mobile or password'
        );
    END IF;

    -- Step 7 & 8: Check verification status
    v_unverified_channels := '[]'::JSONB;

    IF NOT v_is_email_verified THEN
        v_unverified_channels := v_unverified_channels || jsonb_build_array('email');
    END IF;

    IF NOT v_is_mobile_verified THEN
        v_unverified_channels := v_unverified_channels || jsonb_build_array('mobile');
    END IF;

    -- Step 9: If either channel is unverified, record and return error
    IF v_unverified_channels != '[]'::JSONB THEN
        DECLARE
            v_failure_reason TEXT;
        BEGIN
            IF jsonb_array_length(v_unverified_channels) = 2 THEN
                v_failure_reason := 'both_not_verified';
            ELSIF v_unverified_channels @> '"email"' THEN
                v_failure_reason := 'email_not_verified';
            ELSE
                v_failure_reason := 'mobile_not_verified';
            END IF;

            PERFORM udf_login_attempt_record(
                v_user_id,
                p_identifier,
                p_ip_address,
                p_user_agent,
                p_device_type,
                p_os,
                p_browser,
                'failed',
                v_failure_reason
            );

            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'Email and/or mobile verification required before login',
                'failure_reason', v_failure_reason,
                'user_id', v_user_id,
                'unverified_channels', v_unverified_channels
            );
        END;
    END IF;

    -- Step 10: All checks passed - record successful attempt
    PERFORM udf_login_attempt_record(
        v_user_id,
        p_identifier,
        p_ip_address,
        p_user_agent,
        p_device_type,
        p_os,
        p_browser,
        'success',
        NULL
    );

    -- Reset failed attempts
    PERFORM udf_login_attempt_reset(p_identifier);

    -- Get role info
    SELECT r.code, r.level
    INTO v_role_code, v_role_level
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = v_user_id
    LIMIT 1;

    -- Create session
    v_session_result := udf_session_create(
        v_user_id,
        p_session_token,
        p_refresh_token,
        p_ip_address,
        p_user_agent,
        p_device_type,
        p_os,
        p_browser,
        p_location,
        CURRENT_TIMESTAMP + INTERVAL '24 hours'
    );

    IF (v_session_result->>'success')::BOOLEAN THEN
        v_session_id := (v_session_result->>'id')::BIGINT;
    ELSE
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Login successful but session creation failed: ' || (v_session_result->>'message')
        );
    END IF;

    -- Step 11: Return success with session info
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Login successful',
        'user_id', v_user_id,
        'session_id', v_session_id,
        'first_name', v_first_name,
        'last_name', v_last_name,
        'email', v_user_email,
        'mobile', v_user_mobile,
        'role_code', v_role_code,
        'role_level', v_role_level
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error during login: ' || SQLERRM
    );
END;
$$;

-- Testing queries (commented out)
/*
SELECT udf_auth_login(
    'user@example.com',
    'correctpassword',
    'session_token_abc123',
    'refresh_token_xyz789',
    '192.168.1.100'::INET,
    'Mozilla/5.0...',
    'mobile',
    'iOS',
    'Safari'
);

SELECT udf_auth_login(
    'user@example.com',
    'wrongpassword',
    'session_token_abc123'
);
*/
