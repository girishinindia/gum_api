-- ============================================================
-- Phase 0: Scheduled Cron Job — Weekly Sync Repair
-- ============================================================
-- Purpose : Automatically sync all table_summary counts
--           every Monday morning at 01:00 AM IST.
-- Depends : 02_extensions.sql (pg_cron)
--           08_sync_repair.sql (udf_sync_all_table_summaries)
-- Timezone: Asia/Kolkata (set in 01_set_timezone.sql)
--
-- pg_cron schedule format: ┌───── minute (0-59)
--                          │ ┌─── hour (0-23)
--                          │ │ ┌─ day of month (1-31)
--                          │ │ │ ┌ month (1-12)
--                          │ │ │ │ ┌ day of week (0=Sun, 1=Mon...6=Sat)
--                          │ │ │ │ │
--                          0 1 * * 1  = Monday 01:00 AM
-- ============================================================

-- Remove old job if exists (idempotent re-run)
SELECT cron.unschedule('weekly_sync_table_summary')
WHERE EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'weekly_sync_table_summary'
);

-- Schedule: Every Monday at 01:00 AM
SELECT cron.schedule(
    'weekly_sync_table_summary',            -- job name
    '0 1 * * 1',                            -- cron expression: Monday 01:00 AM
    $$SELECT udf_sync_all_table_summaries()$$    -- SQL to execute
);
