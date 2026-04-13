-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_education_levels_insert
-- PURPOSE:  Insert a new education level with category + name uniqueness
--           validation.
-- RETURNS:  JSONB { success, message, id }
--
-- Replaces `sp_education_levels_insert` with a UDF matching the API's JSONB
-- contract. Category is validated against the same whitelist the table's
-- `chk_education_levels_category` CHECK enforces. `level_order` is NOT NULL
-- on the table, so it must be supplied on insert.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_education_levels_insert(
    p_name                  TEXT,
    p_level_order           INT,
    p_level_category        TEXT    DEFAULT 'other',
    p_abbreviation          TEXT    DEFAULT NULL,
    p_description           TEXT    DEFAULT NULL,
    p_typical_duration      TEXT    DEFAULT NULL,
    p_typical_age_range     TEXT    DEFAULT NULL,
    p_is_active             BOOLEAN DEFAULT TRUE,
    p_created_by            BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_id   BIGINT;
    v_category TEXT;
BEGIN
    -- ── Validate required fields ─────────────────────────────
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Education level name cannot be empty.';
    END IF;

    IF p_level_order IS NULL THEN
        RAISE EXCEPTION 'Education level order (level_order) is required.';
    END IF;

    v_category := COALESCE(btrim(p_level_category), 'other');

    -- ── Validate category whitelist ──────────────────────────
    IF v_category NOT IN (
        'pre_school', 'school', 'diploma', 'undergraduate',
        'postgraduate', 'doctoral', 'professional', 'informal', 'other'
    ) THEN
        RAISE EXCEPTION 'Invalid level_category "%". Allowed: pre_school, school, diploma, undergraduate, postgraduate, doctoral, professional, informal, other.', v_category;
    END IF;

    -- ── Duplicate guard: case-insensitive name ──────────────
    IF EXISTS (
        SELECT 1 FROM education_levels
        WHERE name = btrim(p_name)::citext
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'An education level with name "%" already exists.', btrim(p_name);
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO education_levels (
        name,
        abbreviation,
        level_order,
        level_category,
        description,
        typical_duration,
        typical_age_range,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        btrim(p_name)::citext,
        p_abbreviation,
        p_level_order,
        v_category,
        p_description,
        p_typical_duration,
        p_typical_age_range,
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Education level inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting education level: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_education_levels_insert(
--     p_name              := 'Bachelor of Veterinary Science',
--     p_abbreviation      := 'B.V.Sc.',
--     p_level_order       := 26,
--     p_level_category    := 'undergraduate',
--     p_description       := 'Undergraduate degree in veterinary medicine',
--     p_typical_duration  := '5.5 years',
--     p_typical_age_range := '18-24',
--     p_created_by        := 1
-- );
--
-- -- Should fail: duplicate name
-- SELECT udf_education_levels_insert(p_name := 'Bachelor of Technology', p_level_order := 19);
-- -- Should fail: invalid category
-- SELECT udf_education_levels_insert(p_name := 'Test Level', p_level_order := 99, p_level_category := 'bogus');
-- ══════════════════════════════════════════════════════════════════════════════
