-- ============================================================
-- Phase 0: Trigger Functions
-- ============================================================
-- 1. fn_update_updated_at_column() — auto-set updated_at on UPDATE
-- 2. fn_manage_table_summary()     — maintain table_summary counts
-- 3. udf_generate_slug()           — pure function: text → URL slug
-- 4. fn_auto_slug()                — trigger: auto-generate slug on INSERT/UPDATE
-- 5. fn_backfill_slug()            — trigger: backfill parent slug from translation
-- 6. fn_courses_pricing_sync()     — trigger: auto-calc third pricing field
-- ============================================================
-- Depends : 02_extensions.sql (unaccent)
--           02_summary_table.sql (table_summary)
--           04_seed_summary_function.sql (udf_seed_summary_row)
-- Used By : Every table's trg_*_updated_at trigger (function 1)
--           06 register helper (function 2)
--           Tables with slug fields (functions 3-5)
-- ============================================================


-- =============================================
-- FUNCTION 1: fn_update_updated_at_column
-- =============================================
-- Purpose : Set updated_at = NOW() on every UPDATE.
-- Attached: BEFORE UPDATE trigger on every table.
-- =============================================

CREATE OR REPLACE FUNCTION fn_update_updated_at_column()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================
-- FUNCTION 2: fn_manage_table_summary
-- =============================================
-- Purpose : Automatically update table_summary counts when
--           any source table has INSERT or UPDATE.
-- Policy  : SOFT DELETE ONLY — no hard deletes in this system.
--           Deleting = UPDATE is_deleted = TRUE.
-- =============================================

CREATE OR REPLACE FUNCTION fn_manage_table_summary()
RETURNS TRIGGER
SET search_path = public
AS $$
DECLARE
    v_active_delta   INT := 0;
    v_deactive_delta INT := 0;
    v_deleted_delta  INT := 0;
BEGIN

    -- ── INSERT ─────────────────────────────────
    IF TG_OP = 'INSERT' THEN

        -- Auto-create summary row on first insert
        PERFORM udf_seed_summary_row(TG_TABLE_NAME);

        -- Which bucket does the new row go into?
        IF NEW.is_deleted = TRUE THEN
            v_deleted_delta  := 1;
        ELSIF NEW.is_active = TRUE THEN
            v_active_delta   := 1;
        ELSE
            v_deactive_delta := 1;
        END IF;

    -- ── UPDATE (includes soft delete: is_deleted = TRUE) ──
    ELSIF TG_OP = 'UPDATE' THEN

        -- Step A: Remove from OLD bucket (-1)
        IF OLD.is_deleted = TRUE THEN
            v_deleted_delta  := -1;
        ELSIF OLD.is_active = TRUE THEN
            v_active_delta   := -1;
        ELSE
            v_deactive_delta := -1;
        END IF;

        -- Step B: Add to NEW bucket (+1)
        IF NEW.is_deleted = TRUE THEN
            v_deleted_delta  := v_deleted_delta  + 1;
        ELSIF NEW.is_active = TRUE THEN
            v_active_delta   := v_active_delta   + 1;
        ELSE
            v_deactive_delta := v_deactive_delta + 1;
        END IF;

    END IF;

    -- Apply deltas to summary table
    UPDATE table_summary
    SET
        is_active   = GREATEST(0, is_active   + v_active_delta),
        is_deactive = GREATEST(0, is_deactive + v_deactive_delta),
        is_deleted  = GREATEST(0, is_deleted  + v_deleted_delta),
        updated_at  = CURRENT_TIMESTAMP
    WHERE table_name = TG_TABLE_NAME;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================
-- FUNCTION 3: udf_generate_slug (pure utility)
-- =============================================
-- Purpose : Convert any text into a URL-friendly slug.
-- Logic   : unaccent → lowercase → strip non-alphanumeric
--           → collapse whitespace/hyphens → trim hyphens.
-- Usage   : SELECT udf_generate_slug('Advanced AI & ML with Python');
--           → 'advanced-ai-ml-with-python'
-- Immutable: safe for indexes and generated columns.
-- =============================================

CREATE OR REPLACE FUNCTION udf_generate_slug(input TEXT)
RETURNS TEXT
SET search_path = public
AS $$
BEGIN
    IF input IS NULL OR length(trim(input)) = 0 THEN
        RETURN NULL;
    END IF;

    RETURN trim(both '-' from
        regexp_replace(
            regexp_replace(
                lower(unaccent(trim(input))),
                '[^a-z0-9\s-]', '', 'g'         -- strip non-alphanumeric
            ),
            '[\s-]+', '-', 'g'                   -- collapse spaces/hyphens
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- =============================================
-- FUNCTION 4: fn_auto_slug (trigger)
-- =============================================
-- Purpose : Auto-generate slug on INSERT or UPDATE.
-- Logic   :
--   1. If slug is provided → normalize it via udf_generate_slug()
--   2. If slug is empty/NULL → generate from source column
--      Source column name passed as TG_ARGV[0] (e.g., 'code')
-- Attach  : BEFORE INSERT OR UPDATE trigger on base tables.
-- =============================================

CREATE OR REPLACE FUNCTION fn_auto_slug()
RETURNS TRIGGER
SET search_path = public
AS $$
DECLARE
    v_source TEXT;
    v_json   JSONB;
BEGIN
    -- 1. If slug already provided, just normalize it
    IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
        NEW.slug = udf_generate_slug(NEW.slug);
        RETURN NEW;
    END IF;

    -- 2. Auto-generate from source column (if argument provided)
    IF TG_NARGS > 0 THEN
        v_json   := row_to_json(NEW)::JSONB;
        v_source := v_json ->> TG_ARGV[0];

        IF v_source IS NOT NULL AND length(trim(v_source)) > 0 THEN
            NEW.slug = udf_generate_slug(v_source);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================
-- FUNCTION 5: fn_backfill_slug (trigger)
-- =============================================
-- Purpose : When a translation row is inserted, backfill
--           the parent table's slug if it is still NULL.
-- Args    :
--   TG_ARGV[0] = parent table name (e.g., 'chapters')
--   TG_ARGV[1] = FK column in translation (e.g., 'chapter_id')
--   TG_ARGV[2] = source column for slug (e.g., 'name')
-- Attach  : AFTER INSERT trigger on translation tables.
-- =============================================

CREATE OR REPLACE FUNCTION fn_backfill_slug()
RETURNS TRIGGER
SET search_path = public
AS $$
DECLARE
    v_parent_table TEXT;
    v_fk_column    TEXT;
    v_source_col   TEXT;
    v_json         JSONB;
    v_fk_value     BIGINT;
    v_source_value TEXT;
    v_slug         TEXT;
BEGIN
    v_parent_table := TG_ARGV[0];
    v_fk_column    := TG_ARGV[1];
    v_source_col   := TG_ARGV[2];

    -- Extract values from NEW row dynamically
    v_json         := row_to_json(NEW)::JSONB;
    v_fk_value     := (v_json ->> v_fk_column)::BIGINT;
    v_source_value := v_json ->> v_source_col;

    IF v_source_value IS NULL OR length(trim(v_source_value)) = 0 THEN
        RETURN NEW;
    END IF;

    v_slug := udf_generate_slug(v_source_value);

    -- Only backfill if parent slug is currently NULL or empty
    EXECUTE format(
        'UPDATE %I SET slug = $1 WHERE id = $2 AND (slug IS NULL OR slug = '''')',
        v_parent_table
    ) USING v_slug, v_fk_value;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================
-- FUNCTION 6: fn_courses_pricing_sync (trigger)
-- =============================================
-- Purpose : Auto-calculate the third pricing field when any
--           two of (price, original_price, discount_percentage)
--           are provided on INSERT or UPDATE.
-- Logic   :
--   Priority 1: original_price + discount → price
--   Priority 2: original_price + price    → discount
--   Priority 3: price + discount          → original_price
--   Clear  : If discount = 0 or NULL, reset original_price & discount
-- Attach  : BEFORE INSERT OR UPDATE trigger on courses.
-- =============================================

CREATE OR REPLACE FUNCTION fn_courses_pricing_sync()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    -- Guard: discount must be 0–100
    IF NEW.discount_percentage IS NOT NULL THEN
        IF NEW.discount_percentage < 0 OR NEW.discount_percentage >= 100 THEN
            RAISE EXCEPTION 'discount_percentage must be >= 0 and < 100, got %', NEW.discount_percentage;
        END IF;
    END IF;

    -- Guard: original_price must be > 0 when provided
    IF NEW.original_price IS NOT NULL AND NEW.original_price <= 0 THEN
        RAISE EXCEPTION 'original_price must be > 0, got %', NEW.original_price;
    END IF;

    -- Case 0: No discount / zero discount → clear derived fields
    IF NEW.discount_percentage IS NULL OR NEW.discount_percentage = 0 THEN
        NEW.discount_percentage := NULL;
        NEW.original_price      := NULL;
        RETURN NEW;
    END IF;

    -- Case 1: original_price + discount_percentage → derive price
    IF NEW.original_price IS NOT NULL AND NEW.discount_percentage IS NOT NULL THEN
        NEW.price := ROUND(NEW.original_price * (1 - NEW.discount_percentage / 100), 2);
        RETURN NEW;
    END IF;

    -- Case 2: price + discount_percentage → derive original_price
    IF NEW.price IS NOT NULL AND NEW.price > 0 AND NEW.discount_percentage IS NOT NULL THEN
        NEW.original_price := ROUND(NEW.price / (1 - NEW.discount_percentage / 100), 2);
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
