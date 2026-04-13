-- ============================================================================
-- FUNCTION: udf_password_history_check
-- ============================================================================
-- Purpose:
--   Check if a new password has been used recently (reuse detection).
--   Compares plaintext password against last N historical hashes AND current password.
--   Uses bcrypt comparison: crypt(plaintext, stored_hash) = stored_hash
--
-- Parameters:
--   p_user_id        : BIGINT - User to check (required)
--   p_new_password   : TEXT - Plaintext password to validate (required)
--   p_check_count    : INT - Number of previous passwords to check (default: 5)
--
-- Returns: JSONB
--   {
--     "success": boolean (true = password acceptable, false = reused),
--     "message": string,
--     "is_reused": boolean (true if matched a recent password, false if acceptable)
--   }
--
-- Logic:
--   1. Fetch last p_check_count password hashes from password_history
--   2. Also fetch current password hash from users table
--   3. For each hash: compare using crypt(p_new_password, stored_hash)
--   4. If any match: return {success: false, is_reused: true}
--   5. If no match: return {success: true, is_reused: false}
--
-- Depends:
--   - users table (current password)
--   - password_history table (historical passwords)
--   - pgcrypto extension (crypt function)
--
-- Usage:
--   -- Check before allowing password change
--   SELECT udf_password_history_check(
--     p_user_id => 123,
--     p_new_password => 'mynewpassword'
--   );
--
--   -- Check against last 3 passwords instead of 5
--   SELECT udf_password_history_check(
--     p_user_id => 456,
--     p_new_password => 'mynewpassword',
--     p_check_count => 3
--   );
--
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_password_history_check(
  p_user_id BIGINT,
  p_new_password TEXT,
  p_check_count INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_password_hashes TEXT[];
  v_stored_hash TEXT;
  v_test_hash TEXT;
  i INT;
  v_user_exists BOOLEAN;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'User ID is required.',
      'is_reused', FALSE
    );
  END IF;

  IF p_new_password IS NULL OR LENGTH(TRIM(p_new_password)) = 0 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'New password is required.',
      'is_reused', FALSE
    );
  END IF;

  -- Ensure check_count is reasonable
  p_check_count := GREATEST(LEAST(p_check_count, 100), 1);

  -- Check if user exists
  SELECT EXISTS(SELECT 1 FROM users WHERE id = p_user_id)
  INTO v_user_exists;

  IF NOT v_user_exists THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'User does not exist.',
      'is_reused', FALSE
    );
  END IF;

  -- Fetch last N password hashes from history (ordered newest first).
  -- The inner subquery must project created_at so the outer
  -- ARRAY_AGG(... ORDER BY created_at) can see it.
  SELECT ARRAY_AGG(password_hash ORDER BY created_at DESC)
  INTO v_password_hashes
  FROM (
    SELECT password_hash, created_at
    FROM password_history
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT p_check_count
  ) subq;

  -- Add current password from users table.
  -- public.users column is `password`, not `password_hash`.
  SELECT password INTO v_stored_hash FROM users WHERE id = p_user_id;

  IF v_stored_hash IS NOT NULL THEN
    IF v_password_hashes IS NULL THEN
      v_password_hashes := ARRAY[v_stored_hash];
    ELSE
      v_password_hashes := ARRAY_PREPEND(v_stored_hash, v_password_hashes);
    END IF;
  END IF;

  -- If no hashes to compare against, password is acceptable
  IF v_password_hashes IS NULL OR ARRAY_LENGTH(v_password_hashes, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'Password is acceptable.',
      'is_reused', FALSE
    );
  END IF;

  -- Compare new password against each historical hash using bcrypt
  FOR i IN 1..ARRAY_LENGTH(v_password_hashes, 1) LOOP
    v_test_hash := crypt(p_new_password, v_password_hashes[i]);
    IF v_test_hash = v_password_hashes[i] THEN
      -- Password matches a recent hash
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Password was used recently. Please choose a different password.',
        'is_reused', TRUE
      );
    END IF;
  END LOOP;

  -- No match found; password is acceptable
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Password is acceptable.',
    'is_reused', FALSE
  );
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*
-- Setup: Insert test user and password history
-- (Assumes user with id=1 exists)
-- INSERT INTO password_history (user_id, password_hash, change_reason, created_at)
-- VALUES
--   (1, crypt('password1', gen_salt('bf')), 'initial', CURRENT_TIMESTAMP - INTERVAL '10 days'),
--   (1, crypt('password2', gen_salt('bf')), 'self_reset', CURRENT_TIMESTAMP - INTERVAL '5 days'),
--   (1, crypt('password3', gen_salt('bf')), 'self_reset', CURRENT_TIMESTAMP - INTERVAL '2 days');
-- UPDATE users SET password_hash = crypt('password3', gen_salt('bf')) WHERE id = 1;

-- Test 1: New password (should pass)
SELECT udf_password_history_check(
  p_user_id => 1,
  p_new_password => 'brandnewpassword'
) AS result;

-- Test 2: Reuse of current password (should fail)
SELECT udf_password_history_check(
  p_user_id => 1,
  p_new_password => 'password3'
) AS result;

-- Test 3: Reuse of historical password (should fail)
SELECT udf_password_history_check(
  p_user_id => 1,
  p_new_password => 'password1'
) AS result;

-- Test 4: Check against last 3 passwords only
SELECT udf_password_history_check(
  p_user_id => 1,
  p_new_password => 'password1',  -- Older than 3, might pass
  p_check_count => 3
) AS result;

-- Test 5: Non-existent user (should fail gracefully)
SELECT udf_password_history_check(
  p_user_id => 999999,
  p_new_password => 'anypassword'
) AS result;

-- Test 6: NULL password (should fail)
SELECT udf_password_history_check(
  p_user_id => 1,
  p_new_password => NULL
) AS result;

-- Test 7: Empty password (should fail)
SELECT udf_password_history_check(
  p_user_id => 1,
  p_new_password => ''
) AS result;

-- Test 8: Case sensitivity (bcrypt is case sensitive)
-- Assuming current password is 'myPassword123'
SELECT udf_password_history_check(
  p_user_id => 1,
  p_new_password => 'mypassword123'  -- Different case, should pass
) AS result;

-- Test 9: Verify count of hashes checked
-- This queries to inspect the actual hashes being compared
SELECT
  ph.user_id,
  COUNT(*) AS hash_count,
  MAX(ph.created_at) AS most_recent
FROM password_history ph
WHERE ph.user_id = 1
GROUP BY ph.user_id;

-- Test 10: Audit trail
SELECT ph.id, ph.user_id, ph.change_reason, ph.created_at
FROM password_history ph
WHERE ph.user_id = 1
ORDER BY ph.created_at DESC
LIMIT 10;
*/
