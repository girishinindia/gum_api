-- ============================================================
-- Phase 0: Register Audit Trigger Helper
-- ============================================================
-- Purpose : One-call helper to attach the audit trigger to
--           any source table. Same pattern as the existing
--           udf_register_summary_trigger.
-- Policy  : Audit trigger fires on INSERT and UPDATE only.
--           Soft delete = UPDATE, so it's already captured.
-- Skips   : audit_logs (itself), table_summary (system table).
-- Depends : 11_audit_trigger_function.sql (fn_audit_log_trigger)
-- Used By : 13_auto_register_event_trigger.sql (called from the DDL event trigger)
-- ============================================================


CREATE OR REPLACE FUNCTION udf_register_audit_trigger(p_table_name TEXT)
RETURNS TEXT
SET search_path = public
AS $$
DECLARE
    v_trigger_name TEXT;
BEGIN
    v_trigger_name := 'trg_audit_' || p_table_name;

    -- ── Skip system tables that should NOT be audited ──
    IF p_table_name IN ('audit_logs', 'table_summary') THEN
        RETURN format('SKIPPED %s — system table, not auditable', p_table_name);
    END IF;

    -- ── Verify the table exists in public schema ──
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = p_table_name
    ) THEN
        RETURN format('SKIPPED %s — table does not exist in public schema', p_table_name);
    END IF;

    -- ── Create audit trigger on the source table ──
    EXECUTE format(
        'CREATE OR REPLACE TRIGGER %I
         AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();',
        v_trigger_name,
        p_table_name
    );

    RETURN format('Audit trigger %s created on %s', v_trigger_name, p_table_name);
END;
$$ LANGUAGE plpgsql;


-- ══════════════════════════════════════════════════════════════════════════════
-- UTILITY: Register audit triggers on ALL existing tables
-- ══════════════════════════════════════════════════════════════════════════════
-- Run this once to attach audit triggers to tables that were
-- created BEFORE the event trigger (07) was updated.
-- Safe to re-run — CREATE OR REPLACE TRIGGER is idempotent.

CREATE OR REPLACE FUNCTION udf_register_all_audit_triggers()
RETURNS TABLE (result TEXT)
SET search_path = public
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename
        FROM   pg_tables
        WHERE  schemaname = 'public'
          AND  tablename NOT IN ('audit_logs', 'table_summary')
        ORDER BY tablename
    LOOP
        result := udf_register_audit_trigger(r.tablename);
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING QUERIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Register audit trigger on a single table
-- SELECT udf_register_audit_trigger('users');

-- Test 2: Register on all existing tables
-- SELECT * FROM udf_register_all_audit_triggers();

-- Test 3: Verify triggers exist
-- SELECT trigger_name, event_object_table, action_timing, event_manipulation
-- FROM information_schema.triggers
-- WHERE trigger_name LIKE 'trg_audit_%'
-- ORDER BY event_object_table;

-- ══════════════════════════════════════════════════════════════════════════════
