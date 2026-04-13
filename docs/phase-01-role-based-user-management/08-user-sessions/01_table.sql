/*
 * Purpose:
 *   Create the user_sessions table to store active and historical user session data.
 *   Tracks authentication tokens, device info, location, and session lifecycle.
 *
 * Depends:
 *   - users table must exist
 *   - fn_update_updated_at_column() trigger function must exist
 *
 * Notes:
 *   - session_token: unique, app-generated (UUID or random string)
 *   - refresh_token: nullable, used for token refresh flow
 *   - location: JSONB with {lat, lng, city, country} format
 *   - expires_at: session expiration timestamp
 *   - revoked_at: when session was manually revoked
 */

-- Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  refresh_token TEXT UNIQUE,
  ip_address INET,
  user_agent TEXT,
  device_type TEXT,
  os TEXT,
  browser TEXT,
  location JSONB,
  login_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token
  ON user_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token
  ON user_sessions(refresh_token);

CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active
  ON user_sessions(is_active);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
  ON user_sessions(expires_at);

-- Composite index for common query pattern: user's active sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id_is_active
  ON user_sessions(user_id, is_active);

-- Add trigger for automatic updated_at column
DROP TRIGGER IF EXISTS trg_user_sessions_update_updated_at ON user_sessions;
CREATE TRIGGER trg_user_sessions_update_updated_at
  BEFORE UPDATE ON user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at_column();

-- Add table comment

-- Add column comments

/*
 * Testing Queries
 * ===============
 *
 * -- Check table structure
 * \d user_sessions;
 *
 * -- Insert test session
 * INSERT INTO user_sessions (user_id, session_token, refresh_token, expires_at)
 * VALUES (1, 'test-token-123', 'test-refresh-123', CURRENT_TIMESTAMP + INTERVAL '7 days')
 * RETURNING *;
 *
 * -- Verify indexes exist
 * SELECT indexname FROM pg_indexes WHERE tablename = 'user_sessions';
 *
 * -- Verify trigger exists
 * SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'user_sessions';
 */
