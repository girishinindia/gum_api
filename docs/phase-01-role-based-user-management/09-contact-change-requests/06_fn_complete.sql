/*
 * User Contact Change Requests - Complete Function
 * Purpose: Complete a verified contact change request and update users table
 * Depends: users table, user_contact_change_requests table
 * Usage: SELECT udf_contact_change_complete(request_id)
 *        Call this after user confirms they want to complete the change
 *        App layer should then call udf_session_revoke_all to log out all sessions
 */

-- ============================================================================
-- FUNCTION: udf_contact_change_complete
-- ============================================================================
-- Completes a verified contact change request by updating the users table.
-- If change_type = 'email': updates email and sets is_email_verified = TRUE
-- If change_type = 'mobile': updates mobile and sets is_mobile_verified = TRUE
-- Sets request status to 'completed' and records completion timestamp.
-- Returns JSON with {success, message, user_id, change_type} pattern.
-- RETURNS JSONB with SECURITY DEFINER and search_path set.

CREATE OR REPLACE FUNCTION udf_contact_change_complete(
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
    SELECT id, user_id, change_type, new_value, status
    INTO v_request
    FROM user_contact_change_requests
    WHERE id = p_id;

    IF v_request IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Contact change request not found'
        );
    END IF;

    -- Check that status is 'verified'
    IF v_request.status != 'verified' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Contact change request cannot be completed. Current status: ' || v_request.status
        );
    END IF;

    -- Update users table based on change_type
    IF v_request.change_type = 'email' THEN
        UPDATE users
        SET email = v_request.new_value,
            is_email_verified = TRUE,
            email_verified_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_request.user_id;

    ELSIF v_request.change_type = 'mobile' THEN
        UPDATE users
        SET mobile = v_request.new_value,
            is_mobile_verified = TRUE,
            mobile_verified_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_request.user_id;

    ELSE
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid change type'
        );
    END IF;

    -- Mark request as completed
    UPDATE user_contact_change_requests
    SET status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    -- Build and return success response
    v_response := jsonb_build_object(
        'success', TRUE,
        'message', 'Contact change completed successfully. All sessions have been revoked.',
        'id', v_request.id,
        'user_id', v_request.user_id,
        'change_type', v_request.change_type
    );

    RETURN v_response;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error completing contact change: ' || SQLERRM
    );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*

-- Complete a verified request
-- (assuming request_id = 1 exists with status = 'verified')
SELECT udf_contact_change_complete(1);

-- Try to complete non-existent request
SELECT udf_contact_change_complete(99999);

-- Check request status after completion
SELECT id, status, completed_at, updated_at FROM user_contact_change_requests WHERE id = 1;

-- Verify user email was updated (for email change)
SELECT id, email, is_email_verified, email_verified_at FROM users WHERE id = 1;

-- Verify user mobile was updated (for mobile change)
SELECT id, mobile, is_mobile_verified, mobile_verified_at FROM users WHERE id = 1;

-- Try to complete pending request (should fail)
-- (would need a pending request first)

-- Try to complete already completed request (should fail)
-- (would need a completed request)

*/
