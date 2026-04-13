-- ============================================================
-- Phase 0: Summary Table — Record Counts Cache
-- ============================================================
-- Purpose : Maintain a pre-aggregated summary of row counts
--           per table, avoiding expensive COUNT(*) queries.
-- Depends : phase-0/01_extensions.sql (citext)
-- ============================================================

CREATE TABLE table_summary (
    id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name   CITEXT      NOT NULL,
    is_active    INT         NOT NULL DEFAULT 0,
    is_deactive  INT         NOT NULL DEFAULT 0,
    is_deleted   INT         NOT NULL DEFAULT 0,
    total        INT GENERATED ALWAYS AS (is_active + is_deactive + is_deleted) STORED,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_table_summary_name UNIQUE (table_name)
);

-- =========================
-- Indexes
-- =========================

-- Fast lookup by table name (citext already case-insensitive via UNIQUE constraint).
-- pg_trgm GIN index for fuzzy / partial-match search on table names.
CREATE INDEX idx_table_summary_name_trgm
    ON table_summary USING GIN (table_name gin_trgm_ops);

-- Quick filter: find tables that still have active records.
CREATE INDEX idx_table_summary_active
    ON table_summary (is_active)
    WHERE is_active > 0;

-- Quick filter: find tables that have deleted records (soft-delete audit).
CREATE INDEX idx_table_summary_deleted
    ON table_summary (is_deleted)
    WHERE is_deleted > 0;

-- Sort / range queries on last-updated timestamp.
CREATE INDEX idx_table_summary_updated_at
    ON table_summary (updated_at DESC);
