/**
 * Purpose: Register a new user (student or instructor) with email and/or mobile verification
 * Depends: users table, roles table, udf_otp_generate()
 * Usage: SELECT udf_auth_register('John', 'Doe', 'john@example.com', '+1234567890', 'password123', 'student', 1);
 */

-- NOTE on parameter order:
--   p_password is logically required, but keeps DEFAULT NULL here because
--   PostgreSQL requires every parameter after a defaulted one to also have
--   a default, and we must preserve the existing positional-call contract
--   (first_name, last_name, email, mobile, password, role_code, country_id)
--   used by all existing callers. NULL / empty p_password is caught by the
--   runtime validation below.
CREATE OR REPLACE FUNCTION udf_auth_register(
    p_first_name TEXT,
    p_last_name TEXT,
    p_email CITEXT DEFAULT NULL,
    p_mobile TEXT DEFAULT NULL,
    p_password TEXT DEFAULT NULL,
    p_role_code TEXT DEFAULT 'student',
    p_country_id BIGINT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id BIGINT;
    v_user_id BIGINT;
    v_password_hash TEXT;
    v_email_otp_result JSONB;
    v_email_otp_id BIGINT;
    v_email_otp_code TEXT;
    v_mobile_otp_result JSONB;
    v_mobile_otp_id BIGINT;
    v_mobile_otp_code TEXT;
    v_phone_code TEXT;
    v_mobile_destination TEXT;
BEGIN
    -- Validation: at least one of email or mobile required
    IF (p_email IS NULL OR p_email = '') AND (p_mobile IS NULL OR p_mobile = '') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'At least one of email or mobile is required'
        );
    END IF;

    -- Validation: password is required
    IF p_password IS NULL OR p_password = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Password is required'
        );
    END IF;

    -- Validation: only 'student' and 'instructor' roles allowed for self-registration
    IF LOWER(TRIM(p_role_code)) NOT IN ('student', 'instructor') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid role. Only student and instructor roles are allowed for registration'
        );
    END IF;

    -- Look up role_id by code
    SELECT id INTO v_role_id
    FROM roles
    WHERE code = LOWER(TRIM(p_role_code))
      AND is_active = TRUE
      AND is_deleted = FALSE
    LIMIT 1;

    IF v_role_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid or inactive role: ' || p_role_code
        );
    END IF;

    -- Check email not already in users (UNIQUE constraint exists)
    IF p_email IS NOT NULL AND TRIM(p_email) != '' THEN
        IF EXISTS(SELECT 1 FROM users WHERE email = p_email) THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'Email address is already registered'
            );
        END IF;
    END IF;

    -- Check mobile not already in users
    IF p_mobile IS NOT NULL AND TRIM(p_mobile) != '' THEN
        IF EXISTS(SELECT 1 FROM users WHERE mobile = p_mobile) THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'Mobile number is already registered'
            );
        END IF;
    END IF;

    -- Hash password with bcrypt
    v_password_hash := crypt(p_password, gen_salt('bf'));

    -- Insert new user
    INSERT INTO users (
        first_name,
        last_name,
        email,
        mobile,
        password,
        role_id,
        country_id,
        is_active,
        is_deleted,
        is_email_verified,
        is_mobile_verified,
        created_at
    ) VALUES (
        TRIM(p_first_name),
        TRIM(p_last_name),
        CASE WHEN p_email IS NOT NULL AND TRIM(p_email) != '' THEN TRIM(LOWER(p_email)) ELSE NULL END,
        CASE WHEN p_mobile IS NOT NULL AND TRIM(p_mobile) != '' THEN TRIM(p_mobile) ELSE NULL END,
        v_password_hash,
        v_role_id,
        p_country_id,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_user_id;

    -- Generate email OTP if email provided
    IF p_email IS NOT NULL AND TRIM(p_email) != '' THEN
        v_email_otp_result := udf_otp_generate(
            v_user_id,
            'registration',
            'email',
            TRIM(LOWER(p_email))
        );

        IF (v_email_otp_result->>'success')::BOOLEAN THEN
            v_email_otp_id := (v_email_otp_result->>'id')::BIGINT;
            v_email_otp_code := v_email_otp_result->>'otp_code';
        ELSE
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'User created but failed to generate email OTP: ' || (v_email_otp_result->>'message')
            );
        END IF;
    END IF;

    -- Generate mobile OTP if mobile provided. The destination
    -- column should be E.164 (e.g. "+919662278990") so the SMS
    -- gateway receives a fully-qualified number. We look up the
    -- country phone_code for the user we just inserted and prefix
    -- it onto the bare mobile.
    IF p_mobile IS NOT NULL AND TRIM(p_mobile) != '' THEN
        SELECT phone_code INTO v_phone_code
        FROM countries
        WHERE id = p_country_id
        LIMIT 1;

        v_mobile_destination := udf_format_mobile_e164(v_phone_code, p_mobile);

        v_mobile_otp_result := udf_otp_generate(
            v_user_id,
            'registration',
            'mobile',
            v_mobile_destination
        );

        IF (v_mobile_otp_result->>'success')::BOOLEAN THEN
            v_mobile_otp_id := (v_mobile_otp_result->>'id')::BIGINT;
            v_mobile_otp_code := v_mobile_otp_result->>'otp_code';
        ELSE
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'User created but failed to generate mobile OTP: ' || (v_mobile_otp_result->>'message')
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'User registered successfully',
        'id', v_user_id,
        'email_otp_id', v_email_otp_id,
        'email_otp', v_email_otp_code,
        'mobile_otp_id', v_mobile_otp_id,
        'mobile_otp', v_mobile_otp_code
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Email or mobile already registered'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Error during registration: ' || SQLERRM
        );
END;
$$;

-- Testing queries (commented out)
/*
SELECT udf_auth_register(
    'Jane',
    'Smith',
    'jane.smith@example.com',
    '+14155552671',
    'SecurePassword123',
    'student',
    1
);

SELECT udf_auth_register(
    'John',
    'Instructor',
    'john.inst@example.com',
    NULL,
    'SecurePassword456',
    'instructor',
    1
);
*/
