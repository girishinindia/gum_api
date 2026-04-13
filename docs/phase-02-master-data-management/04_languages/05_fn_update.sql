-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_languages_update
-- PURPOSE:  Update an existing language. NULL params leave fields untouched.
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_languages_update` with a UDF matching the API's JSONB contract.
-- Case-insensitive name uniqueness is enforced (excluding self) before the
-- UPDATE so callers get a clean message.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_languages_update(
    p_id                BIGINT,
    p_name              TEXT    DEFAULT NULL,
    p_native_name       TEXT    DEFAULT NULL,
    p_iso_code          TEXT    DEFAULT NULL,
    p_script            TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- ── Verify the language exists and is not soft-deleted ──
    IF NOT EXISTS (
        SELECT 1 FROM languages WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active language found with id %.', p_id;
    END IF;

    -- ── Duplicate guard (excluding self) ────────────────────
    IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM languages
            WHERE name = btrim(p_name)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A language with name "%" already exists.', btrim(p_name);
        END IF;
    END IF;

    -- ── Duplicate guard for iso_code (excluding self) ───────
    IF p_iso_code IS NOT NULL AND btrim(p_iso_code) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM languages
            WHERE lower(iso_code) = lower(btrim(p_iso_code))
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A language with iso_code "%" already exists.', lower(btrim(p_iso_code));
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE languages
    SET
        name        = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        native_name = COALESCE(p_native_name, native_name),
        iso_code    = COALESCE(p_iso_code, iso_code),
        script      = COALESCE(p_script, script),
        is_active   = COALESCE(p_is_active, is_active),
        updated_by  = COALESCE(p_updated_by, updated_by),
        updated_at  = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Language %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating language: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_languages_update(p_id := 23, p_native_name := 'हिंदी', p_updated_by := 1);
-- SELECT udf_languages_update(p_id := 1, p_name := 'English (Global)');
-- -- Should fail: duplicate
-- SELECT udf_languages_update(p_id := 2, p_name := 'English');
-- ══════════════════════════════════════════════════════════════════════════════
