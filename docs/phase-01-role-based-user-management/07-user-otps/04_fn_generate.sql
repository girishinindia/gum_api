-- ============================================================================
-- udf_otp_generate() - OTP Generation Function
-- ============================================================================
-- Purpose: Generate and store a new OTP for a user. Handles cooldown checks,
--          previous OTP invalidation, bcrypt hashing, and returns plain OTP
--          for app to send via email/SMS.
--
-- Depends: users table, user_otps table
--
-- Usage: SELECT * FROM udf_otp_generate(
--          p_user_id := 123,
--          p_purpose := 'registration',
--          p_channel := 'email',
--          p_destination := 'user@example.com'
--        );
--
-- Returns: JSONB with {success, message, id, otp_code}
--          - success: boolean (true if OTP generated, false on error)
--          - message: error/success description
--          - id: generated OTP record ID (null on error)
--          - otp_code: plain text OTP to send via email/SMS (only in success case)
--
-- Business Rules:
--  - Check user exists and is active
--  - Check cooldown: if any pending OTP for user+purpose has cooldown_until > NOW,
--    raise exception with remaining minutes
--  - Invalidate any existing pending OTP for same user+purpose+channel
--  - Generate 6-digit random OTP
--  - Store bcrypt hash only
--  - Set expiry to 10 minutes from now
--  - Set resend_available_at to 3 minutes from now
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_otp_generate(
    p_user_id BIGINT,
    p_purpose otp_purpose,
    p_channel otp_channel,
    p_destination TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_otp_code TEXT;
    v_otp_hash TEXT;
    v_new_id BIGINT;
    v_cooldown_remaining INTEGER;
    v_user_exists BOOLEAN;
    v_user_active BOOLEAN;
BEGIN
    -- Check user exists
    SELECT EXISTS(SELECT 1 FROM users WHERE id = p_user_id AND is_deleted = FALSE)
    INTO v_user_exists;

    IF NOT v_user_exists THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User not found or has been deleted',
            'id', NULL,
            'otp_code', NULL
        );
    END IF;

    -- Check user is active
    SELECT is_active
    INTO v_user_active
    FROM users
    WHERE id = p_user_id AND is_deleted = FALSE;

    IF NOT v_user_active THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User account is not active',
            'id', NULL,
            'otp_code', NULL
        );
    END IF;

    -- Check cooldown: if any pending OTP for this user+purpose has cooldown_until > NOW
    SELECT CEIL(EXTRACT(EPOCH FROM (cooldown_until - CURRENT_TIMESTAMP)) / 60)::INTEGER
    INTO v_cooldown_remaining
    FROM user_otps
    WHERE user_id = p_user_id
      AND purpose = p_purpose
      AND status = 'pending'
      AND cooldown_until > CURRENT_TIMESTAMP
    LIMIT 1;

    IF v_cooldown_remaining IS NOT NULL AND v_cooldown_remaining > 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'OTP request cooldown active. Please wait ' || v_cooldown_remaining || ' minutes.',
            'id', NULL,
            'otp_code', NULL
        );
    END IF;

    -- Invalidate any existing pending OTP for same user+purpose+channel
    UPDATE user_otps
    SET status = 'invalidated'
    WHERE user_id = p_user_id
      AND purpose = p_purpose
      AND channel = p_channel
      AND status = 'pending';

    -- Generate 6-digit random OTP
    v_otp_code := LPAD(FLOOR(random() * 1000000)::TEXT, 6, '0');

    -- Hash OTP with bcrypt (cost factor 10 is default for 'bf' method)
    v_otp_hash := crypt(v_otp_code, gen_salt('bf'));

    -- Insert new OTP record
    INSERT INTO user_otps (
        user_id,
        purpose,
        channel,
        destination,
        otp_hash,
        status,
        expires_at,
        resend_available_at,
        attempts_count,
        max_attempts,
        resend_count,
        max_resend,
        created_at,
        updated_at
    )
    VALUES (
        p_user_id,
        p_purpose,
        p_channel,
        p_destination,
        v_otp_hash,
        'pending',
        CURRENT_TIMESTAMP + INTERVAL '10 minutes',
        CURRENT_TIMESTAMP + INTERVAL '3 minutes',
        0,
        5,
        0,
        3,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_new_id;

    -- Return success with plain OTP for app to send
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'OTP generated successfully. Valid for 10 minutes.',
        'id', v_new_id,
        'otp_code', v_otp_code
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error generating OTP: ' || SQLERRM,
        'id', NULL,
        'otp_code', NULL
    );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================
/*

-- Generate OTP for registration (assumes user with id=1 exists)
SELECT udf_otp_generate(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com');

-- Generate OTP for password reset
SELECT udf_otp_generate(1, 'forgot_password'::otp_purpose, 'mobile'::otp_channel, '+1234567890');

-- Test cooldown: generate second OTP immediately (should hit cooldown if previous exists)
-- SELECT udf_otp_generate(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com');

-- Verify OTP record was created
SELECT id, user_id, purpose, channel, destination, status, expires_at, resend_available_at, attempts_count, resend_count
FROM user_otps
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 1;

-- Verify hash is bcrypt (should start with $2a$ or similar)
SELECT id, LEFT(otp_hash, 10) as hash_prefix
FROM user_otps
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 1;

-- Test with non-existent user
SELECT udf_otp_generate(99999, 'registration'::otp_purpose, 'email'::otp_channel, 'test@example.com');

*/
