/*
 * User Contact Change Requests - Initiate Function
 * Purpose: Initiate a new contact change request (email or mobile)
 * Depends: users table, user_contact_change_requests table
 * Usage: SELECT udf_contact_change_initiate(user_id, 'email', 'newemail@example.com')
 *        App layer then calls udf_otp_generate to send OTP to new_value
 */

-- ============================================================================
-- FUNCTION: udf_contact_change_initiate
-- ============================================================================
-- Initiates a new contact change request with full validation.
-- Returns JSON with {success, message, id} pattern.
-- RETURNS JSONB with SECURITY DEFINER and search_path set.

CREATE OR REPLACE FUNCTION udf_contact_change_initiate(
    p_user_id BIGINT,
    p_change_type contact_change_type,
    p_new_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user RECORD;
    v_old_value TEXT;
    v_request_id BIGINT;
    v_response JSONB;
BEGIN
    -- Validate user exists and is active
    SELECT id, is_active, deleted_at
    INTO v_user
    FROM users
    WHERE id = p_user_id;

    IF v_user IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User not found'
        );
    END IF;

    IF NOT v_user.is_active THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User account is not active'
        );
    END IF;

    IF v_user.deleted_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User account is deleted'
        );
    END IF;

    -- Validate new_value is not empty
    IF p_new_value IS NULL OR TRIM(p_new_value) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'New value cannot be empty'
        );
    END IF;

    -- Get old value from users table based on change_type
    IF p_change_type = 'email' THEN
        SELECT email INTO v_old_value FROM users WHERE id = p_user_id;
    ELSIF p_change_type = 'mobile' THEN
        SELECT mobile INTO v_old_value FROM users WHERE id = p_user_id;
    ELSE
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid change type'
        );
    END IF;

    -- Check that new_value is different from old_value
    IF v_old_value = p_new_value THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'New value must be different from current value'
        );
    END IF;

    -- Check that new_value doesn't already exist in users table
    -- This check includes soft-deleted users (deleted_at IS NOT NULL)
    -- because email/mobile UNIQUE constraints apply to all rows in the database
    IF p_change_type = 'email' THEN
        IF EXISTS (SELECT 1 FROM users WHERE LOWER(email) = LOWER(p_new_value) AND id != p_user_id) THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'Email address is already in use'
            );
        END IF;
    ELSIF p_change_type = 'mobile' THEN
        IF EXISTS (SELECT 1 FROM users WHERE mobile = p_new_value AND id != p_user_id) THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'Mobile number is already in use'
            );
        END IF;
    END IF;

    -- Invalidate any previous pending request for same user+change_type
    UPDATE user_contact_change_requests
    SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id
        AND change_type = p_change_type
        AND status IN ('pending', 'verified');

    -- Insert new request
    INSERT INTO user_contact_change_requests (
        user_id,
        change_type,
        old_value,
        new_value,
        status,
        expires_at,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_change_type,
        v_old_value,
        p_new_value,
        'pending',
        CURRENT_TIMESTAMP + INTERVAL '24 hours',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_request_id;

    -- Return success response with request ID
    v_response := jsonb_build_object(
        'success', TRUE,
        'message', 'Contact change request initiated. OTP sent to ' || p_new_value,
        'id', v_request_id,
        'change_type', p_change_type,
        'new_value', p_new_value
    );

    RETURN v_response;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error initiating contact change: ' || SQLERRM
    );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*

-- Initiate email change for user 1
SELECT udf_contact_change_initiate(1, 'email', 'newemail@example.com');

-- Initiate mobile change for user 1
SELECT udf_contact_change_initiate(1, 'mobile', '+1234567890');

-- Try to initiate with non-existent user
SELECT udf_contact_change_initiate(99999, 'email', 'test@example.com');

-- Try to initiate with same value (should fail)
SELECT udf_contact_change_initiate(1, 'email', (SELECT email FROM users WHERE id = 1));

-- Verify request was created
SELECT * FROM user_contact_change_requests WHERE user_id = 1 ORDER BY created_at DESC LIMIT 1;

-- Test that previous pending requests are cancelled
SELECT status, cancelled_at FROM user_contact_change_requests WHERE user_id = 1 AND change_type = 'email' ORDER BY created_at DESC;

*/
