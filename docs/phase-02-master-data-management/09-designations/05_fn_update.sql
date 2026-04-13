-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_designations_update
-- PURPOSE:  Update an existing designation. NULL params leave fields untouched.
--           Validates level_band whitelist and name + code uniqueness
--           (excluding self).
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_designations_update(
    p_id                BIGINT,
    p_name              TEXT    DEFAULT NULL,
    p_code              TEXT    DEFAULT NULL,
    p_level             INT     DEFAULT NULL,
    p_level_band        TEXT    DEFAULT NULL,
    p_description       TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_band   TEXT;
    v_code   CITEXT;
BEGIN
    -- ── Verify the record exists and is not soft-deleted ────
    IF NOT EXISTS (
        SELECT 1 FROM designations WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active designation found with id %.', p_id;
    END IF;

    -- ── Validate level_band if provided ─────────────────────
    IF p_level_band IS NOT NULL AND btrim(p_level_band) <> '' THEN
        v_band := btrim(p_level_band);
        IF v_band NOT IN (
            'intern', 'entry', 'mid', 'senior',
            'lead', 'manager', 'director', 'executive'
        ) THEN
            RAISE EXCEPTION 'Invalid level_band "%". Allowed: intern, entry, mid, senior, lead, manager, director, executive.', v_band;
        END IF;
    END IF;

    -- ── Duplicate guard on name (excluding self) ────────────
    IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM designations
            WHERE name = btrim(p_name)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A designation with name "%" already exists.', btrim(p_name);
        END IF;
    END IF;

    -- ── Duplicate guard on code (excluding self) ────────────
    IF p_code IS NOT NULL AND btrim(p_code) <> '' THEN
        v_code := btrim(p_code)::citext;
        IF EXISTS (
            SELECT 1 FROM designations
            WHERE code = v_code
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A designation with code "%" already exists.', v_code::TEXT;
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE designations
    SET
        name        = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        code        = COALESCE(v_code, code),
        level       = COALESCE(p_level, level),
        level_band  = COALESCE(v_band, level_band),
        description = COALESCE(p_description, description),
        is_active   = COALESCE(p_is_active, is_active),
        updated_by  = COALESCE(p_updated_by, updated_by),
        updated_at  = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Designation %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating designation: %s', SQLERRM)
    );
END;
$$;
