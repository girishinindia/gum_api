-- ============================================================================
-- FUNCTION: udf_password_history_add
-- ============================================================================
-- Purpose:
--   Record a new password change in the audit log.
--   Validates user exists, inserts immutable audit record.
--   Caller is responsible for hashing the password (bcrypt via crypt function).
--   This function stores the pre-hashed password_hash as provided.
--
-- Parameters:
--   p_user_id        : BIGINT - User whose password changed (required)
--   p_password_hash  : TEXT - BCrypt hash from crypt(password, gen_salt('bf')) (required)
--   p_changed_by     : BIGINT - User who initiated change, NULL if unknown (optional)
--   p_change_reason  : TEXT - Business context (default: 'self_reset')
--                      Examples: 'self_reset', 'forgot_password', 'admin_reset', 'initial'
--
-- Returns: JSONB
--   {
--     "success": boolean,
--     "message": string,
--     "id": bigint (only if success = true)
--   }
--
-- Depends:
--   - users table
--   - password_history table
--   - pgcrypto extension (for bcrypt, used by caller)
--
-- Usage:
--   -- Self password reset
--   SELECT udf_password_history_add(
--     p_user_id => 123,
--     p_password_hash => crypt('newpassword', gen_salt('bf')),
--     p_change_reason => 'self_reset'
--   );
--
--   -- Admin password reset
--   SELECT udf_password_history_add(
--     p_user_id => 456,
--     p_password_hash => crypt('temppassword', gen_salt('bf')),
--     p_changed_by => 1,  -- Admin user ID
--     p_change_reason => 'admin_reset'
--   );
--
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_password_history_add(
  p_user_id BIGINT,
  p_password_hash TEXT,
  p_changed_by BIGINT DEFAULT NULL,
  p_change_reason TEXT DEFAULT 'self_reset'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_exists BOOLEAN;
  v_record_id BIGINT;
  v_error_msg TEXT;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'User ID is required.'
    );
  END IF;

  IF p_password_hash IS NULL OR LENGTH(TRIM(p_password_hash)) = 0 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Password hash is required.'
    );
  END IF;

  -- Check if user exists
  SELECT EXISTS(SELECT 1 FROM users WHERE id = p_user_id)
  INTO v_user_exists;

  IF NOT v_user_exists THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'User does not exist.'
    );
  END IF;

  -- Validate changed_by user exists (if provided)
  IF p_changed_by IS NOT NULL THEN
    PERFORM 1 FROM users WHERE id = p_changed_by;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Changed by user does not exist.'
      );
    END IF;
  END IF;

  -- Insert the password change record
  BEGIN
    INSERT INTO password_history (
      user_id,
      password_hash,
      changed_by,
      change_reason,
      created_at
    )
    VALUES (
      p_user_id,
      p_password_hash,
      p_changed_by,
      p_change_reason,
      CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_record_id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'Password history record created successfully.',
      'id', v_record_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_msg := SQLERRM;
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Error inserting password history: ' || v_error_msg
    );
  END;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*
-- Test 1: Successful self password reset
SELECT udf_password_history_add(
  p_user_id => 1,
  p_password_hash => crypt('newpassword123', gen_salt('bf')),
  p_change_reason => 'self_reset'
) AS result;

-- Test 2: Successful admin password reset
SELECT udf_password_history_add(
  p_user_id => 2,
  p_password_hash => crypt('temppassword456', gen_salt('bf')),
  p_changed_by => 1,
  p_change_reason => 'admin_reset'
) AS result;

-- Test 3: Forgot password flow
SELECT udf_password_history_add(
  p_user_id => 3,
  p_password_hash => crypt('resetpassword789', gen_salt('bf')),
  p_change_reason => 'forgot_password'
) AS result;

-- Test 4: Non-existent user (should fail)
SELECT udf_password_history_add(
  p_user_id => 999999,
  p_password_hash => crypt('anypassword', gen_salt('bf')),
  p_change_reason => 'self_reset'
) AS result;

-- Test 5: NULL password hash (should fail)
SELECT udf_password_history_add(
  p_user_id => 1,
  p_password_hash => NULL,
  p_change_reason => 'self_reset'
) AS result;

-- Test 6: Non-existent changed_by user (should fail)
SELECT udf_password_history_add(
  p_user_id => 1,
  p_password_hash => crypt('password', gen_salt('bf')),
  p_changed_by => 999999,
  p_change_reason => 'admin_reset'
) AS result;

-- Test 7: Verify record was inserted
SELECT ph.id, ph.user_id, ph.change_reason, ph.created_at
FROM password_history ph
WHERE ph.user_id = 1
ORDER BY ph.created_at DESC
LIMIT 5;
*/
