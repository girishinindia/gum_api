-- ============================================================================
-- udf_format_mobile_e164() - Build an E.164-style SMS destination
-- ============================================================================
-- Purpose: Combine a country dialing code (e.g. '+91' from countries.phone_code)
--          with a bare local mobile (e.g. '9662278990') to produce '+919662278990'.
--          Defensive against double-prefixing if the caller already passed a
--          number that begins with '+', and against country rows that store the
--          dialing code without the leading '+'.
--
-- Returns: TEXT — the formatted destination, or NULL if mobile is null/empty.
--
-- Used by:
--   - udf_register
--   - udf_auth_forgot_password_initiate
--   - udf_auth_reset_password_initiate
--   - udf_auth_change_mobile_initiate
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_format_mobile_e164(
    p_phone_code TEXT,
    p_mobile TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_mobile TEXT;
    v_code TEXT;
    v_normalised_code TEXT;
    v_code_digits TEXT;
BEGIN
    IF p_mobile IS NULL THEN
        RETURN NULL;
    END IF;

    v_mobile := TRIM(p_mobile);
    IF v_mobile = '' THEN
        RETURN NULL;
    END IF;

    -- Already E.164 — pass through unchanged.
    IF v_mobile LIKE '+%' THEN
        RETURN v_mobile;
    END IF;

    v_code := COALESCE(TRIM(p_phone_code), '');
    IF v_code = '' THEN
        -- No country code on file: return the bare mobile so the
        -- destination column is still non-null. The SMS gateway
        -- will reject this but the OTP record itself stays valid.
        RETURN v_mobile;
    END IF;

    -- Normalise: ensure exactly one leading '+'.
    v_normalised_code := CASE
        WHEN v_code LIKE '+%' THEN v_code
        ELSE '+' || v_code
    END;

    -- If the local mobile already begins with the dialing-code
    -- digits (without '+'), strip them before concatenating to
    -- avoid producing a number with the country code repeated.
    v_code_digits := SUBSTRING(v_normalised_code FROM 2);
    IF v_mobile LIKE v_code_digits || '%' THEN
        v_mobile := SUBSTRING(v_mobile FROM LENGTH(v_code_digits) + 1);
    END IF;

    RETURN v_normalised_code || v_mobile;
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================
/*
-- Standard case: +91 + 10-digit Indian mobile
SELECT udf_format_mobile_e164('+91', '9662278990');
-- → '+919662278990'

-- Already E.164 (caller pre-prefixed): pass-through
SELECT udf_format_mobile_e164('+91', '+919662278990');
-- → '+919662278990'

-- Local mobile that includes the country digits without '+': strip
SELECT udf_format_mobile_e164('+91', '919662278990');
-- → '+919662278990'

-- Country code without '+': normalise
SELECT udf_format_mobile_e164('91', '9662278990');
-- → '+919662278990'

-- No country code on file: bare mobile pass-through
SELECT udf_format_mobile_e164(NULL, '9662278990');
-- → '9662278990'

-- Null / empty mobile
SELECT udf_format_mobile_e164('+91', NULL);   -- → NULL
SELECT udf_format_mobile_e164('+91', '');     -- → NULL
*/
