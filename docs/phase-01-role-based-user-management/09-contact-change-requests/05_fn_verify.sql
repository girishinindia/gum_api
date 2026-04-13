/*
 * User Contact Change Requests - Verify Function
 * Purpose: Mark a contact change request as verified after OTP verification
 * Depends: user_contact_change_requests table
 * Usage: SELECT udf_contact_change_verify(request_id)
 *        Call this after OTP verification succeeds
 *        This does NOT update the users table (that happens in complete)
 */

-- ============================================================================
-- FUNCTION: udf_contact_change_verify
-- ============================================================================
-- Marks a contact change request as verified.
-- Sets status to 'verified' and records verification timestamp.
-- Returns JSON with {success, message, change_type, new_value} pattern.
-- RETURNS JSONB with SECURITY DEFINER and search_path set.

CREATE OR REPLACE FUNCTION udf_contact_change_verify(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_response JSONB;
BEGIN
    -- Check that request exists
    SELECT id, user_id, change_type, status, new_value, expires_at
    INTO v_request
    FROM user_contact_change_requests
    WHERE id = p_id;

    IF v_request IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Contact change request not found'
        );
    END IF;

    -- Check that status is 'pending'
    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Contact change request cannot be verified. Current status: ' || v_request.status
        );
    END IF;

    -- Check that request has not expired
    IF CURRENT_TIMESTAMP > v_request.expires_at THEN
        -- Mark as expired
        UPDATE user_contact_change_requests
        SET status = 'expired'
        WHERE id = p_id;

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Contact change request has expired'
        );
    END IF;

    -- Update request status to 'verified' and set verified_at
    UPDATE user_contact_change_requests
    SET status = 'verified',
        verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    -- Build and return success response
    v_response := jsonb_build_object(
        'success', TRUE,
        'message', 'Contact change request verified successfully',
        'id', v_request.id,
        'user_id', v_request.user_id,
        'change_type', v_request.change_type,
        'new_value', v_request.new_value
    );

    RETURN v_response;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error verifying contact change: ' || SQLERRM
    );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*

-- Verify a pending request
-- (assuming request_id = 1 exists with status = 'pending')
SELECT udf_contact_change_verify(1);

-- Try to verify non-existent request
SELECT udf_contact_change_verify(99999);

-- Check request status after verification
SELECT id, status, verified_at, updated_at FROM user_contact_change_requests WHERE id = 1;

-- Try to verify already verified request (should fail)
-- First verify it
SELECT udf_contact_change_verify(1);
-- Then try again
SELECT udf_contact_change_verify(1);

-- Try to verify expired request
-- (would need to manually create an expired request or wait for time to pass)

*/
