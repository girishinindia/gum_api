-- ============================================================
-- Phase 0: Auto-Register Event Trigger
-- ============================================================
-- Purpose : Fully automatic — when ANY table is created,
--           this event trigger will:
--             1. Auto-attach summary trigger (if is_active/is_deleted exist)
--             2. Auto-attach audit trigger (on ALL tables)
--
--           ZERO manual registration needed after this file!
--
-- Depends : 04_seed_summary_function.sql    (udf_seed_summary_row)
--           05_trigger_function.sql          (fn_manage_table_summary)
--           06_register_helper.sql           (udf_register_summary_trigger)
--           10_audit_log_table.sql           (audit_logs parent + partitions)
--           11_audit_trigger_function.sql    (fn_audit_log_trigger)
--           12_audit_register_helper.sql     (udf_register_audit_trigger)
--
-- IMPORTANT: This file MUST run LAST in phase-00 so that:
--   (a) all helper functions it calls already exist, and
--   (b) all phase-00 tables (audit_logs + partitions) are already
--       created before the event trigger is installed, so those
--       creates don't accidentally invoke the trigger.
--
-- How it works:
--   CREATE TABLE countries (... is_active BOOLEAN ... is_deleted BOOLEAN ...)
--       ↓ event trigger fires automatically
--   udf_register_summary_trigger('countries')  → summary counts
--   udf_register_audit_trigger('countries')     → audit trail
--
-- Skipped automatically:
--   - Tables in pg_catalog / information_schema / pg_toast
--   - System tables: table_summary, audit_logs
--   - Partition children (e.g. audit_logs_2026_01) — detected via
--     pg_class.relispartition. This protects against the weekly
--     cron that may add future audit_logs partitions.
-- ============================================================

-- =============================================
-- Event trigger function
-- =============================================
CREATE OR REPLACE FUNCTION fn_auto_register_summary_on_create()
RETURNS EVENT_TRIGGER
SET search_path = public
AS $$
DECLARE
    r      RECORD;
    v_msg  TEXT;
BEGIN
    FOR r IN
        SELECT objid,
               objid::regclass::text AS table_name,
               schema_name
        FROM   pg_event_trigger_ddl_commands()
        WHERE  command_tag = 'CREATE TABLE'
          AND  object_type = 'table'
          AND  schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    LOOP
        -- ── Skip partition children ──
        -- Partition creates arrive with command_tag = 'CREATE TABLE',
        -- but they should inherit behavior from the parent, not get
        -- their own summary/audit triggers.
        IF EXISTS (
            SELECT 1 FROM pg_class
            WHERE oid = r.objid AND relispartition = TRUE
        ) THEN
            CONTINUE;
        END IF;

        -- ── Skip system tables ──
        IF r.table_name IN ('table_summary', 'audit_logs') THEN
            CONTINUE;
        END IF;

        -- ── 1. Register summary trigger ──
        -- udf_register_summary_trigger has built-in column check
        -- and will SKIP tables without is_active/is_deleted.
        -- Defensive check: only call if helper exists (guards against
        -- being invoked before phase-00 is fully loaded).
        IF EXISTS (
            SELECT 1 FROM pg_proc
            WHERE proname = 'udf_register_summary_trigger'
        ) THEN
            EXECUTE format('SELECT udf_register_summary_trigger(%L)', r.table_name)
            INTO v_msg;
            RAISE NOTICE '%', v_msg;
        END IF;

        -- ── 2. Register audit trigger ──
        -- Attaches audit trail to ALL new tables automatically.
        IF EXISTS (
            SELECT 1 FROM pg_proc
            WHERE proname = 'udf_register_audit_trigger'
        ) THEN
            EXECUTE format('SELECT udf_register_audit_trigger(%L)', r.table_name)
            INTO v_msg;
            RAISE NOTICE '%', v_msg;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Attach to DDL event
-- =============================================
-- Drop old event trigger if exists (from previous versions)
DROP EVENT TRIGGER IF EXISTS trg_auto_seed_summary_on_create;
DROP EVENT TRIGGER IF EXISTS trg_auto_register_summary_on_create;

-- Create the comprehensive event trigger (summary + audit)
CREATE EVENT TRIGGER trg_auto_register_summary_on_create
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE')
    EXECUTE FUNCTION fn_auto_register_summary_on_create();
