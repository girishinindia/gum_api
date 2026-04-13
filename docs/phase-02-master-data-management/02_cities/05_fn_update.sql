-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_cities_update
-- PURPOSE:  Update an existing city. NULL params leave fields untouched.
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_cities_update` with a UDF matching the API's JSONB contract.
-- Parent-state rule: if the caller is activating this city (or moving it to
-- a new parent state), the effective parent must exist, be active, and not
-- be soft-deleted.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_cities_update(
    p_id                BIGINT,
    p_state_id          BIGINT  DEFAULT NULL,
    p_name              TEXT    DEFAULT NULL,
    p_phonecode         TEXT    DEFAULT NULL,
    p_timezone          TEXT    DEFAULT NULL,
    p_website           TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_effective_state_id BIGINT;
    v_state_active       BOOLEAN;
    v_state_deleted      BOOLEAN;
    v_state_name         TEXT;
BEGIN
    -- ── Verify the city exists and is not soft-deleted ──────
    IF NOT EXISTS (
        SELECT 1 FROM cities WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active city found with id %.', p_id;
    END IF;

    -- ── Parent-state guard (only when activating) ───────────
    IF p_is_active IS TRUE THEN
        SELECT COALESCE(p_state_id, state_id)
        INTO v_effective_state_id
        FROM cities
        WHERE id = p_id
          AND is_deleted = FALSE;

        SELECT is_active, is_deleted, name
        INTO v_state_active, v_state_deleted, v_state_name
        FROM states
        WHERE id = v_effective_state_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent state not found for id %.', v_effective_state_id;
        END IF;

        IF v_state_deleted THEN
            RAISE EXCEPTION '% must not be deleted to activate current city.', v_state_name;
        END IF;

        IF NOT v_state_active THEN
            RAISE EXCEPTION '% must be active to activate current city.', v_state_name;
        END IF;

    ELSIF p_state_id IS NOT NULL THEN
        -- Moving to a new parent without activating: parent must at least exist.
        IF NOT EXISTS (SELECT 1 FROM states WHERE id = p_state_id) THEN
            RAISE EXCEPTION 'Parent state not found for id %.', p_state_id;
        END IF;
    END IF;

    -- ── Duplicate guard: same name within same state ────────
    IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM cities
            WHERE state_id = COALESCE(p_state_id, (SELECT state_id FROM cities WHERE id = p_id))
              AND lower(btrim(name)) = lower(btrim(p_name))
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A city with name "%" already exists under that state.', btrim(p_name);
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE cities
    SET
        state_id   = COALESCE(p_state_id, state_id),
        name       = COALESCE(NULLIF(btrim(p_name), ''), name),
        phonecode  = COALESCE(p_phonecode, phonecode),
        timezone   = COALESCE(p_timezone, timezone),
        website    = COALESCE(p_website, website),
        is_active  = COALESCE(p_is_active, is_active),
        updated_by = COALESCE(p_updated_by, updated_by),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('City %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating city: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_cities_update(p_id := 1, p_name := 'Mumbai (Updated)', p_updated_by := 1);
-- SELECT udf_cities_update(p_id := 12, p_is_active := TRUE, p_updated_by := 1);
-- -- Should fail: activating under inactive state
-- SELECT udf_cities_update(p_id := 1, p_state_id := 10, p_is_active := TRUE);
-- ══════════════════════════════════════════════════════════════════════════════
