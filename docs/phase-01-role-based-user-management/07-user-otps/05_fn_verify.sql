-- ============================================================================
-- udf_otp_verify() - OTP Verification Function
-- ============================================================================
-- Purpose: Verify user-submitted OTP against stored hash. Tracks attempts,
--          marks as exhausted if max attempts reached, marks as verified
--          on success.
--
-- Depends: user_otps table
--
-- Usage: SELECT * FROM udf_otp_verify(
--          p_id := 123,
--          p_otp_code := '123456'
--        );
--
-- Returns: JSONB with {success, message, purpose, channel}
--          - success: boolean (true if OTP verified)
--          - message: error/success description
--          - purpose: otp_purpose enum (returned so caller knows what was verified)
--          - channel: otp_channel enum (returned so caller knows delivery method)
--
-- Business Rules:
--  - OTP record must exist with status = 'pending'
--  - OTP must not be expired (expires_at > CURRENT_TIMESTAMP)
--  - attempts_count must be < max_attempts
--  - Verify: hash matches crypt(input_otp, stored_hash)
--  - On wrong attempt: increment attempts_count
--  - If attempts_count >= max_attempts after increment: set status = 'exhausted'
--  - On correct OTP: set status = 'verified', verified_at = CURRENT_TIMESTAMP
--  - Max 5 wrong attempts per OTP before becoming exhausted
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_otp_verify(
    p_id BIGINT,
    p_otp_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stored_hash TEXT;
    v_status otp_status;
    v_expires_at TIMESTAMPTZ;
    v_attempts_count SMALLINT;
    v_max_attempts SMALLINT;
    v_purpose otp_purpose;
    v_channel otp_channel;
    v_is_expired BOOLEAN;
    v_is_valid BOOLEAN;
BEGIN
    -- Retrieve OTP record
    SELECT
        otp_hash,
        status,
        expires_at,
        attempts_count,
        max_attempts,
        purpose,
        channel
    INTO
        v_stored_hash,
        v_status,
        v_expires_at,
        v_attempts_count,
        v_max_attempts,
        v_purpose,
        v_channel
    FROM user_otps
    WHERE id = p_id
    LIMIT 1;

    -- Check OTP exists
    IF v_stored_hash IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'OTP record not found',
            'purpose', NULL,
            'channel', NULL
        );
    END IF;

    -- Check status is pending
    IF v_status != 'pending' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'OTP is no longer valid. Status: ' || v_status::TEXT,
            'purpose', v_purpose::TEXT,
            'channel', v_channel::TEXT
        );
    END IF;

    -- Check expiration
    v_is_expired := (v_expires_at < CURRENT_TIMESTAMP);
    IF v_is_expired THEN
        -- Mark as expired
        UPDATE user_otps
        SET status = 'expired'
        WHERE id = p_id;

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'OTP has expired',
            'purpose', v_purpose::TEXT,
            'channel', v_channel::TEXT
        );
    END IF;

    -- Check attempts not exhausted
    IF v_attempts_count >= v_max_attempts THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Maximum verification attempts exceeded. OTP is now exhausted.',
            'purpose', v_purpose::TEXT,
            'channel', v_channel::TEXT
        );
    END IF;

    -- Verify OTP: compare bcrypt hash
    v_is_valid := (v_stored_hash = crypt(p_otp_code, v_stored_hash));

    IF v_is_valid THEN
        -- Correct OTP: mark as verified
        UPDATE user_otps
        SET
            status = 'verified',
            verified_at = CURRENT_TIMESTAMP,
            used_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'OTP verified successfully',
            'purpose', v_purpose::TEXT,
            'channel', v_channel::TEXT
        );
    ELSE
        -- Wrong OTP: increment attempts and check if now exhausted
        UPDATE user_otps
        SET
            attempts_count = attempts_count + 1,
            status = CASE
                WHEN (attempts_count + 1) >= max_attempts THEN 'exhausted'::otp_status
                ELSE 'pending'::otp_status
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_id;

        -- Retrieve updated count for response
        SELECT attempts_count, max_attempts
        INTO v_attempts_count, v_max_attempts
        FROM user_otps
        WHERE id = p_id;

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid OTP. Attempts remaining: ' || (v_max_attempts - v_attempts_count),
            'purpose', v_purpose::TEXT,
            'channel', v_channel::TEXT
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error verifying OTP: ' || SQLERRM,
        'purpose', NULL,
        'channel', NULL
    );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================
/*

-- Assume we have an OTP record with id=1 and otp_code='123456'
-- First, generate an OTP and capture the plain text code
WITH otp_gen AS (
    SELECT (udf_otp_generate(1, 'registration'::otp_purpose, 'email'::otp_channel, 'user@example.com'))
)
SELECT * FROM otp_gen;

-- Extract the ID and code from generation result (manual for testing)
-- Let's say ID=100, OTP='654321'

-- Test: Verify with correct OTP
SELECT udf_otp_verify(100, '654321');

-- Test: Verify with wrong OTP (increments attempts)
SELECT udf_otp_verify(100, '000000');

-- Check attempts incremented
SELECT id, status, attempts_count, max_attempts
FROM user_otps
WHERE id = 100;

-- Test: Multiple wrong attempts until exhausted
-- SELECT udf_otp_verify(100, 'wrong1');
-- SELECT udf_otp_verify(100, 'wrong2');
-- SELECT udf_otp_verify(100, 'wrong3');
-- SELECT udf_otp_verify(100, 'wrong4');
-- Last call should mark as exhausted

-- Verify final status
SELECT id, status, attempts_count FROM user_otps WHERE id = 100;

-- Test: Verify expired OTP (insert one with past expires_at)
INSERT INTO user_otps (
    user_id, purpose, channel, destination, otp_hash, status, expires_at, created_at, updated_at
) VALUES (
    1, 'registration', 'email', 'test@example.com',
    crypt('000000', gen_salt('bf')),
    'pending',
    CURRENT_TIMESTAMP - INTERVAL '1 minute',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
RETURNING id;
-- SELECT udf_otp_verify(<returned_id>, '000000');
-- Should return 'OTP has expired'

-- Test: Non-existent OTP
SELECT udf_otp_verify(999999, '123456');

*/
