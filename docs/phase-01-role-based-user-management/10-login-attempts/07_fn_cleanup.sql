/**
 * ============================================================================
 * UDF_LOGIN_ATTEMPT_CLEANUP FUNCTION
 * ============================================================================
 * Purpose:
 *   - Hard delete old login attempt records beyond retention period
 *   - login_attempts is a security audit log, not a business entity
 *   - Safe to permanently remove records older than retention window
 *   - Returns {success: bool, message: string, count: int}
 *
 * Depends:
 *   - login_attempts table
 *   - pg_cron extension (for scheduling)
 *
 * Usage:
 *   -- Manual cleanup (keep last 90 days)
 *   SELECT udf_login_attempt_cleanup(p_retain_days => 90);
 *
 *   -- Schedule via pg_cron (nightly at 2 AM)
 *   SELECT cron.schedule('cleanup_login_attempts', '0 2 * * *',
 *     'SELECT udf_login_attempt_cleanup(90)');
 *
 * Logic:
 *   1. Delete all records where attempted_at < CURRENT_TIMESTAMP - p_retain_days
 *   2. Return count of deleted rows
 * ============================================================================
 */

CREATE OR REPLACE FUNCTION udf_login_attempt_cleanup(
  p_retain_days INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
  v_cutoff_date TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  -- Validate input
  IF p_retain_days <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'retain_days must be greater than 0',
      'count', 0
    );
  END IF;

  -- Calculate cutoff date
  v_cutoff_date := CURRENT_TIMESTAMP - (p_retain_days || ' days')::interval;

  -- Delete old records
  DELETE FROM login_attempts
  WHERE attempted_at < v_cutoff_date;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'message', 'Deleted ' || v_deleted_count || ' login attempt records older than ' || p_retain_days || ' days (cutoff: ' || v_cutoff_date || ')',
    'count', v_deleted_count,
    'cutoff_date', v_cutoff_date
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Error cleaning up login attempts: ' || SQLERRM,
    'count', 0
  );
END;
$$;

-- ============================================================================
-- PG_CRON SCHEDULING (if pg_cron is available)
-- ============================================================================
-- Uncomment and run the following to schedule automatic nightly cleanup:

/*
-- Create extension if not exists (requires superuser)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup to run every night at 2 AM UTC (retain 90 days)
SELECT cron.schedule(
  'cleanup_login_attempts',
  '0 2 * * *',
  'SELECT udf_login_attempt_cleanup(90);'
);

-- View scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'cleanup_login_attempts';

-- Unschedule if needed
SELECT cron.unschedule('cleanup_login_attempts');
*/

-- ============================================================================
-- TESTING / EXAMPLES (uncomment to run)
-- ============================================================================

/*
-- Insert some old test records (backdated)
INSERT INTO login_attempts (identifier, status, attempted_at)
VALUES
  ('old1@example.com', 'failed', CURRENT_TIMESTAMP - INTERVAL '120 days'),
  ('old2@example.com', 'success', CURRENT_TIMESTAMP - INTERVAL '100 days'),
  ('old3@example.com', 'failed', CURRENT_TIMESTAMP - INTERVAL '95 days'),
  ('recent@example.com', 'success', CURRENT_TIMESTAMP - INTERVAL '30 days');

-- Count records before cleanup
SELECT COUNT(*) as total_before FROM login_attempts;

-- Run cleanup (retain 90 days)
SELECT udf_login_attempt_cleanup(p_retain_days => 90);

-- Count records after cleanup
SELECT COUNT(*) as total_after FROM login_attempts;

-- Verify old records are gone but recent ones remain
SELECT identifier, attempted_at
  FROM login_attempts
  WHERE identifier LIKE 'old%' OR identifier = 'recent@example.com'
  ORDER BY attempted_at DESC;

-- Test with invalid retain_days
SELECT udf_login_attempt_cleanup(p_retain_days => -1);
SELECT udf_login_attempt_cleanup(p_retain_days => 0);

-- Test cleanup with large retention (should delete nothing)
SELECT udf_login_attempt_cleanup(p_retain_days => 365);
*/
