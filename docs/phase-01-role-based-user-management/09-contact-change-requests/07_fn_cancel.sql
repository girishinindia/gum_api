/*
 * User Contact Change Requests - Cancel Function
 * Purpose: Cancel a pending or verified contact change request
 * Depends: user_contact_change_requests table
 * Usage: SELECT udf_contact_change_cancel(request_id)
 *        Call this when user wants to cancel a change request
 */

-- ============================================================================
-- FUNCTION: udf_contact_change_cancel
-- ============================================================================
-- Cancels a pending or verified contact change request.
-- Sets status to 'cancelled' and records cancellation timestamp.
-- Returns JSON with {success, message} pattern.
-- RETURNS JSONB with SECURITY DEFINER and search_path set.

CREATE OR REPLACE FUNCTION udf_contact_change_cancel(
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
    SELECT id, user_id, change_type, status
    INTO v_request
    FROM user_contact_change_requests
    WHERE id = p_id;

    IF v_request IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Contact change request not found'
        );
    END IF;

    -- Check that status is either 'pending' or 'verified'
    -- Cannot cancel completed, expired, or already cancelled requests
    IF v_request.status NOT IN ('pending', 'verified') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Contact change request cannot be cancelled. Current status: ' || v_request.status
        );
    END IF;

    -- Mark request as cancelled
    UPDATE user_contact_change_requests
    SET status = 'cancelled',
        cancelled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    -- Build and return success response
    v_response := jsonb_build_object(
        'success', TRUE,
        'message', 'Contact change request has been cancelled',
        'id', v_request.id,
        'user_id', v_request.user_id,
        'change_type', v_request.change_type
    );

    RETURN v_response;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error cancelling contact change: ' || SQLERRM
    );
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*

-- Cancel a pending request
-- (assuming request_id = 1 exists with status = 'pending')
SELECT udf_contact_change_cancel(1);

-- Try to cancel non-existent request
SELECT udf_contact_change_cancel(99999);

-- Check request status after cancellation
SELECT id, status, cancelled_at, updated_at FROM user_contact_change_requests WHERE id = 1;

-- Try to cancel already cancelled request (should fail)
-- First cancel it
SELECT udf_contact_change_cancel(1);
-- Then try again
SELECT udf_contact_change_cancel(1);

-- Try to cancel completed request (should fail)
-- (would need a completed request)

-- Try to cancel expired request (should fail)
-- (would need an expired request)

-- Cancel a verified request (should succeed)
-- (would need a verified request)

*/
