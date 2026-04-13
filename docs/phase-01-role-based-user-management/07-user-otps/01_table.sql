-- ============================================================================
-- user_otps Table Definition
-- ============================================================================
-- Purpose: Store OTP records for user verification across multiple purposes
--          (registration, password reset, email/mobile verification, etc.)
--
-- Depends: users table, fn_update_updated_at_column() function
--
-- Usage: Base table for OTP management; all operations go through dedicated
--        UDFs (udf_otp_*) to enforce business rules and security
-- ============================================================================

-- Create ENUM types
CREATE TYPE otp_purpose AS ENUM (
    'registration',
    'forgot_password',
    'reset_password',
    'change_email',
    'change_mobile',
    're_verification'
);

CREATE TYPE otp_channel AS ENUM (
    'email',
    'mobile'
);

CREATE TYPE otp_status AS ENUM (
    'pending',
    'verified',
    'expired',
    'exhausted',
    'invalidated'
);

-- Create main table
CREATE TABLE user_otps (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- User reference
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- OTP purpose and delivery channel
    purpose otp_purpose NOT NULL,
    channel otp_channel NOT NULL,

    -- Destination address for delivery (email or mobile)
    destination TEXT NOT NULL,

    -- Bcrypt-hashed OTP (never store plain text)
    otp_hash TEXT NOT NULL,

    -- Status tracking
    status otp_status NOT NULL DEFAULT 'pending',

    -- Expiration: OTP valid for 10 minutes
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'),

    -- Resend timing: user can resend after 3 minutes
    resend_available_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '3 minutes'),

    -- Attempt tracking: max 5 wrong attempts per OTP
    attempts_count SMALLINT NOT NULL DEFAULT 0,
    max_attempts SMALLINT NOT NULL DEFAULT 5,

    -- Resend tracking: max 3 resends per verification process
    resend_count SMALLINT NOT NULL DEFAULT 0,
    max_resend SMALLINT NOT NULL DEFAULT 3,

    -- Cooldown: when resend limit hit, user cannot request new OTP for 30 minutes
    cooldown_until TIMESTAMPTZ,

    -- Verification tracking
    verified_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,

    -- Audit columns
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for query performance and business logic checks
CREATE INDEX idx_user_otps_user_id ON user_otps(user_id);
CREATE INDEX idx_user_otps_purpose_channel_status ON user_otps(purpose, channel, status);
CREATE INDEX idx_user_otps_destination ON user_otps(destination);
CREATE INDEX idx_user_otps_expires_at ON user_otps(expires_at);
CREATE INDEX idx_user_otps_status ON user_otps(status);
CREATE INDEX idx_user_otps_cooldown_until ON user_otps(cooldown_until);

-- Auto-update updated_at column on any row modification
CREATE TRIGGER trg_user_otps_updated_at
BEFORE UPDATE ON user_otps
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at_column();

-- Add table comment

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================
/*

-- Verify table structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_otps'
ORDER BY ordinal_position;

-- List all indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'user_otps' ORDER BY indexname;

-- Verify enums created
SELECT enum_name, enum_value
FROM pg_enum
WHERE enum_name IN ('otp_purpose', 'otp_channel', 'otp_status')
ORDER BY enum_name, enumsortorder;

-- Check trigger
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'user_otps';

*/
