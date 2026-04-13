/**
 * Purpose: Check if a user is active and not deleted
 * Utility function called internally by other auth functions
 * Depends: users table
 * Usage: SELECT udf_check_user_active(p_user_id);
 */

CREATE OR REPLACE FUNCTION udf_check_user_active(p_user_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_active BOOLEAN;
    v_is_deleted BOOLEAN;
    v_exists BOOLEAN;
BEGIN
    -- Check if user exists and get status
    SELECT
        COALESCE(u.is_active, FALSE),
        COALESCE(u.is_deleted, FALSE),
        TRUE
    INTO v_is_active, v_is_deleted, v_exists
    FROM users u
    WHERE u.id = p_user_id
    LIMIT 1;

    -- User does not exist
    IF NOT v_exists THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User does not exist',
            'user_id', p_user_id,
            'is_active', FALSE,
            'is_deleted', FALSE
        );
    END IF;

    -- User is deleted
    IF v_is_deleted THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User account has been deleted',
            'user_id', p_user_id,
            'is_active', v_is_active,
            'is_deleted', TRUE
        );
    END IF;

    -- User is inactive
    IF NOT v_is_active THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User account is deactivated',
            'user_id', p_user_id,
            'is_active', FALSE,
            'is_deleted', FALSE
        );
    END IF;

    -- User is active and not deleted
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'User is active',
        'user_id', p_user_id,
        'is_active', TRUE,
        'is_deleted', FALSE
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error checking user status: ' || SQLERRM,
        'user_id', p_user_id,
        'is_active', FALSE,
        'is_deleted', FALSE
    );
END;
$$;

-- Testing queries (commented out)
/*
SELECT udf_check_user_active(1);
SELECT udf_check_user_active(999);
*/
