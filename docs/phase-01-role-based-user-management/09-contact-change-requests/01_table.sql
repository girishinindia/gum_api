/*
 * User Contact Change Requests - Table & Enums
 * Purpose: Manage email and mobile contact change requests with OTP-based verification
 * Depends: users table (already exists)
 * Usage: CREATE statements for enums and table
 */

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE contact_change_type AS ENUM ('email', 'mobile');
CREATE TYPE contact_change_status AS ENUM ('pending', 'verified', 'completed', 'cancelled', 'expired');

-- ============================================================================
-- TABLE: user_contact_change_requests
-- ============================================================================
-- Stores pending, verified, and completed contact change requests.
-- Each request goes through: pending -> verified -> completed lifecycle.
-- Unverified or outdated requests can be cancelled or expire after 24 hours.

CREATE TABLE user_contact_change_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    change_type contact_change_type NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    status contact_change_status NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    verified_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_user_contact_change_requests_user_id
    ON user_contact_change_requests(user_id);

CREATE INDEX idx_user_contact_change_requests_change_type_status
    ON user_contact_change_requests(change_type, status);

CREATE INDEX idx_user_contact_change_requests_new_value
    ON user_contact_change_requests(new_value);

CREATE INDEX idx_user_contact_change_requests_status
    ON user_contact_change_requests(status);

CREATE INDEX idx_user_contact_change_requests_expires_at
    ON user_contact_change_requests(expires_at);

-- ============================================================================
-- TRIGGER: auto-update updated_at column
-- ============================================================================
-- This trigger uses the existing fn_update_updated_at_column() function
-- which is assumed to exist in the public schema.

CREATE TRIGGER trg_user_contact_change_requests_updated_at
    BEFORE UPDATE ON user_contact_change_requests
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at_column();

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*

-- Insert test data (assuming test user exists with id = 1)
INSERT INTO user_contact_change_requests (user_id, change_type, old_value, new_value, status)
VALUES (1, 'email', 'old@example.com', 'new@example.com', 'pending');

-- Verify table structure
SELECT * FROM user_contact_change_requests;

-- Test enum types
SELECT * FROM pg_enum WHERE enumtypid = 'contact_change_type'::regtype;
SELECT * FROM pg_enum WHERE enumtypid = 'contact_change_status'::regtype;

*/
