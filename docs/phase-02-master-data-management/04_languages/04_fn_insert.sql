-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_languages_insert
-- PURPOSE:  Insert a new language with case-insensitive name uniqueness.
-- RETURNS:  JSONB { success, message, id }
--
-- Replaces `sp_languages_insert` with a UDF matching the API's JSONB contract.
-- `languages.name` is CITEXT UNIQUE, so duplicate checking is case-insensitive
-- by construction. We still pre-check so callers get a clean message instead
-- of a raw unique-violation error.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_languages_insert(
    p_name              TEXT,
    p_native_name       TEXT    DEFAULT NULL,
    p_iso_code          TEXT    DEFAULT NULL,
    p_script            TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT TRUE,
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id BIGINT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Language name cannot be empty.';
    END IF;

    -- ── Duplicate guard: case-insensitive name ──────────────
    IF EXISTS (
        SELECT 1 FROM languages
        WHERE name = btrim(p_name)::citext
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A language with name "%" already exists.', btrim(p_name);
    END IF;

    -- ── Duplicate guard: case-insensitive iso_code ──────────
    -- Docs promise 409 DUPLICATE_ENTRY if another language already uses the
    -- same isoCode. We compare lowercased copies so callers can pass any case.
    IF p_iso_code IS NOT NULL AND btrim(p_iso_code) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM languages
            WHERE lower(iso_code) = lower(btrim(p_iso_code))
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A language with iso_code "%" already exists.', lower(btrim(p_iso_code));
        END IF;
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO languages (
        name,
        native_name,
        iso_code,
        script,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        btrim(p_name)::citext,
        p_native_name,
        p_iso_code,
        p_script,
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Language inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting language: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_languages_insert(
--     p_name        := 'Tulu',
--     p_native_name := 'ತುಳು',
--     p_iso_code    := 'tcy',
--     p_script      := 'Kannada',
--     p_created_by  := 1
-- );
--
-- SELECT udf_languages_insert(p_name := 'Bhojpuri');
-- -- Should fail: duplicate
-- SELECT udf_languages_insert(p_name := 'Hindi');
-- -- Should fail: case-insensitive duplicate
-- SELECT udf_languages_insert(p_name := 'HINDI');
-- ══════════════════════════════════════════════════════════════════════════════
