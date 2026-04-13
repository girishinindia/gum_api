/**
 * Purpose: Complete password reset flow for authenticated user
 * Same as forgot_password_complete but with reason 'self_reset'
 * Updates password, marks verification complete, revokes sessions, invalidates OTPs
 * Depends: users table, udf_password_history_check(), udf_password_history_add(),
 *          udf_session_revoke_all(), udf_otp_invalidate()
 * Usage: SELECT udf_auth_reset_password_complete(5, 'newpassword123');
 */

CREATE OR REPLACE FUNCTION udf_auth_reset_password_complete(
    p_user_id BIGINT,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_active_check JSONB;
    v_password_history_check JSONB;
    v_current_password_hash TEXT;
    v_new_password_hash TEXT;
    v_password_history_add_result JSONB;
    v_session_revoke_result JSONB;
    v_otp_invalidate_result JSONB;
BEGIN
    -- Check user is active and not deleted
    v_user_active_check := udf_check_user_active(p_user_id);

    IF NOT (v_user_active_check->>'success')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', v_user_active_check->>'message'
        );
    END IF;

    -- Check if password is reused (check last 5)
    v_password_history_check := udf_password_history_check(p_user_id, p_new_password, 5);

    IF (v_password_history_check->>'is_reused')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Cannot reuse a recently used password. ' || (v_password_history_check->>'message')
        );
    END IF;

    -- Get current password hash for history
    SELECT password INTO v_current_password_hash
    FROM users
    WHERE id = p_user_id
    LIMIT 1;

    IF v_current_password_hash IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User password not found'
        );
    END IF;

    -- Save current password to history with reason 'self_reset'
    v_password_history_add_result := udf_password_history_add(
        p_user_id,
        v_current_password_hash,
        p_user_id,
        'self_reset'
    );

    IF NOT (v_password_history_add_result->>'success')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Failed to save password history: ' || (v_password_history_add_result->>'message')
        );
    END IF;

    -- Hash new password
    v_new_password_hash := crypt(p_new_password, gen_salt('bf'));

    -- Update password in users table.
    -- (public.users has no password_changed_at column — updated_at
    -- carries the timestamp.)
    UPDATE users
    SET password = v_new_password_hash,
        is_email_verified = TRUE,
        email_verified_at = CURRENT_TIMESTAMP,
        is_mobile_verified = TRUE,
        mobile_verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_user_id;

    -- Revoke all sessions for this user
    v_session_revoke_result := udf_session_revoke_all(p_user_id, NULL);

    IF NOT (v_session_revoke_result->>'success')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Password updated but failed to revoke sessions: ' || (v_session_revoke_result->>'message')
        );
    END IF;

    -- Invalidate reset_password OTPs
    v_otp_invalidate_result := udf_otp_invalidate(p_user_id, 'reset_password');

    IF NOT (v_otp_invalidate_result->>'success')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Password updated but failed to invalidate OTPs: ' || (v_otp_invalidate_result->>'message')
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Password reset successfully. All sessions have been logged out.'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error completing password reset: ' || SQLERRM
    );
END;
$$;

-- Testing queries (commented out)
/*
SELECT udf_auth_reset_password_complete(5, 'NewResetPassword456');

-- Verify password was updated
SELECT id, password FROM users WHERE id = 5 LIMIT 1;

-- Check sessions were revoked
SELECT id, is_revoked FROM sessions WHERE user_id = 5 LIMIT 5;

-- Check password history
SELECT id, user_id, changed_by, change_reason FROM password_history WHERE user_id = 5 LIMIT 5;
*/
