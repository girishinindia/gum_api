-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_countries_update
-- PURPOSE:  Update an existing country. NULL params leave fields untouched.
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_countries_update` with a UDF matching the API's JSONB contract.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_countries_update(
    p_id                BIGINT,
    p_name              TEXT    DEFAULT NULL,
    p_iso2              TEXT    DEFAULT NULL,
    p_iso3              TEXT    DEFAULT NULL,
    p_phone_code        TEXT    DEFAULT NULL,
    p_currency          TEXT    DEFAULT NULL,
    p_currency_name     TEXT    DEFAULT NULL,
    p_currency_symbol   TEXT    DEFAULT NULL,
    p_national_language TEXT    DEFAULT NULL,
    p_nationality       TEXT    DEFAULT NULL,
    p_languages         JSONB   DEFAULT NULL,
    p_tld               TEXT    DEFAULT NULL,
    p_flag_image        TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_iso2 TEXT;
    v_iso3 TEXT;
BEGIN
    -- ── Verify record exists and is not soft-deleted ─────────
    IF NOT EXISTS (
        SELECT 1 FROM countries WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Country with ID % does not exist or is deleted.', p_id;
    END IF;

    -- ── Normalize + dedupe check iso2 ─────────────────────────
    IF p_iso2 IS NOT NULL AND btrim(p_iso2) <> '' THEN
        v_iso2 := upper(btrim(p_iso2));
        IF length(v_iso2) <> 2 THEN
            RAISE EXCEPTION 'Invalid iso2 code "%": must be exactly 2 characters.', v_iso2;
        END IF;
        IF EXISTS (
            SELECT 1 FROM countries
            WHERE iso2 = v_iso2 AND id <> p_id AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A country with iso2 "%" already exists.', v_iso2;
        END IF;
    END IF;

    -- ── Normalize + dedupe check iso3 ─────────────────────────
    IF p_iso3 IS NOT NULL AND btrim(p_iso3) <> '' THEN
        v_iso3 := upper(btrim(p_iso3));
        IF length(v_iso3) <> 3 THEN
            RAISE EXCEPTION 'Invalid iso3 code "%": must be exactly 3 characters.', v_iso3;
        END IF;
        IF EXISTS (
            SELECT 1 FROM countries
            WHERE iso3 = v_iso3 AND id <> p_id AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A country with iso3 "%" already exists.', v_iso3;
        END IF;
    END IF;

    -- ── Apply partial update (COALESCE keeps NULLs as "no change") ──
    UPDATE countries
    SET
        name              = COALESCE(NULLIF(btrim(p_name), ''), name),
        iso2              = COALESCE(v_iso2, iso2),
        iso3              = COALESCE(v_iso3, iso3),
        phone_code        = COALESCE(p_phone_code, phone_code),
        currency          = COALESCE(p_currency, currency),
        currency_name     = COALESCE(p_currency_name, currency_name),
        currency_symbol   = COALESCE(p_currency_symbol, currency_symbol),
        national_language = COALESCE(p_national_language, national_language),
        nationality       = COALESCE(p_nationality, nationality),
        languages         = COALESCE(p_languages, languages),
        tld               = COALESCE(p_tld, tld),
        flag_image        = COALESCE(p_flag_image, flag_image),
        is_active         = COALESCE(p_is_active, is_active),
        updated_by        = COALESCE(p_updated_by, updated_by),
        updated_at        = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Country %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating country: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_countries_update(p_id := 1, p_name := 'Republic of India', p_updated_by := 1);
-- SELECT udf_countries_update(p_id := 10, p_is_active := TRUE, p_updated_by := 1);
-- ══════════════════════════════════════════════════════════════════════════════
