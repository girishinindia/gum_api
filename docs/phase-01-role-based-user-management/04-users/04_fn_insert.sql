-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_users_insert
-- PURPOSE: Insert a new user with validation
-- RETURNS: JSONB { success, message, id }
-- USAGE: SELECT udf_users_insert(p_first_name := 'Girish', p_last_name := 'K', p_email := 'g@test.com', p_password := 'Test@123');
-- ══════════════════════════════════════════════════════════════════════════════
-- Password is hashed using pgcrypto (bcrypt).
-- At least one of email or mobile is required (table CHECK constraint).
-- Validates role_id exists in roles table (active, not deleted).
-- Validates country_id exists in countries table.
-- DEPENDS ON: users, roles, countries
-- ══════════════════════════════════════════════════════════════════════════════


-- Drop old function signatures
DROP FUNCTION IF EXISTS sp_users_insert(BIGINT, TEXT, TEXT, TEXT, CITEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS udf_users_insert(TEXT, TEXT, TEXT, CITEXT, TEXT, BIGINT, BOOLEAN, BOOLEAN, BOOLEAN, BIGINT);

CREATE OR REPLACE FUNCTION udf_users_insert(
    p_first_name            TEXT,
    p_last_name             TEXT,
    p_password              TEXT,
    p_email                 CITEXT      DEFAULT NULL,
    p_mobile                TEXT        DEFAULT NULL,
    p_role_id               BIGINT      DEFAULT 8,          -- Default Student
    p_country_id            BIGINT      DEFAULT 1,          -- Default India
    p_is_active             BOOLEAN     DEFAULT TRUE,
    p_is_email_verified     BOOLEAN     DEFAULT FALSE,
    p_is_mobile_verified    BOOLEAN     DEFAULT FALSE,
    p_created_by            BIGINT      DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_id    BIGINT;
BEGIN

    -- Validate at least one login method
    IF p_email IS NULL AND p_mobile IS NULL THEN
        RAISE EXCEPTION 'At least one login method required: email or mobile.';
    END IF;

    -- Validate password is not empty
    IF p_password IS NULL OR btrim(p_password) = '' THEN
        RAISE EXCEPTION 'Password cannot be empty.';
    END IF;

    -- Validate first_name
    IF p_first_name IS NULL OR btrim(p_first_name) = '' THEN
        RAISE EXCEPTION 'First name cannot be empty.';
    END IF;

    -- Validate last_name
    IF p_last_name IS NULL OR btrim(p_last_name) = '' THEN
        RAISE EXCEPTION 'Last name cannot be empty.';
    END IF;

    -- Validate role (must be active and not deleted)
    IF NOT EXISTS (
        SELECT 1 FROM roles
        WHERE id = p_role_id
          AND is_active = TRUE
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Cannot create user: role ID % is either inactive, deleted, or does not exist.', p_role_id;
    END IF;

    -- Validate country (must be active and not deleted for active users)
    IF p_is_active = TRUE THEN
        IF NOT EXISTS (
            SELECT 1 FROM countries
            WHERE id = p_country_id
              AND is_active = TRUE
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'Cannot create active user: country ID % is either inactive, deleted, or does not exist.', p_country_id;
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM countries
            WHERE id = p_country_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'Country ID % does not exist or is deleted.', p_country_id;
        END IF;
    END IF;

    -- Insert user
    INSERT INTO users (
        role_id,
        country_id,
        first_name,
        last_name,
        email,
        mobile,
        password,
        is_active,
        is_email_verified,
        is_mobile_verified,
        email_verified_at,
        mobile_verified_at,
        created_by,
        updated_by
    )
    VALUES (
        p_role_id,
        p_country_id,
        btrim(p_first_name),
        btrim(p_last_name),
        p_email,
        p_mobile,
        crypt(p_password, gen_salt('bf')),
        p_is_active,
        p_is_email_verified,
        p_is_mobile_verified,
        CASE WHEN p_is_email_verified THEN CURRENT_TIMESTAMP ELSE NULL END,
        CASE WHEN p_is_mobile_verified THEN CURRENT_TIMESTAMP ELSE NULL END,
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('User inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting user: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Insert student user (default role = Student, default country = India)
-- SELECT udf_users_insert(
--     p_first_name := 'Girish',
--     p_last_name  := 'Kumar',
--     p_password   := 'Test@123',
--     p_email      := 'girish@test.com'
-- );

-- Test 2: Insert instructor with specific role
-- SELECT udf_users_insert(
--     p_first_name := 'Priya',
--     p_last_name  := 'Sharma',
--     p_password   := 'Test@123',
--     p_email      := 'priya@test.com',
--     p_role_id    := 7,                -- Instructor
--     p_country_id := 1
-- );

-- Test 3: Insert admin user
-- SELECT udf_users_insert(
--     p_first_name := 'Admin',
--     p_last_name  := 'User',
--     p_password   := 'Admin@123',
--     p_email      := 'admin@test.com',
--     p_role_id    := 2                 -- Admin
-- );

-- Test 4: Insert with mobile only (no email)
-- SELECT udf_users_insert(
--     p_first_name := 'Raj',
--     p_last_name  := 'Patel',
--     p_password   := 'Mobile@123',
--     p_mobile     := '+919876543210'
-- );

-- Test 5: Should FAIL — no email and no mobile
-- SELECT udf_users_insert(
--     p_first_name := 'No',
--     p_last_name  := 'Login',
--     p_password   := 'Test@123'
-- );

-- Test 6: Should FAIL — empty password
-- SELECT udf_users_insert(
--     p_first_name := 'Empty',
--     p_last_name  := 'Pass',
--     p_password   := '',
--     p_email      := 'empty@test.com'
-- );

-- Test 7: Should FAIL — invalid role ID
-- SELECT udf_users_insert(
--     p_first_name := 'Bad',
--     p_last_name  := 'Role',
--     p_password   := 'Test@123',
--     p_email      := 'badrole@test.com',
--     p_role_id    := 99999
-- );

-- ══════════════════════════════════════════════════════════════════════════════
