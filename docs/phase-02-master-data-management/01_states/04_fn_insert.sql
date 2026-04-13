-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_states_insert
-- PURPOSE:  Insert a new state with parent-country active/deleted guard.
-- RETURNS:  JSONB { success, message, id }
--
-- Replaces `sp_states_insert` with a UDF matching the API's JSONB contract.
-- The API layer calls UDFs via `db.callFunction`, which expects a JSONB
-- contract of { success, message, id? }. Any RAISE EXCEPTION is mapped into
-- the FALSE branch in the EXCEPTION handler at the bottom of the body.
--
-- Parent-country rule: if the new state is being created as active
-- (p_is_active = TRUE), its parent country must exist, be active, and not be
-- soft-deleted. Inactive states can be created under inactive countries so
-- data entry doesn't block on activation state.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_states_insert(
    p_country_id        BIGINT,
    p_name              TEXT,
    p_languages         JSONB   DEFAULT '[]'::jsonb,
    p_website           TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT FALSE,
    p_created_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id          BIGINT;
    v_country_active  BOOLEAN;
    v_country_deleted BOOLEAN;
    v_country_name    TEXT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_country_id IS NULL THEN
        RAISE EXCEPTION 'State country_id cannot be null.';
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'State name cannot be empty.';
    END IF;

    -- ── Parent-country guard (only when activating) ──────────
    IF p_is_active THEN
        SELECT is_active, is_deleted, name
        INTO v_country_active, v_country_deleted, v_country_name
        FROM countries
        WHERE id = p_country_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent country not found for id %.', p_country_id;
        END IF;

        IF v_country_deleted THEN
            RAISE EXCEPTION '% must not be deleted to activate current state.', v_country_name;
        END IF;

        IF NOT v_country_active THEN
            RAISE EXCEPTION '% must be active to activate current state.', v_country_name;
        END IF;
    ELSE
        -- Even when inactive, the parent must still exist.
        IF NOT EXISTS (SELECT 1 FROM countries WHERE id = p_country_id) THEN
            RAISE EXCEPTION 'Parent country not found for id %.', p_country_id;
        END IF;
    END IF;

    -- ── Duplicate guard: same name within same country ───────
    IF EXISTS (
        SELECT 1 FROM states
        WHERE country_id = p_country_id
          AND lower(btrim(name)) = lower(btrim(p_name))
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A state with name "%" already exists under country id %.', btrim(p_name), p_country_id;
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO states (
        country_id,
        name,
        languages,
        website,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        p_country_id,
        btrim(p_name),
        COALESCE(p_languages, '[]'::jsonb),
        p_website,
        COALESCE(p_is_active, FALSE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('State inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting state: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_states_insert(
--     p_country_id := 1,
--     p_name       := 'Uttar Pradesh',
--     p_languages  := '["Hindi","Urdu","English"]'::jsonb,
--     p_website    := 'https://up.gov.in',
--     p_is_active  := TRUE,
--     p_created_by := 1
-- );
--
-- SELECT udf_states_insert(p_country_id := 1, p_name := 'Madhya Pradesh');
--
-- -- Should fail: non-existent country
-- SELECT udf_states_insert(p_country_id := 99999, p_name := 'Ghost State', p_is_active := TRUE);
--
-- -- Should fail: inactive parent country
-- SELECT udf_states_insert(p_country_id := 10, p_name := 'Dubai', p_is_active := TRUE);
-- ══════════════════════════════════════════════════════════════════════════════
