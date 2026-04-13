-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_skills_update
-- PURPOSE:  Update an existing skill. NULL params leave fields untouched.
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_skills_update` with a UDF matching the API's JSONB contract.
-- Validates category against the whitelist and checks (name, category)
-- uniqueness excluding self before applying the UPDATE.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_skills_update(
    p_id                BIGINT,
    p_name              TEXT    DEFAULT NULL,
    p_category          TEXT    DEFAULT NULL,
    p_description       TEXT    DEFAULT NULL,
    p_icon_url          TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT NULL,
    p_updated_by        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_category         TEXT;
    v_effective_name   CITEXT;
    v_effective_cat    TEXT;
BEGIN
    -- ── Verify the skill exists and is not soft-deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM skills WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active skill found with id %.', p_id;
    END IF;

    -- ── Validate category if provided ───────────────────────
    IF p_category IS NOT NULL AND btrim(p_category) <> '' THEN
        v_category := btrim(p_category);
        IF v_category NOT IN (
            'technical', 'soft_skill', 'tool', 'framework',
            'language', 'domain', 'certification', 'other'
        ) THEN
            RAISE EXCEPTION 'Invalid skill category "%". Allowed: technical, soft_skill, tool, framework, language, domain, certification, other.', v_category;
        END IF;
    END IF;

    -- ── Duplicate guard on (name, category) excluding self ──
    IF p_name IS NOT NULL OR v_category IS NOT NULL THEN
        SELECT
            COALESCE(NULLIF(btrim(p_name), '')::citext, name),
            COALESCE(v_category, category)
        INTO v_effective_name, v_effective_cat
        FROM skills
        WHERE id = p_id;

        IF EXISTS (
            SELECT 1 FROM skills
            WHERE name = v_effective_name
              AND category = v_effective_cat
              AND id <> p_id
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'A skill with name "%" already exists in category "%".', v_effective_name::TEXT, v_effective_cat;
        END IF;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE skills
    SET
        name        = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        category    = COALESCE(v_category, category),
        description = COALESCE(p_description, description),
        icon_url    = COALESCE(p_icon_url, icon_url),
        is_active   = COALESCE(p_is_active, is_active),
        updated_by  = COALESCE(p_updated_by, updated_by),
        updated_at  = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Skill %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating skill: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_skills_update(p_id := 1, p_description := 'Updated description', p_updated_by := 1);
-- SELECT udf_skills_update(p_id := 1, p_name := 'Python 3');
-- -- Should fail: invalid category
-- SELECT udf_skills_update(p_id := 1, p_category := 'bogus');
-- ══════════════════════════════════════════════════════════════════════════════
