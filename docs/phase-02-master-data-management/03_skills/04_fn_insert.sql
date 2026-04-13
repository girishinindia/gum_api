-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_skills_insert
-- PURPOSE:  Insert a new skill with category + (name, category) uniqueness
--           validation.
-- RETURNS:  JSONB { success, message, id }
--
-- Replaces `sp_skills_insert` with a UDF matching the API's JSONB contract.
-- Category is validated against the same whitelist the table's
-- `chk_skills_category` CHECK enforces, so the API layer gets a clean message
-- instead of a raw constraint-violation error.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_skills_insert(
    p_name              TEXT,
    p_category          TEXT    DEFAULT 'technical',
    p_description       TEXT    DEFAULT NULL,
    p_icon_url          TEXT    DEFAULT NULL,
    p_is_active         BOOLEAN DEFAULT TRUE,
    p_created_by        BIGINT  DEFAULT NULL
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
        RAISE EXCEPTION 'Skill name cannot be empty.';
    END IF;

    v_category := COALESCE(btrim(p_category), 'technical');

    -- ── Validate category whitelist ──────────────────────────
    IF v_category NOT IN (
        'technical', 'soft_skill', 'tool', 'framework',
        'language', 'domain', 'certification', 'other'
    ) THEN
        RAISE EXCEPTION 'Invalid skill category "%". Allowed: technical, soft_skill, tool, framework, language, domain, certification, other.', v_category;
    END IF;

    -- ── Duplicate guard: (name, category) unique ────────────
    IF EXISTS (
        SELECT 1 FROM skills
        WHERE name     = btrim(p_name)::citext
          AND category = v_category
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A skill with name "%" already exists in category "%".', btrim(p_name), v_category;
    END IF;

    -- ── Insert ───────────────────────────────────────────────
    INSERT INTO skills (
        name,
        category,
        description,
        icon_url,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        btrim(p_name)::citext,
        v_category,
        p_description,
        p_icon_url,
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Skill inserted successfully with ID: %s', v_new_id),
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting skill: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_skills_insert(
--     p_name        := 'GraphQL',
--     p_category    := 'technical',
--     p_description := 'Query language for APIs',
--     p_icon_url    := '/icons/graphql.svg',
--     p_created_by  := 1
-- );
--
-- SELECT udf_skills_insert(p_name := 'Terraform');
-- -- Should fail: duplicate (name, category)
-- SELECT udf_skills_insert(p_name := 'Python', p_category := 'technical');
-- -- Should fail: invalid category
-- SELECT udf_skills_insert(p_name := 'Test', p_category := 'bogus');
-- ══════════════════════════════════════════════════════════════════════════════
