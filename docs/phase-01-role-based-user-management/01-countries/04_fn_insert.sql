-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_countries_insert
-- PURPOSE:  Insert a new country with validation.
-- RETURNS:  JSONB { success, message, id }
--
-- This replaces the older `sp_countries_insert` PROCEDURE. The API layer calls
-- UDFs via `db.callFunction`, which expects a JSONB contract of
-- { success, message, id? }. Any RAISE EXCEPTION is mapped into the FALSE
-- branch in the EXCEPTION handler at the bottom of the function body.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_countries_insert(
    p_name              TEXT,
    p_iso2              TEXT,
    p_iso3              TEXT,
    p_phone_code        TEXT    DEFAULT NULL,
    p_currency          TEXT    DEFAULT NULL,
    p_currency_name     TEXT    DEFAULT NULL,
    p_currency_symbol   TEXT    DEFAULT NULL,
    p_national_language TEXT    DEFAULT NULL,
    p_nationality       TEXT    DEFAULT NULL,
    p_languages         JSONB   DEFAULT '[]'::jsonb,
    p_tld               TEXT    DEFAULT NULL,
    p_flag_image        TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT TRUE,
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id BIGINT;
    v_iso2   TEXT;
    v_iso3   TEXT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Country name cannot be empty.';
    END IF;

    IF p_iso2 IS NULL OR btrim(p_iso2) = '' THEN
        RAISE EXCEPTION 'Country iso2 cannot be empty.';
    END IF;

    IF p_iso3 IS NULL OR btrim(p_iso3) = '' THEN
        RAISE EXCEPTION 'Country iso3 cannot be empty.';
    END IF;

    -- ── Normalize ISO codes to upper-case ─────────────────────
    v_iso2 := upper(btrim(p_iso2));
    v_iso3 := upper(btrim(p_iso3));

    IF length(v_iso2) <> 2 THEN
        RAISE EXCEPTION 'Invalid iso2 code "%": must be exactly 2 characters.', v_iso2;
    END IF;

    IF length(v_iso3) <> 3 THEN
        RAISE EXCEPTION 'Invalid iso3 code "%": must be exactly 3 characters.', v_iso3;
    END IF;

    -- ── Duplicate guards (respect soft-delete) ────────────────
    IF EXISTS (SELECT 1 FROM countries WHERE iso2 = v_iso2 AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'A country with iso2 "%" already exists.', v_iso2;
    END IF;

    IF EXISTS (SELECT 1 FROM countries WHERE iso3 = v_iso3 AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'A country with iso3 "%" already exists.', v_iso3;
    END IF;

    -- ── Insert ────────────────────────────────────────────────
    INSERT INTO countries (
        name,
        iso2,
        iso3,
        phone_code,
        currency,
        currency_name,
        currency_symbol,
        national_language,
        nationality,
        languages,
        tld,
        flag_image,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        btrim(p_name),
        v_iso2,
        v_iso3,
        p_phone_code,
        p_currency,
        p_currency_name,
        p_currency_symbol,
        p_national_language,
        p_nationality,
        COALESCE(p_languages, '[]'::jsonb),
        p_tld,
        p_flag_image,
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Country inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting country: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_countries_insert(
--     p_name            := 'Singapore',
--     p_iso2            := 'SG',
--     p_iso3            := 'SGP',
--     p_phone_code      := '+65',
--     p_currency        := 'SGD',
--     p_currency_name   := 'Singapore Dollar',
--     p_currency_symbol := 'S$',
--     p_created_by      := 1
-- );
-- ══════════════════════════════════════════════════════════════════════════════
