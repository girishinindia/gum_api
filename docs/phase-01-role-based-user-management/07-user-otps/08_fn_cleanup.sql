-- ============================================================================
-- udf_otp_cleanup() - OTP Cleanup Function
-- ============================================================================
-- Purpose: Mark expired OTPs as 'expired' status. Run periodically via pg_cron
--          to keep database clean and accurate status.
--
-- Depends: user_otps table
--
-- Usage: SELECT * FROM udf_otp_cleanup();
--        Or schedule with pg_cron:
--        SELECT cron.schedule('cleanup-expired-otps', '*/5 * * * *', 'SELECT udf_otp_cleanup()');
--
-- Returns: JSONB with {success, message, count}
--          - success: boolean (always true)
--          - message: description of operation
--          - count: number of OTPs marked as expired
--
-- Business Rules:
--  - Find all pending OTPs where expires_at < CURRENT_TIMESTAMP
--  - Update status = 'expired'
--  - Return count of records updated
--  - Can be run frequently (every 5 minutes recommended) with minimal impact
--
-- NOTE: Schedule this function to run periodically using pg_cron.
--       Example: SELECT cron.schedule('cleanup-expired-otps', '*/5 * * * *', 'SELECT udf_otp_cleanup()');
--       This will run every 5 minutes and clean up expired OTPs.
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_otp_cleanup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Update expired pending OTPs to expired status
    UPDATE user_otps
    SET
        status = 'expired',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending'
      AND expires_at < CURRENT_TIMESTAMP;

    -- Get count of records affected
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Cleanup complete. ' || v_count || ' expired OTP(s) marked as expired.',
        'count', v_count
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error during cleanup: ' || SQLERRM,
        'count', 0
    );
END;
$$;

-- ============================================================================
-- pg_cron SCHEDULING SETUP
-- ============================================================================
-- NOTE: To enable pg_cron scheduling, you may need to:
--
-- 1. Ensure pg_cron extension is installed:
--    CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- 2. Schedule this cleanup function to run every 5 minutes:
--    SELECT cron.schedule('cleanup-expired-otps', '*/5 * * * *', 'SELECT udf_otp_cleanup()');
--
-- 3. To view scheduled jobs:
--    SELECT jobid, jobname, schedule, command FROM cron.job;
--
-- 4. To unschedule (if needed):
--    SELECT cron.unschedule('cleanup-expired-otps');
--
-- 5. To monitor job runs:
--    SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--
-- The recommended schedule is '*/5 * * * *' (every 5 minutes) but can be
-- adjusted based on expected OTP volume and cleanup requirements.
-- ============================================================================

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================
/*

-- Setup: Create OTPs with various expiration states
INSERT INTO user_otps (
    user_id, purpose, channel, destination, otp_hash, status, expires_at, created_at, updated_at
) VALUES
    -- Expired OTP (expires 5 minutes ago)
    (1, 'registration', 'email', 'user1@example.com', crypt('111111', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP - INTERVAL '5 minutes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    -- Expired OTP (expires 1 hour ago)
    (1, 'forgot_password', 'email', 'user1@example.com', crypt('222222', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    -- Valid OTP (expires in 5 minutes)
    (1, 'change_email', 'mobile', '+1234567890', crypt('333333', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP + INTERVAL '5 minutes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    -- Already verified OTP (should not be touched)
    (1, 'reset_password', 'email', 'user1@example.com', crypt('444444', gen_salt('bf')), 'verified', CURRENT_TIMESTAMP - INTERVAL '1 minute', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING id, purpose, status, expires_at;

-- Test: Run cleanup
SELECT udf_otp_cleanup();

-- Verify expired OTPs are marked as 'expired'
SELECT id, purpose, status, expires_at FROM user_otps WHERE user_id = 1 ORDER BY created_at DESC LIMIT 4;
-- Expected: first two should be 'expired', third should still be 'pending', fourth should still be 'verified'

-- Test: Run cleanup again (should find 0 new expired OTPs)
SELECT udf_otp_cleanup();

-- Setup: Create an OTP that will expire soon, then simulate time passing
INSERT INTO user_otps (
    user_id, purpose, channel, destination, otp_hash, status, expires_at, created_at, updated_at
) VALUES
    (1, 're_verification', 'mobile', '+9876543210', crypt('555555', gen_salt('bf')), 'pending', CURRENT_TIMESTAMP + INTERVAL '1 second', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING id, status;

-- Wait 2 seconds (or simulate with UPDATE)
-- SELECT pg_sleep(2);
-- Or manually update expires_at to past time:
UPDATE user_otps SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
WHERE purpose = 're_verification' AND status = 'pending';

-- Run cleanup again
SELECT udf_otp_cleanup();

-- Verify it was marked expired
SELECT id, status, expires_at FROM user_otps WHERE purpose = 're_verification';

*/
