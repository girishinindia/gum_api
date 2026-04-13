/**
 * Purpose: Logout user by revoking session(s)
 * Two functions: logout single session, or logout all sessions with exception
 * Depends: udf_session_revoke() (for single), udf_session_revoke_all() (for all)
 * Usage: SELECT udf_auth_logout(123);
 *        SELECT udf_auth_logout_all(456, 789);
 */

-- Function 1: Logout specific session
CREATE OR REPLACE FUNCTION udf_auth_logout(p_session_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_revoke_result JSONB;
BEGIN
    -- Revoke the specific session
    -- Note: Assuming there's a udf_session_revoke function
    -- If only udf_session_revoke_all exists, adapt accordingly
    -- For now, we'll update the session directly

    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP,
        is_revoked = TRUE
    WHERE id = p_session_id
      AND revoked_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Session not found or already revoked'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Session revoked successfully'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error revoking session: ' || SQLERRM
    );
END;
$$;

-- Function 2: Logout all sessions for a user with optional exception
CREATE OR REPLACE FUNCTION udf_auth_logout_all(
    p_user_id BIGINT,
    p_except_session_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_revoke_result JSONB;
    v_count INT;
BEGIN
    -- Call the existing udf_session_revoke_all function
    v_revoke_result := udf_session_revoke_all(p_user_id, p_except_session_id);

    IF (v_revoke_result->>'success')::BOOLEAN THEN
        v_count := (v_revoke_result->>'count')::INT;
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'All sessions revoked successfully',
            'count', v_count
        );
    ELSE
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', v_revoke_result->>'message',
            'count', 0
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error revoking sessions: ' || SQLERRM,
        'count', 0
    );
END;
$$;

-- Testing queries (commented out)
/*
SELECT udf_auth_logout(1);

SELECT udf_auth_logout_all(5);

SELECT udf_auth_logout_all(5, 123);
*/
