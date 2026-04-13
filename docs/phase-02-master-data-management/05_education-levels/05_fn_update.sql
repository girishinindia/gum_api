-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_education_levels_update
-- PURPOSE:  Update an existing education level. NULL params leave fields
--           untouched.
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_education_levels_update` with a UDF matching the API's JSONB
-- contract. Validates category and enforces case-insensitive name
-- uniqueness (excluding self) before applying the UPDATE.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_education_levels_update(
    p_id                    BIGINT,
    p_name                  TEXT    DEFAULT NULL,
    p_level_order           INT     DEFAULT NULL,
    p_level_category        TEXT    DEFAULT NULL,
    p_abbreviation          TEXT    DEFAULT NULL,
    p_description           TEXT    DEFAULT NULL,
    p_typical_duration      TEXT    DEFAULT NULL,
    p_typical_age_range     TEXT    DEFAULT NULL,
    p_is_active             BOOLEAN DEFAULT NULL,
    p_updated_by            BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_category TEXT;
BEGIN
    -- ── Verify record exists and is not soft-deleted ────────
    IF NOT EXISTS (
        SELECT 1 FROM education_levels WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active education level found with id %.', p_id;
    END IF;

    -- ── Validate category if provided ───────────────────────
    IF p_level_category IS NOT NULL AND btrim(p_level_category) <> '' THEN
        v_category := btrim(p_level_category);
        IF v_category NOT IN (
            'pre_school', 'school', 'diploma', 'undergraduate',
            'postgraduate', 'doctoral', 'professional', 'informal', 'other'
        ) THEN
            RAISE EXCEPTION 'Invalid level_category "%". Allowed: pre_school, school, diploma, undergraduate, postgraduate, doctoral, professional, informal, other.', v_category;
        END IF;
    END IF;

    -- ── Duplicate name guard (excluding self) ───────────────
    IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM education_levels
            WHERE name = btrim(p_name)::citext
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'An education level with name "%" already exists.', btrim(p_name);
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE education_levels
    SET
        name              = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        abbreviation      = COALESCE(p_abbreviation, abbreviation),
        level_order       = COALESCE(p_level_order, level_order),
        level_category    = COALESCE(v_category, level_category),
        description       = COALESCE(p_description, description),
        typical_duration  = COALESCE(p_typical_duration, typical_duration),
        typical_age_range = COALESCE(p_typical_age_range, typical_age_range),
        is_active         = COALESCE(p_is_active, is_active),
        updated_by        = COALESCE(p_updated_by, updated_by),
        updated_at        = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Education level %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating education level: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_education_levels_update(p_id := 19, p_description := 'Updated description', p_updated_by := 1);
-- SELECT udf_education_levels_update(p_id := 19, p_name := 'Bachelor of Technology / B.Tech.');
-- -- Should fail: invalid category
-- SELECT udf_education_levels_update(p_id := 1, p_level_category := 'bogus');
-- -- Should fail: duplicate name
-- SELECT udf_education_levels_update(p_id := 20, p_name := 'Bachelor of Technology');
-- ══════════════════════════════════════════════════════════════════════════════
