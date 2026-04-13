-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_sub_categories_insert
-- PURPOSE:  Insert a new sub-category with one default-language translation in a
--           single atomic transaction. Parent and translation row both inserted.
--           Validates parent category exists, is active, not deleted.
-- NOTE:     icon_url and image_url are NOT part of this signature. Image management
--           flows through the dedicated upload endpoint.
-- RETURNS:  JSONB { success, message, id, translationId }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_sub_categories_insert(
    p_category_id                           BIGINT,
    p_code                                  CITEXT,
    p_slug                                  CITEXT              DEFAULT NULL,
    p_display_order                         SMALLINT            DEFAULT 0,
    p_is_new                                BOOLEAN             DEFAULT FALSE,
    p_new_until                             DATE                DEFAULT NULL,
    p_is_active                             BOOLEAN             DEFAULT TRUE,
    p_created_by                            BIGINT              DEFAULT NULL,
    -- Translation params
    p_translation_language_id               BIGINT              DEFAULT NULL,
    p_translation_name                      CITEXT              DEFAULT NULL,
    p_translation_description               TEXT                DEFAULT NULL,
    p_translation_is_new_title              TEXT                DEFAULT NULL,
    p_translation_tags                      JSONB               DEFAULT NULL,
    p_translation_meta_title                TEXT                DEFAULT NULL,
    p_translation_meta_description          TEXT                DEFAULT NULL,
    p_translation_meta_keywords             TEXT                DEFAULT NULL,
    p_translation_canonical_url             TEXT                DEFAULT NULL,
    p_translation_og_site_name              TEXT                DEFAULT NULL,
    p_translation_og_title                  TEXT                DEFAULT NULL,
    p_translation_og_description            TEXT                DEFAULT NULL,
    p_translation_og_type                   TEXT                DEFAULT NULL,
    p_translation_og_image                  TEXT                DEFAULT NULL,
    p_translation_og_url                    TEXT                DEFAULT NULL,
    p_translation_twitter_site              TEXT                DEFAULT NULL,
    p_translation_twitter_title             TEXT                DEFAULT NULL,
    p_translation_twitter_description       TEXT                DEFAULT NULL,
    p_translation_twitter_image             TEXT                DEFAULT NULL,
    p_translation_twitter_card              TEXT                DEFAULT 'summary_large_image',
    p_translation_robots_directive          TEXT                DEFAULT 'index,follow',
    p_translation_focus_keyword             TEXT                DEFAULT NULL,
    p_translation_structured_data           JSONB               DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_id           BIGINT;
    v_trans_id         BIGINT;
    v_generated_slug   CITEXT;
BEGIN
    -- ── Validate parent category ────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM categories
        WHERE id = p_category_id AND is_deleted = FALSE AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Parent category (ID %) does not exist, is deleted, or is inactive.', p_category_id;
    END IF;

    -- ── Validate required fields ─────────────────────────────
    IF p_code IS NULL OR btrim(p_code) = '' THEN
        RAISE EXCEPTION 'Sub-category code cannot be empty.';
    END IF;

    -- ── Duplicate guard: (category_id, code) unique constraint ──
    IF EXISTS (
        SELECT 1 FROM sub_categories
        WHERE category_id = p_category_id
          AND code = btrim(p_code)
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A sub-category with code "%" already exists in this category.', btrim(p_code);
    END IF;

    -- ── Generate slug from code if not provided ──────────────
    v_generated_slug := COALESCE(
        NULLIF(btrim(p_slug), ''),
        btrim(p_code)
    )::CITEXT;

    -- ── Duplicate guard: (category_id, slug) unique constraint ──
    IF EXISTS (
        SELECT 1 FROM sub_categories
        WHERE category_id = p_category_id
          AND slug = v_generated_slug
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'A sub-category with slug "%" already exists in this category.', v_generated_slug;
    END IF;

    -- ── Validate new_until if is_new=TRUE ────────────────────
    IF p_is_new = TRUE AND p_new_until IS NOT NULL AND p_new_until < CURRENT_DATE THEN
        RAISE EXCEPTION 'new_until date must be in the future when is_new is TRUE.';
    END IF;

    -- ── Insert parent sub-category ───────────────────────────
    INSERT INTO sub_categories (
        category_id,
        code,
        slug,
        display_order,
        is_new,
        new_until,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        p_category_id,
        btrim(p_code)::citext,
        v_generated_slug,
        COALESCE(p_display_order, 0),
        COALESCE(p_is_new, FALSE),
        CASE WHEN p_is_new = TRUE THEN p_new_until ELSE NULL END,
        COALESCE(p_is_active, TRUE),
        p_created_by,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    -- ── Conditionally insert translation ─────────────────────
    IF p_translation_language_id IS NOT NULL AND p_translation_name IS NOT NULL THEN
        -- Validate language exists and is active
        IF NOT EXISTS (
            SELECT 1 FROM languages
            WHERE id = p_translation_language_id AND is_active = TRUE AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'Language with ID % does not exist or is not active.', p_translation_language_id;
        END IF;

        -- Insert translation
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
            created_by,
            updated_by
        )
        VALUES (
            v_new_id,
            p_translation_language_id,
            btrim(p_translation_name)::citext,
            p_translation_description,
            p_translation_is_new_title,
            COALESCE(p_translation_tags, '[]'::JSONB),
            p_translation_meta_title,
            p_translation_meta_description,
            p_translation_meta_keywords,
            p_translation_canonical_url,
            p_translation_og_site_name,
            p_translation_og_title,
            p_translation_og_description,
            p_translation_og_type,
            p_translation_og_image,
            p_translation_og_url,
            p_translation_twitter_site,
            p_translation_twitter_title,
            p_translation_twitter_description,
            p_translation_twitter_image,
            COALESCE(p_translation_twitter_card, 'summary_large_image'),
            COALESCE(p_translation_robots_directive, 'index,follow'),
            p_translation_focus_keyword,
            COALESCE(p_translation_structured_data, '[]'::JSONB),
            p_created_by,
            p_created_by
        )
        RETURNING id INTO v_trans_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Sub-category inserted successfully.',
        'id', v_new_id,
        'translationId', v_trans_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error inserting sub-category: %s', SQLERRM),
        'id', NULL,
        'translationId', NULL
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: Insert sub-category with translation
-- SELECT * FROM udf_sub_categories_insert(
--     p_category_id := 1,
--     p_code := 'SCAT-NEW',
--     p_translation_language_id := 1,
--     p_translation_name := 'New Sub-Category'
-- );

-- Test: Insert sub-category without translation
-- SELECT * FROM udf_sub_categories_insert(
--     p_category_id := 1,
--     p_code := 'SCAT-NOTR'
-- );
