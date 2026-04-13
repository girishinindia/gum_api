-- ============================================================================
-- udf_otp_invalidate() - OTP Invalidation Function
-- ============================================================================
-- Purpose: Invalidate pending OTPs for a user (optionally by purpose).
--          Used when user completes verification or initiates a new flow.
--
-- Depends: user_otps table
--
-- Usage: SELECT * FROM udf_otp_invalidate(
--          p_user_id := 123,
--          p_purpose := 'registration'
--        );
--        OR
--        SELECT * FROM udf_otp_invalidate(p_user_id := 123);
--
-- Returns: JSONB with {success, message, count}
--          - success: boolean (always true)
--          - message: description of operation
--          - count: number of OTPs invalidated
--
-- Business Rules:
--  - Invalidate all pending OTPs for user
--  - Optionally filter by purpose (if p_purpose is provided)
--  - Set status = 'invalidated' on matching records
--  - Return count of records updated
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_otp_invalidate(
    p_user_id BIGINT,
    p_purpose otp_purpose DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Invalidate pending OTPs for user (optionally filtered by purpose)
    UPDATE user_otps
    SET
        status = 'invalidated',
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id
      AND status = 'pending'
      AND (p_purpose IS NULL OR purpose = p_purpose);

    -- Get count of records affected
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Successfully invalidated ' || v_count || ' OTP record(s)',
        'count', v_count
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error invalidating OTPs: ' || SQLERRM,
        'count', 0
    );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================
/*

-- Setup: Create multiple pending OTPs for testing
INSERT INTO user_otps (
    user_id, purpose, channel, destination, otp_hash, status, created_at, updated_at
) VALUES
    (1, 'registration', 'email', 'user1@example.com', crypt('111111', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (1, 'forgot_password', 'email', 'user1@example.com', crypt('222222', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (1, 'change_email', 'mobile', '+1234567890', crypt('333333', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING id, purpose, status;

-- Test: Invalidate all pending OTPs for user 1
SELECT udf_otp_invalidate(1);

-- Verify all are invalidated
SELECT id, purpose, status FROM user_otps WHERE user_id = 1 ORDER BY created_at DESC LIMIT 3;

-- Setup: Create new OTPs for purpose filtering test
INSERT INTO user_otps (
    user_id, purpose, channel, destination, otp_hash, status, created_at, updated_at
) VALUES
    (1, 'registration', 'email', 'user1@example.com', crypt('444444', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (1, 'registration', 'mobile', '+1234567890', crypt('555555', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (1, 'forgot_password', 'email', 'user1@example.com', crypt('666666', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING id, purpose, status;

-- Test: Invalidate only registration OTPs for user 1
SELECT udf_otp_invalidate(1, 'registration'::otp_purpose);

-- Verify only registration OTPs are invalidated, forgot_password still pending
SELECT id, purpose, status FROM user_otps WHERE user_id = 1 ORDER BY created_at DESC LIMIT 3;

-- Test: Invalidate for user with no pending OTPs
SELECT udf_otp_invalidate(999);

-- Test: Invalidate specific purpose for user with no matching purpose
SELECT udf_otp_invalidate(1, 'change_mobile'::otp_purpose);

*/
