/**
 * Purpose: Initiate forgot password flow - requires email AND mobile verification
 * Generates OTPs for both channels to prove account ownership
 * Depends: users table, udf_otp_invalidate(), udf_otp_generate()
 * Usage: SELECT udf_auth_forgot_password_initiate('user@example.com', '+14155552671');
 */

CREATE OR REPLACE FUNCTION udf_auth_forgot_password_initiate(
    p_email CITEXT,
    p_mobile TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id BIGINT;
    v_phone_code TEXT;
    v_mobile_destination TEXT;
    v_invalidate_result JSONB;
    v_email_otp_result JSONB;
    v_email_otp_id BIGINT;
    v_email_otp_code TEXT;
    v_mobile_otp_result JSONB;
    v_mobile_otp_id BIGINT;
    v_mobile_otp_code TEXT;
BEGIN
    -- Validation: both email and mobile required
    IF (p_email IS NULL OR TRIM(p_email) = '') OR (p_mobile IS NULL OR TRIM(p_mobile) = '') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Both email and mobile are required'
        );
    END IF;

    -- Find user by email AND mobile combination, and pull the
    -- country dialing code in the same query so we can build an
    -- E.164 destination for the SMS OTP without a second round-trip.
    SELECT u.id, c.phone_code
      INTO v_user_id, v_phone_code
    FROM users u
    LEFT JOIN countries c ON c.id = u.country_id
    WHERE u.email = LOWER(TRIM(p_email))
      AND u.mobile = TRIM(p_mobile)
      AND u.is_deleted = FALSE
      AND u.is_active = TRUE
    LIMIT 1;

    -- User not found (generic message for security)
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'No account found with this email and mobile combination'
        );
    END IF;

    -- Invalidate any previous forgot_password OTPs
    v_invalidate_result := udf_otp_invalidate(v_user_id, 'forgot_password');

    -- Generate OTP for email channel
    v_email_otp_result := udf_otp_generate(
        v_user_id,
        'forgot_password',
        'email',
        LOWER(TRIM(p_email))
    );

    IF NOT (v_email_otp_result->>'success')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Failed to generate email OTP: ' || (v_email_otp_result->>'message')
        );
    END IF;

    v_email_otp_id := (v_email_otp_result->>'id')::BIGINT;
    v_email_otp_code := v_email_otp_result->>'otp_code';

    -- Generate OTP for mobile channel — destination is the user's
    -- mobile formatted as E.164 via the shared helper, which is
    -- defensive against double-prefixing and missing country codes.
    v_mobile_destination := udf_format_mobile_e164(v_phone_code, p_mobile);

    v_mobile_otp_result := udf_otp_generate(
        v_user_id,
        'forgot_password',
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

    -- Both OTPs generated successfully
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Verification codes sent to registered email and mobile',
        'user_id', v_user_id,
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
SELECT udf_auth_forgot_password_initiate(
    'user@example.com',
    '+14155552671'
);

SELECT udf_auth_forgot_password_initiate(
    'user@example.com',
    NULL
);
*/
