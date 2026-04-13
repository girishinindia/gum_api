-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_users_update
-- PURPOSE: Update an existing user with validation and hierarchy checks
-- RETURNS: JSONB { success, message }
-- USAGE: SELECT udf_users_update(p_caller_id := 1, p_id := 2, p_first_name := 'Updated Name');
-- ══════════════════════════════════════════════════════════════════════════════
-- Only provided fields are updated (COALESCE pattern).
-- Email, mobile, password, and role changes are BLOCKED and must use dedicated flows.
-- Validates caller hierarchy access before allowing update.
-- Cannot update soft-deleted users.
-- Validates country if changing that field.
-- DEPENDS ON: users, roles, countries, udf_check_hierarchy_access
-- ══════════════════════════════════════════════════════════════════════════════


-- Drop old function signatures
DROP FUNCTION IF EXISTS sp_users_update(BIGINT, BIGINT, TEXT, TEXT, CITEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS udf_users_update(BIGINT, BIGINT, TEXT, TEXT, CITEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BIGINT);
DROP FUNCTION IF EXISTS udf_users_update(BIGINT, BIGINT, BIGINT, TEXT, TEXT, CITEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BIGINT);

CREATE OR REPLACE FUNCTION udf_users_update(
    p_caller_id             BIGINT,        -- WHO is doing the update
    p_id                    BIGINT,        -- target user ID
    p_country_id            BIGINT      DEFAULT NULL,
    p_first_name            TEXT        DEFAULT NULL,
    p_last_name             TEXT        DEFAULT NULL,
    p_is_active             BOOLEAN     DEFAULT NULL,
    p_is_email_verified     BOOLEAN     DEFAULT NULL,
    p_is_mobile_verified    BOOLEAN     DEFAULT NULL,
    p_updated_by            BIGINT      DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hierarchy_check JSONB;
    v_current_country_id BIGINT;
    v_current_is_active  BOOLEAN;
    v_final_country_id   BIGINT;
    v_final_is_active    BOOLEAN;
BEGIN

    -- Check hierarchy access: can caller edit this user?
    v_hierarchy_check := udf_check_hierarchy_access(p_caller_id, p_id, 'edit');
    IF NOT (v_hierarchy_check ->> 'success')::BOOLEAN THEN
        RAISE EXCEPTION '%', v_hierarchy_check ->> 'message';
    END IF;

    -- Fetch current values for validation
    SELECT country_id, is_active
    INTO v_current_country_id, v_current_is_active
    FROM users
    WHERE id = p_id AND is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active user found with ID %.', p_id;
    END IF;

    -- Determine final values for validation
    v_final_country_id := COALESCE(p_country_id, v_current_country_id);
    v_final_is_active  := COALESCE(p_is_active, v_current_is_active);

    -- Validate parent country if changing country or activating user
    IF p_country_id IS NOT NULL OR (p_is_active = TRUE AND v_current_is_active = FALSE) THEN
        IF v_final_is_active = TRUE THEN
            IF NOT EXISTS (
                SELECT 1 FROM countries
                WHERE id = v_final_country_id
                  AND is_active = TRUE
                  AND is_deleted = FALSE
            ) THEN
                RAISE EXCEPTION 'Cannot activate user: country ID % is either inactive, deleted, or does not exist.', v_final_country_id;
            END IF;
        ELSE
            IF NOT EXISTS (
                SELECT 1 FROM countries
                WHERE id = v_final_country_id
                  AND is_deleted = FALSE
            ) THEN
                RAISE EXCEPTION 'Country ID % does not exist or is deleted.', v_final_country_id;
            END IF;
        END IF;
    END IF;

    -- Update user (only allowed fields)
    UPDATE users
    SET
        country_id          = COALESCE(p_country_id, country_id),
        first_name          = COALESCE(NULLIF(btrim(p_first_name), ''), first_name),
        last_name           = COALESCE(NULLIF(btrim(p_last_name), ''), last_name),
        is_active           = COALESCE(p_is_active, is_active),
        is_email_verified   = COALESCE(p_is_email_verified, is_email_verified),
        is_mobile_verified  = COALESCE(p_is_mobile_verified, is_mobile_verified),
        email_verified_at   = CASE
                                WHEN p_is_email_verified = TRUE AND is_email_verified = FALSE
                                THEN CURRENT_TIMESTAMP
                                ELSE email_verified_at
                              END,
        mobile_verified_at  = CASE
                                WHEN p_is_mobile_verified = TRUE AND is_mobile_verified = FALSE
                                THEN CURRENT_TIMESTAMP
                                ELSE mobile_verified_at
                              END,
        updated_by          = p_updated_by,
        updated_at          = CURRENT_TIMESTAMP
    WHERE
        id = p_id
        AND is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active user found with ID %.', p_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('User %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating user: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Update first name (caller=1 is super admin)
-- SELECT udf_users_update(p_caller_id := 1, p_id := 2, p_first_name := 'Updated');

-- Test 2: Verify email (caller=1 is super admin)
-- SELECT udf_users_update(p_caller_id := 1, p_id := 2, p_is_email_verified := TRUE);

-- Test 3: Deactivate user (caller=1 is super admin)
-- SELECT udf_users_update(p_caller_id := 1, p_id := 2, p_is_active := FALSE);

-- Test 4: Change country (caller=1 is super admin)
-- SELECT udf_users_update(p_caller_id := 1, p_id := 2, p_country_id := 2);

-- Test 5: Should FAIL — trying to update email directly (blocked)
-- SELECT udf_users_update(p_caller_id := 1, p_id := 2, p_email := 'new@example.com');

-- Test 6: Should FAIL — trying to update password directly (blocked)
-- SELECT udf_users_update(p_caller_id := 1, p_id := 2, p_password := 'NewPass@123');

-- Test 7: Should FAIL — trying to update role directly (blocked)
-- SELECT udf_users_update(p_caller_id := 1, p_id := 2, p_role_id := 3);

-- Test 8: Should FAIL — hierarchy access denied (caller has no permission)
-- SELECT udf_users_update(p_caller_id := 5, p_id := 2, p_first_name := 'Updated');

-- ══════════════════════════════════════════════════════════════════════════════
