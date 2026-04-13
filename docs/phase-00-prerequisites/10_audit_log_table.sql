-- ============================================================
-- Phase 0: Audit Log Table — Centralized Activity Tracking
-- ============================================================
-- Purpose : Track ALL operations across ALL tables — current
--           and future. Replaces per-table fields like last_login
--           with a unified, queryable audit trail.
--
-- Design  :
--   WHO   → user_id, user_email
--   WHAT  → table_name, record_id, operation, old/new values
--   WHEN  → created_at (immutable — never updated)
--   WHERE → ip_address, location fields
--   HOW   → device_type, os, browser, user_agent, endpoint
--
-- Policy  : Audit logs are IMMUTABLE — no UPDATE, no DELETE.
--           Partition by month for performance and archival.
--
-- Context : Application-layer fields (IP, device, etc.) are
--           passed via SET LOCAL session variables:
--             SET LOCAL app.user_id = '123';
--             SET LOCAL app.ip_address = '203.0.113.45';
--           The trigger reads these via current_setting().
--
-- Depends : 01_set_timezone.sql, 02_extensions.sql
-- ============================================================


-- =============================================
-- ENUM: audit_operation
-- =============================================
-- Extensible operation types covering CRUD + business events.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_operation') THEN
        CREATE TYPE audit_operation AS ENUM (
            'INSERT',
            'UPDATE',
            'SOFT_DELETE',
            'RESTORE',
            'LOGIN',
            'LOGOUT',
            'PASSWORD_CHANGE',
            'ROLE_CHANGE',
            'EXPORT',
            'IMPORT',
            'CUSTOM'
        );
    END IF;
END $$;


-- =============================================
-- ENUM: audit_device_type
-- =============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_device_type') THEN
        CREATE TYPE audit_device_type AS ENUM (
            'desktop',
            'mobile',
            'tablet',
            'api',
            'system',
            'unknown'
        );
    END IF;
END $$;


-- =============================================
-- ENUM: audit_action_source
-- =============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action_source') THEN
        CREATE TYPE audit_action_source AS ENUM (
            'api',
            'trigger',
            'cron',
            'manual',
            'migration',
            'system'
        );
    END IF;
END $$;


-- =============================================
-- ENUM: audit_severity
-- =============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_severity') THEN
        CREATE TYPE audit_severity AS ENUM (
            'info',
            'warning',
            'critical'
        );
    END IF;
END $$;


-- =============================================
-- TABLE: audit_logs (partitioned by month)
-- =============================================
-- Partitioned on created_at for performance.
-- Each month gets its own partition — fast queries,
-- easy archival, and DROP PARTITION for cleanup.

CREATE TABLE audit_logs (

    -- ── Identity ──
    id                  BIGINT              GENERATED ALWAYS AS IDENTITY,

    -- ── What Happened ──
    table_name          TEXT                NOT NULL,
    record_id           BIGINT,                                                 -- PK of the affected row (NULL for non-table events like LOGIN)
    operation           audit_operation     NOT NULL,
    old_values          JSONB,                                                  -- full row snapshot BEFORE change (NULL on INSERT)
    new_values          JSONB,                                                  -- full row snapshot AFTER change (NULL on DELETE)
    changed_fields      TEXT[],                                                 -- columns that actually changed (UPDATE only)

    -- ── Who Did It ──
    user_id             BIGINT,                                                 -- who performed the action (NULL = system/anonymous)
    user_email          TEXT,                                                   -- denormalized for fast audit reads

    -- ── Network / Location ──
    ip_address          INET,                                                   -- IPv4 or IPv6
    location            JSONB,                                                  -- optional, from device GPS / IP geolocation
                                                                                -- e.g. {"lat":19.076,"lng":72.877,"city":"Mumbai",
                                                                                --       "state":"Maharashtra","country":"India",
                                                                                --       "zip":"400001","timezone":"Asia/Kolkata",
                                                                                --       "accuracy":10.5,"source":"gps"}
                                                                                -- shape is flexible — mobile apps send what they have

    -- ── Device / Client ──
    user_agent          TEXT,                                                   -- raw User-Agent string
    device_type         audit_device_type   DEFAULT 'unknown',
    os                  TEXT,                                                   -- e.g. 'Windows 11', 'iOS 17', 'Android 14'
    browser             TEXT,                                                   -- e.g. 'Chrome 120', 'Safari 17'
    app_version         TEXT,                                                   -- frontend app version for debugging

    -- ── Request Context ──
    session_id          TEXT,                                                   -- groups actions within one login session
    request_id          TEXT,                                                   -- traces a single API call end-to-end
    endpoint            TEXT,                                                   -- API route: '/api/users/update'
    action_source       audit_action_source DEFAULT 'trigger',

    -- ── Metadata ──
    severity            audit_severity      NOT NULL DEFAULT 'info',
    description         TEXT,                                                   -- human-readable: 'User changed email from x to y'
    metadata            JSONB,                                                  -- catch-all for future fields

    -- ── Timestamp (immutable) ──
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ── Partition + PK ──
    -- Partitioned tables require the partition key in the PK
    PRIMARY KEY (id, created_at)

) PARTITION BY RANGE (created_at);


-- =============================================
-- Create Monthly Partitions
-- =============================================
-- Generate partitions for the current year + next year.
-- Run this section annually or via cron to add future months.

DO $$
DECLARE
    v_start DATE;
    v_end   DATE;
    v_name  TEXT;
BEGIN
    -- Current year partitions
    FOR m IN 1..12 LOOP
        v_start := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INT, m, 1);
        v_end   := v_start + INTERVAL '1 month';
        v_name  := 'audit_logs_' || to_char(v_start, 'YYYY_MM');

        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = v_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
                v_name, v_start, v_end
            );
        END IF;
    END LOOP;

    -- Next year partitions
    FOR m IN 1..12 LOOP
        v_start := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1, m, 1);
        v_end   := v_start + INTERVAL '1 month';
        v_name  := 'audit_logs_' || to_char(v_start, 'YYYY_MM');

        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = v_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
                v_name, v_start, v_end
            );
        END IF;
    END LOOP;
END $$;


-- =============================================
-- Indexes
-- =============================================
-- Indexes are created on the parent — PostgreSQL
-- automatically creates matching indexes on each partition.

-- Find all changes to a specific record
CREATE INDEX idx_audit_table_record
    ON audit_logs (table_name, record_id)
    WHERE record_id IS NOT NULL;

-- Find all actions by a user
CREATE INDEX idx_audit_user_id
    ON audit_logs (user_id)
    WHERE user_id IS NOT NULL;

-- Find all events of a specific operation type
CREATE INDEX idx_audit_operation
    ON audit_logs (operation);

-- Security investigation by IP
CREATE INDEX idx_audit_ip_address
    ON audit_logs (ip_address)
    WHERE ip_address IS NOT NULL;

-- Reconstruct a full session
CREATE INDEX idx_audit_session_id
    ON audit_logs (session_id)
    WHERE session_id IS NOT NULL;

-- Trace a single API request
CREATE INDEX idx_audit_request_id
    ON audit_logs (request_id)
    WHERE request_id IS NOT NULL;

-- Recent events first (most common query pattern)
CREATE INDEX idx_audit_created_at
    ON audit_logs (created_at DESC);

-- Severity-based alerts (find warnings and critical events)
CREATE INDEX idx_audit_severity
    ON audit_logs (severity)
    WHERE severity IN ('warning', 'critical');

-- JSONB path queries on new_values (e.g. find by email in payload)
CREATE INDEX idx_audit_new_values
    ON audit_logs USING GIN (new_values jsonb_path_ops)
    WHERE new_values IS NOT NULL;

-- Location queries (e.g. find all events from a country)
CREATE INDEX idx_audit_location
    ON audit_logs USING GIN (location jsonb_path_ops)
    WHERE location IS NOT NULL;

-- Combined: table + operation + time (common dashboard query)
CREATE INDEX idx_audit_table_op_time
    ON audit_logs (table_name, operation, created_at DESC);
