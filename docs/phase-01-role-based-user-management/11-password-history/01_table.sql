-- ============================================================================
-- TABLE: password_history
-- ============================================================================
-- Purpose:
--   Append-only audit table tracking all password changes for users.
--   Enables detection of reused passwords to enforce uniqueness constraints.
--   No soft deletes — this is a security-critical immutable history.
--
-- Depends:
--   - users (id) via ON DELETE CASCADE
--
-- Usage:
--   INSERT INTO password_history (user_id, password_hash, changed_by, change_reason)
--   VALUES (123, crypt('password', gen_salt('bf')), 456, 'admin_reset');
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_history (
  -- Immutable audit record identifier
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- User who changed password; ON DELETE CASCADE ensures no orphaned records
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- BCrypt password hash (already hashed before storage)
  -- Format: bcrypt hash from crypt(password, gen_salt('bf'))
  password_hash TEXT NOT NULL,

  -- User who initiated the change (NULL = unknown/system)
  -- Could be the user themselves or an admin
  changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Contextual reason for the password change
  -- Examples: 'self_reset', 'forgot_password', 'admin_reset', 'initial'
  change_reason TEXT,

  -- When the password change occurred (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Composite index: user_id + created_at DESC
-- Used for: Checking last N passwords for reuse detection
-- Query pattern: SELECT password_hash FROM password_history
--                WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5
CREATE INDEX IF NOT EXISTS idx_password_history_user_created
  ON password_history(user_id, created_at DESC);

-- Single index: user_id
-- Used for: Foreign key referential integrity, user-specific audits
CREATE INDEX IF NOT EXISTS idx_password_history_user_id
  ON password_history(user_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*
-- Insert test records (requires users table to exist)
INSERT INTO password_history (user_id, password_hash, changed_by, change_reason)
VALUES
  (1, crypt('password1', gen_salt('bf')), NULL, 'initial'),
  (1, crypt('password2', gen_salt('bf')), 1, 'self_reset'),
  (1, crypt('password3', gen_salt('bf')), 2, 'admin_reset'),
  (2, crypt('newpass', gen_salt('bf')), NULL, 'forgot_password');

-- Check last 5 password hashes for a user
SELECT password_hash, created_at
FROM password_history
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 5;

-- Verify bcrypt comparison works
SELECT crypt('password1', '$2a$06$...');  -- If result equals stored hash, match found

-- Count total password changes per user
SELECT user_id, COUNT(*) AS change_count
FROM password_history
GROUP BY user_id
ORDER BY change_count DESC;

-- Audit: who changed whose password
SELECT ph.id, ph.user_id, u1.email AS user_email,
       ph.changed_by, u2.email AS changed_by_email,
       ph.change_reason, ph.created_at
FROM password_history ph
LEFT JOIN users u1 ON ph.user_id = u1.id
LEFT JOIN users u2 ON ph.changed_by = u2.id
ORDER BY ph.created_at DESC
LIMIT 20;
*/
