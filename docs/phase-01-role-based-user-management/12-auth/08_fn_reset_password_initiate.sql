/**
 * Purpose: Initiate password reset flow for authenticated user
 * User must be logged in (verified via session) - app layer validates this
 * Generates OTPs for email and mobile channels
 * Depends: users table, udf_otp_generate()
 * Usage: SELECT udf_auth_reset_password_initiate(5);
 */

CREATE OR REPLACE FUNCTION udf_auth_reset_password_initiate(p_user_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_active_check JSONB;
    v_user_email CITEXT;
    v_user_mobile TEXT;
    v_phone_code TEXT;
    v_mobile_destination TEXT;
    v_email_otp_result JSONB;
    v_email_otp_id BIGINT;
    v_email_otp_code TEXT;
    v_mobile_otp_result JSONB;
    v_mobile_otp_id BIGINT;
    v_mobile_otp_code TEXT;
BEGIN
    -- Check user is active and not deleted
    v_user_active_check := udf_check_user_active(p_user_id);

    IF NOT (v_user_active_check->>'success')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', v_user_active_check->>'message'
        );
    END IF;

    -- Get user's email, mobile, and country phone code (e.g. +91)
    -- The countries.phone_code already includes the leading '+'.
    SELECT u.email, u.mobile, c.phone_code
      INTO v_user_email, v_user_mobile, v_phone_code
    FROM users u
    LEFT JOIN countries c ON c.id = u.country_id
    WHERE u.id = p_user_id
    LIMIT 1;

    IF v_user_email IS NULL AND v_user_mobile IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User has no email or mobile address registered'
        );
    END IF;

    -- Generate OTP for email if available
    IF v_user_email IS NOT NULL THEN
        v_email_otp_result := udf_otp_generate(
            p_user_id,
            'reset_password',
            'email',
            v_user_email
        );

        IF NOT (v_email_otp_result->>'success')::BOOLEAN THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'Failed to generate email OTP: ' || (v_email_otp_result->>'message')
            );
        END IF;

        v_email_otp_id := (v_email_otp_result->>'id')::BIGINT;
        v_email_otp_code := v_email_otp_result->>'otp_code';
    END IF;

    -- Generate OTP for mobile if available
    IF v_user_mobile IS NOT NULL THEN
        -- Build E.164-style destination via the shared helper.
        -- Defensive against double-prefixing if users.mobile was
        -- already stored in E.164 form for some reason.
        v_mobile_destination := udf_format_mobile_e164(v_phone_code, v_user_mobile);

        v_mobile_otp_result := udf_otp_generate(
            p_user_id,
            'reset_password',
            'mobile',
            v_mobile_destination
        );

        IF NOT (v_mobile_otp_result->>'success')::BOOLEAN THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', 'Failed to generate mobile OTP: ' || (v_mobile_otp_result->>'message')
            );
        END IF;

        v_mobile_otp_id := (v_mobile_otp_result->>'id')::BIGINT;
        v_mobile_otp_code := v_mobile_otp_result->>'otp_code';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Verification codes sent to your registered email and mobile',
        'email_otp_id', v_email_otp_id,
        'email_otp', v_email_otp_code,
        'mobile_otp_id', v_mobile_otp_id,
        'mobile_otp', v_mobile_otp_code
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error initiating password reset: ' || SQLERRM
    );
END;
$$;

-- Testing queries (commented out)
/*
SELECT udf_auth_reset_password_initiate(5);

-- Verify user has email and mobile
SELECT id, email, mobile FROM users WHERE id = 5 LIMIT 1;
*/
