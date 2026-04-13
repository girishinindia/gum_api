-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_cities_insert
-- PURPOSE:  Insert a new city with parent-state active/deleted guard.
-- RETURNS:  JSONB { success, message, id }
--
-- Replaces `sp_cities_insert` with a UDF matching the API's JSONB contract.
-- Parent-state rule: if the new city is being created as active
-- (p_is_active = TRUE), its parent state must exist, be active, and not be
-- soft-deleted.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_cities_insert(
    p_state_id          BIGINT,
    p_name              TEXT,
    p_phonecode         TEXT    DEFAULT NULL,
    p_timezone          TEXT    DEFAULT NULL,
    p_website           TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT FALSE,
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id        BIGINT;
    v_state_active  BOOLEAN;
    v_state_deleted BOOLEAN;
    v_state_name    TEXT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_state_id IS NULL THEN
        RAISE EXCEPTION 'City state_id cannot be null.';
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'City name cannot be empty.';
    END IF;

    -- ── Parent-state guard (only when activating) ────────────
    IF p_is_active THEN
        SELECT is_active, is_deleted, name
        INTO v_state_active, v_state_deleted, v_state_name
        FROM states
        WHERE id = p_state_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent state not found for id %.', p_state_id;
        END IF;

        IF v_state_deleted THEN
            RAISE EXCEPTION '% must not be deleted to activate current city.', v_state_name;
        END IF;

        IF NOT v_state_active THEN
            RAISE EXCEPTION '% must be active to activate current city.', v_state_name;
        END IF;
    ELSE
        -- Even when inactive, the parent must still exist.
        IF NOT EXISTS (SELECT 1 FROM states WHERE id = p_state_id) THEN
            RAISE EXCEPTION 'Parent state not found for id %.', p_state_id;
        END IF;
    END IF;

    -- ── Duplicate guard: same name within same state ─────────
    IF EXISTS (
        SELECT 1 FROM cities
        WHERE state_id = p_state_id
          AND lower(btrim(name)) = lower(btrim(p_name))
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A city with name "%" already exists under state id %.', btrim(p_name), p_state_id;
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO cities (
        state_id,
        name,
        phonecode,
        timezone,
        website,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        p_state_id,
        btrim(p_name),
        p_phonecode,
        p_timezone,
        p_website,
        COALESCE(p_is_active, FALSE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('City inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting city: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_cities_insert(
--     p_state_id   := 1,
--     p_name       := 'Nashik',
--     p_phonecode  := '0253',
--     p_timezone   := 'Asia/Kolkata',
--     p_website    := 'https://nashik.gov.in',
--     p_is_active  := TRUE,
--     p_created_by := 1
-- );
--
-- SELECT udf_cities_insert(p_state_id := 1, p_name := 'Aurangabad');
-- -- Should fail: non-existent state
-- SELECT udf_cities_insert(p_state_id := 99999, p_name := 'Ghost', p_is_active := TRUE);
-- -- Should fail: activating under inactive state
-- SELECT udf_cities_insert(p_state_id := 10, p_name := 'Glasgow', p_is_active := TRUE);
-- ══════════════════════════════════════════════════════════════════════════════
