-- ============================================================
-- Phase 0: Set Database Timezone (India)
-- ============================================================
-- Purpose : Set the default timezone for the database to
--           Asia/Kolkata (IST — UTC+5:30).
-- Why     : Ensures all TIMESTAMPTZ values, NOW(),
--           CURRENT_TIMESTAMP, and pg_cron schedules
--           operate in Indian Standard Time.
-- Run     : Must be executed BEFORE any table or cron job
--           creation so all timestamps are consistent.
-- ============================================================

ALTER DATABASE growupmore_enterprise_db SET timezone TO 'Asia/Kolkata';

-- Apply immediately for the current session as well
SET timezone TO 'Asia/Kolkata';
