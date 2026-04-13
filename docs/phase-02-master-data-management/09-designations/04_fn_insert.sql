-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_designations_insert
-- PURPOSE:  Insert a new designation with name + code uniqueness validation
--           and level_band whitelist enforcement.
-- RETURNS:  JSONB { success, message, id }
--
-- Replaces `sp_designations_insert` with a UDF matching the API's JSONB contract.
-- `code` is nullable but UNIQUE when present, so the duplicate check is only
-- executed when a non-empty code is supplied.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_designations_insert(
    p_name              TEXT,
    p_code              TEXT    DEFAULT NULL,
    p_level             INT     DEFAULT 1,
    p_level_band        TEXT    DEFAULT 'entry',
    p_description       TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT TRUE,
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id BIGINT;
    v_band   TEXT;
    v_code   CITEXT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Designation name cannot be empty.';
    END IF;

    v_band := COALESCE(btrim(p_level_band), 'entry');

    -- ── Validate level_band whitelist ───────────────────────
    IF v_band NOT IN (
        'intern', 'entry', 'mid', 'senior',
        'lead', 'manager', 'director', 'executive'
    ) THEN
        RAISE EXCEPTION 'Invalid level_band "%". Allowed: intern, entry, mid, senior, lead, manager, director, executive.', v_band;
    END IF;

    -- ── Duplicate guard: case-insensitive name ──────────────
    IF EXISTS (
        SELECT 1 FROM designations
        WHERE name = btrim(p_name)::citext
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A designation with name "%" already exists.', btrim(p_name);
    END IF;

    -- ── Duplicate guard for code (only when provided) ──────
    IF p_code IS NOT NULL AND btrim(p_code) <> '' THEN
        v_code := btrim(p_code)::citext;
        IF EXISTS (
            SELECT 1 FROM designations
            WHERE code = v_code
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A designation with code "%" already exists.', v_code::TEXT;
        END IF;
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO designations (
        name,
        code,
        level,
        level_band,
        description,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        btrim(p_name)::citext,
        v_code,                 -- may be NULL
        COALESCE(p_level, 1),
        v_band,
        p_description,
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Designation inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting designation: %s', SQLERRM),
        'id', NULL
    );
END;
$$;
