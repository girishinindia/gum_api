-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_sub_category_translations_insert
-- PURPOSE:  Insert a new translation for an existing sub-category. Validates parent
--           sub-category exists, is active, not deleted, and language is valid.
-- RETURNS:  JSONB { success, message, id }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_sub_category_translations_insert(
    p_sub_category_id                       BIGINT,
    p_language_id                           BIGINT,
    p_name                                  CITEXT,
    p_description                           TEXT                DEFAULT NULL,
    p_is_new_title                          TEXT                DEFAULT NULL,
    p_tags                                  JSONB               DEFAULT NULL,
    p_meta_title                            TEXT                DEFAULT NULL,
    p_meta_description                      TEXT                DEFAULT NULL,
    p_meta_keywords                         TEXT                DEFAULT NULL,
    p_canonical_url                         TEXT                DEFAULT NULL,
    p_og_site_name                          TEXT                DEFAULT NULL,
    p_og_title                              TEXT                DEFAULT NULL,
    p_og_description                        TEXT                DEFAULT NULL,
    p_og_type                               TEXT                DEFAULT NULL,
    p_og_image                              TEXT                DEFAULT NULL,
    p_og_url                                TEXT                DEFAULT NULL,
    p_twitter_site                          TEXT                DEFAULT NULL,
    p_twitter_title                         TEXT                DEFAULT NULL,
    p_twitter_description                   TEXT                DEFAULT NULL,
    p_twitter_image                         TEXT                DEFAULT NULL,
    p_twitter_card                          TEXT                DEFAULT 'summary_large_image',
    p_robots_directive                      TEXT                DEFAULT 'index,follow',
    p_focus_keyword                         TEXT                DEFAULT NULL,
    p_structured_data                       JSONB               DEFAULT NULL,
    p_is_active                             BOOLEAN             DEFAULT TRUE,
    p_created_by                            BIGINT              DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_id BIGINT;
BEGIN
    -- ── Validate required parameters ─────────────────────────
    IF p_sub_category_id IS NULL THEN
        RAISE EXCEPTION 'Sub-category ID is required.';
    END IF;

    IF p_language_id IS NULL THEN
        RAISE EXCEPTION 'Language ID is required.';
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Translation name is required and cannot be empty.';
    END IF;

    -- ── Verify parent sub-category exists, is active, not deleted ──
    IF NOT EXISTS (
        SELECT 1 FROM sub_categories
        WHERE id = p_sub_category_id AND is_deleted = FALSE AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Parent sub-category (ID %) does not exist, is deleted, or is inactive.', p_sub_category_id;
    END IF;

    -- ── Verify language exists and is active ──────────────────
    IF NOT EXISTS (
        SELECT 1 FROM languages
        WHERE id = p_language_id AND is_active = TRUE AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Language with ID % does not exist or is not active.', p_language_id;
    END IF;

    -- ── Check for duplicate translation ──────────────────────
    IF EXISTS (
        SELECT 1 FROM sub_category_translations
        WHERE sub_category_id = p_sub_category_id
          AND language_id = p_language_id
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Translation already exists for sub-category (%) and language (%).', p_sub_category_id, p_language_id;
    END IF;

    -- ── Insert translation ───────────────────────────────────
    INSERT INTO sub_category_translations (
        sub_category_id,
        language_id,
        name,
        description,
        is_new_title,
        tags,
        meta_title,
        meta_description,
        meta_keywords,
        canonical_url,
        og_site_name,
        og_title,
        og_description,
        og_type,
        og_image,
        og_url,
        twitter_site,
        twitter_title,
        twitter_description,
        twitter_image,
        twitter_card,
        robots_directive,
        focus_keyword,
        structured_data,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        p_sub_category_id,
        p_language_id,
        btrim(p_name)::citext,
        p_description,
        p_is_new_title,
        COALESCE(p_tags, '[]'::JSONB),
        p_meta_title,
        p_meta_description,
        p_meta_keywords,
        p_canonical_url,
        p_og_site_name,
        p_og_title,
        p_og_description,
        p_og_type,
        p_og_image,
        p_og_url,
        p_twitter_site,
        p_twitter_title,
        p_twitter_description,
        p_twitter_image,
        COALESCE(p_twitter_card, 'summary_large_image'),
        COALESCE(p_robots_directive, 'index,follow'),
        p_focus_keyword,
        COALESCE(p_structured_data, '[]'::JSONB),
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Translation inserted successfully.',
        'id', v_new_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting translation: %s', SQLERRM),
        'id', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: Insert translation
-- SELECT * FROM udf_sub_category_translations_insert(
--     p_sub_category_id := 1,
--     p_language_id := 1,
--     p_name := 'Web Development'
-- );

-- Test: Should fail — duplicate
-- SELECT * FROM udf_sub_category_translations_insert(
--     p_sub_category_id := 1,
--     p_language_id := 1,
--     p_name := 'Web Development'
-- );
