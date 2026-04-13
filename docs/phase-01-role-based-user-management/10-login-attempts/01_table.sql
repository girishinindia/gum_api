/**
 * ============================================================================
 * LOGIN_ATTEMPTS TABLE & ENUM
 * ============================================================================
 * Purpose:
 *   - Record all login attempts (success/failure) for security auditing
 *   - Append-only table (no updates/deletes of business records)
 *   - Enforce rate limiting: 5 failed attempts → 30-min block
 *   - Tracks identifier (email or mobile), IP, device, OS, browser
 *
 * Depends:
 *   - users table (for user_id FK)
 *   - This is a security audit log — not soft-deleted
 *
 * Usage:
 *   - Inserted by login service via udf_login_attempt_record()
 *   - Queried for rate limiting via udf_login_attempt_check()
 *   - Browsed via uv_login_attempts view
 * ============================================================================
 */

-- Enum for login attempt outcomes
CREATE TYPE login_attempt_status AS ENUM ('success', 'failed', 'blocked');

-- Main table: append-only log of login attempts
CREATE TABLE login_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Null if user not found in system (e.g., email not registered)
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Email or mobile used for login attempt
  identifier TEXT NOT NULL,

  -- Network/device tracking
  ip_address INET,
  user_agent TEXT,
  device_type TEXT,          -- e.g., 'mobile', 'desktop', 'tablet'
  os TEXT,                   -- e.g., 'iOS', 'Android', 'Windows'
  browser TEXT,              -- e.g., 'Chrome', 'Safari'

  -- Attempt outcome
  status login_attempt_status NOT NULL,

  -- Reason for failure (only populated if status = 'failed')
  -- Examples: 'invalid_credentials', 'account_blocked', 'account_inactive',
  -- 'account_deleted', 'email_not_verified', 'mobile_not_verified'
  failure_reason TEXT,

  -- If status = 'blocked', when the block expires
  -- Set by udf_login_attempt_record when 5 failures detected
  blocked_until TIMESTAMPTZ,

  -- When this login was attempted
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Composite index for rate limiting queries
-- Used by udf_login_attempt_check to find recent failures
CREATE INDEX idx_login_attempts_identifier_attempted_at
  ON login_attempts (identifier, attempted_at DESC)
  WHERE status = 'failed' OR status = 'blocked';

-- User lookup index
CREATE INDEX idx_login_attempts_user_id
  ON login_attempts (user_id);

-- IP tracking index
CREATE INDEX idx_login_attempts_ip_address
  ON login_attempts (ip_address);

-- Status filtering index
CREATE INDEX idx_login_attempts_status
  ON login_attempts (status);

-- General time-based queries
CREATE INDEX idx_login_attempts_attempted_at_desc
  ON login_attempts (attempted_at DESC);

-- Table comment

-- ============================================================================
-- TESTING / EXAMPLES (uncomment to run)
-- ============================================================================

/*
-- View the enum type definition
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'login_attempt_status'::regtype;

-- Count records by status
SELECT status, COUNT(*) FROM login_attempts GROUP BY status;

-- Find all attempts for an identifier in the last 30 minutes
SELECT id, identifier, status, attempted_at, blocked_until
  FROM login_attempts
  WHERE identifier = 'user@example.com'
    AND attempted_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
  ORDER BY attempted_at DESC;

-- Find all blocked identifiers with active blocks
SELECT DISTINCT identifier, MAX(blocked_until) as block_expires
  FROM login_attempts
  WHERE status = 'blocked' AND blocked_until > CURRENT_TIMESTAMP
  GROUP BY identifier
  ORDER BY block_expires DESC;
*/
