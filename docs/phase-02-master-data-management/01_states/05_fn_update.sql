-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_states_update
-- PURPOSE:  Update an existing state. NULL params leave fields untouched.
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_states_update` with a UDF matching the API's JSONB contract.
--
-- Parent-country rule: if the caller is activating this state (or moving it
-- to a new parent country), the effective parent must exist, be active, and
-- not be soft-deleted.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_states_update(
    p_id                BIGINT,
    p_country_id        BIGINT  DEFAULT NULL,
    p_name              TEXT    DEFAULT NULL,
    p_languages         JSONB   DEFAULT NULL,
    p_website           TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_effective_country_id  BIGINT;
    v_country_active        BOOLEAN;
    v_country_deleted       BOOLEAN;
    v_country_name          TEXT;
BEGIN
    -- ── Verify the state exists and is not soft-deleted ──────
    IF NOT EXISTS (
        SELECT 1 FROM states WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active state found with id %.', p_id;
    END IF;

    -- ── Parent-country guard (only when activating) ──────────
    IF p_is_active IS TRUE THEN
        SELECT COALESCE(p_country_id, country_id)
        INTO v_effective_country_id
        FROM states
        WHERE id = p_id
          AND is_deleted = FALSE;

        SELECT is_active, is_deleted, name
        INTO v_country_active, v_country_deleted, v_country_name
        FROM countries
        WHERE id = v_effective_country_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent country not found for id %.', v_effective_country_id;
        END IF;

        IF v_country_deleted THEN
            RAISE EXCEPTION '% must not be deleted to activate current state.', v_country_name;
        END IF;

        IF NOT v_country_active THEN
            RAISE EXCEPTION '% must be active to activate current state.', v_country_name;
        END IF;

    ELSIF p_country_id IS NOT NULL THEN
        -- Moving to a new parent while not activating: parent must at least exist.
        IF NOT EXISTS (SELECT 1 FROM countries WHERE id = p_country_id) THEN
            RAISE EXCEPTION 'Parent country not found for id %.', p_country_id;
        END IF;
    END IF;

    -- ── Duplicate guard: same name within same country (excluding self) ──
    IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM states
            WHERE country_id = COALESCE(p_country_id, (SELECT country_id FROM states WHERE id = p_id))
              AND lower(btrim(name)) = lower(btrim(p_name))
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A state with name "%" already exists under that country.', btrim(p_name);
        END IF;
    END IF;

    -- ── Partial update (COALESCE keeps NULL = no change) ────
    UPDATE states
    SET
        country_id  = COALESCE(p_country_id, country_id),
        name        = COALESCE(NULLIF(btrim(p_name), ''), name),
        languages   = COALESCE(p_languages, languages),
        website     = COALESCE(p_website, website),
        is_active   = COALESCE(p_is_active, is_active),
        updated_by  = COALESCE(p_updated_by, updated_by),
        updated_at  = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('State %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating state: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_states_update(p_id := 1, p_name := 'Maharashtra (Updated)', p_updated_by := 1);
-- SELECT udf_states_update(p_id := 10, p_is_active := TRUE, p_updated_by := 1);
-- SELECT udf_states_update(p_id := 1, p_country_id := 2, p_updated_by := 1);
-- -- Should fail: activate under inactive country
-- SELECT udf_states_update(p_id := 1, p_country_id := 10, p_is_active := TRUE);
-- ══════════════════════════════════════════════════════════════════════════════
