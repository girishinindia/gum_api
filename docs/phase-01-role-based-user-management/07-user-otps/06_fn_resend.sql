-- ============================================================================
-- udf_otp_resend() - OTP Resend Function
-- ============================================================================
-- Purpose: Allow user to request a new OTP for an unverified purpose.
--          Enforces resend timing (3 min between resends, max 3 resends).
--          After max resends reached, triggers 30-minute cooldown.
--
-- Depends: user_otps table
--
-- Usage: SELECT * FROM udf_otp_resend(
--          p_user_id := 123,
--          p_purpose := 'registration',
--          p_channel := 'email',
--          p_destination := 'user@example.com'
--        );
--
-- Returns: JSONB with {success, message, id, otp_code}
--          - success: boolean (true if new OTP resent, false on error)
--          - message: error/success description
--          - id: new OTP record ID
--          - otp_code: plain text OTP to send (only on success)
--
-- Business Rules:
--  - Find latest pending OTP for user+purpose+channel
--  - Check resend_available_at <= CURRENT_TIMESTAMP
--    (if not, error with wait time in minutes)
--  - Check resend_count < max_resend (max 3 resends)
--  - If resend_count + 1 == max_resend: set cooldown_until on old record
--    to CURRENT_TIMESTAMP + 30 minutes
--  - Invalidate old OTP record (status = 'invalidated')
--  - Generate new OTP using same logic as udf_otp_generate
--  - Copy resend_count + 1 to new record
--  - Set resend_available_at to CURRENT_TIMESTAMP + 3 minutes on new record
--  - Return plain OTP code for app to send
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_otp_resend(
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
    v_old_otp_id BIGINT;
    v_old_resend_count SMALLINT;
    v_old_max_resend SMALLINT;
    v_resend_available_at TIMESTAMPTZ;
    v_wait_minutes INTEGER;
    v_otp_code TEXT;
    v_otp_hash TEXT;
    v_new_id BIGINT;
BEGIN
    -- Find latest pending OTP for user+purpose+channel
    SELECT id, resend_count, max_resend, resend_available_at
    INTO v_old_otp_id, v_old_resend_count, v_old_max_resend, v_resend_available_at
    FROM user_otps
    WHERE user_id = p_user_id
      AND purpose = p_purpose
      AND channel = p_channel
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Check OTP exists
    IF v_old_otp_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'No pending OTP found for this user, purpose, and channel',
            'id', NULL,
            'otp_code', NULL
        );
    END IF;

    -- Check resend timing: must wait until resend_available_at
    IF v_resend_available_at > CURRENT_TIMESTAMP THEN
        v_wait_minutes := CEIL(EXTRACT(EPOCH FROM (v_resend_available_at - CURRENT_TIMESTAMP)) / 60)::INTEGER;
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Cannot resend yet. Please wait ' || v_wait_minutes || ' minutes.',
            'id', NULL,
            'otp_code', NULL
        );
    END IF;

    -- Check resend count not at max
    IF v_old_resend_count >= v_old_max_resend THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Maximum resend attempts exceeded. Please try again after 30 minutes.',
            'id', NULL,
            'otp_code', NULL
        );
    END IF;

    -- If this will be the final resend, set cooldown on old record
    IF (v_old_resend_count + 1) >= v_old_max_resend THEN
        UPDATE user_otps
        SET
            cooldown_until = CURRENT_TIMESTAMP + INTERVAL '30 minutes',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_old_otp_id;
    END IF;

    -- Invalidate old OTP
    UPDATE user_otps
    SET
        status = 'invalidated',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_old_otp_id;

    -- Generate new 6-digit OTP
    v_otp_code := LPAD(FLOOR(random() * 1000000)::TEXT, 6, '0');

    -- Hash with bcrypt
    v_otp_hash := crypt(v_otp_code, gen_salt('bf'));

    -- Insert new OTP record with incremented resend_count
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
        cooldown_until,
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
        v_old_resend_count + 1,
        v_old_max_resend,
        CASE WHEN (v_old_resend_count + 1) >= v_old_max_resend
            THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
            ELSE NULL
        END,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_new_id;

    -- Return success with new plain OTP
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'New OTP generated and resent successfully. Valid for 10 minutes.',
        'id', v_new_id,
        'otp_code', v_otp_code
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error resending OTP: ' || SQLERRM,
        'id', NULL,
        'otp_code', NULL
    );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================
/*

-- Setup: Generate initial OTP
WITH otp_gen AS (
    SELECT (udf_otp_generate(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com'))::jsonb AS result
)
SELECT result->>'otp_code' as otp_code, result->>'id' as otp_id FROM otp_gen;

-- Assuming OTP record ID=100 was just created

-- Test: Try to resend immediately (should fail - 3 min cooldown)
SELECT udf_otp_resend(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com');
-- Should return: "Cannot resend yet. Please wait X minutes."

-- Test: Simulate resend availability by updating resend_available_at
UPDATE user_otps SET resend_available_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = 100;

-- Test: First resend (resend_count goes 0 -> 1)
SELECT udf_otp_resend(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com');

-- Verify old OTP is invalidated, new one created
SELECT id, resend_count, status FROM user_otps WHERE user_id = 1 ORDER BY created_at DESC LIMIT 2;

-- Test: Second resend (resend_count goes 1 -> 2)
UPDATE user_otps SET resend_available_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
WHERE id IN (SELECT id FROM user_otps WHERE user_id = 1 ORDER BY created_at DESC LIMIT 1);
SELECT udf_otp_resend(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com');

-- Test: Third resend (resend_count goes 2 -> 3, hits max, triggers 30-min cooldown)
UPDATE user_otps SET resend_available_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
WHERE id IN (SELECT id FROM user_otps WHERE user_id = 1 ORDER BY created_at DESC LIMIT 1);
SELECT udf_otp_resend(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com');

-- Verify cooldown_until is set on old record
SELECT id, resend_count, cooldown_until FROM user_otps WHERE user_id = 1 AND status = 'invalidated' ORDER BY created_at DESC LIMIT 1;

-- Test: Try to generate new OTP now (should hit 30-min cooldown from udf_otp_generate)
SELECT udf_otp_generate(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com');
-- Should return cooldown error

-- Test: Resend attempt after max resends hit
SELECT udf_otp_resend(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com');
-- Should return "Maximum resend attempts exceeded"

*/
