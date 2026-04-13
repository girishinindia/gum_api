-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_category_translations_update
-- PURPOSE:  Update an existing translation. Foreign keys (category_id, language_id)
--           are immutable. NULL params leave fields untouched.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_category_translations_update(
    p_id                        BIGINT,
    p_name                      CITEXT              DEFAULT NULL,
    p_description               TEXT                DEFAULT NULL,
    p_is_new_title              TEXT                DEFAULT NULL,
    p_tags                      JSONB               DEFAULT NULL,
    p_meta_title                TEXT                DEFAULT NULL,
    p_meta_description          TEXT                DEFAULT NULL,
    p_meta_keywords             TEXT                DEFAULT NULL,
    p_canonical_url             TEXT                DEFAULT NULL,
    p_og_site_name              TEXT                DEFAULT NULL,
    p_og_title                  TEXT                DEFAULT NULL,
    p_og_description            TEXT                DEFAULT NULL,
    p_og_type                   TEXT                DEFAULT NULL,
    p_og_image                  TEXT                DEFAULT NULL,
    p_og_url                    TEXT                DEFAULT NULL,
    p_twitter_site              TEXT                DEFAULT NULL,
    p_twitter_title             TEXT                DEFAULT NULL,
    p_twitter_description       TEXT                DEFAULT NULL,
    p_twitter_image             TEXT                DEFAULT NULL,
    p_twitter_card              TEXT                DEFAULT NULL,
    p_robots_directive          TEXT                DEFAULT NULL,
    p_focus_keyword             TEXT                DEFAULT NULL,
    p_structured_data           JSONB               DEFAULT NULL,
    p_is_active                 BOOLEAN             DEFAULT NULL,
    p_updated_by                BIGINT              DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── Verify the record exists and is not soft-deleted ────
    IF NOT EXISTS (
        SELECT 1 FROM category_translations WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'No active translation found with id %.', p_id;
    END IF;

    -- ── Partial update ──────────────────────────────────────
    UPDATE category_translations
    SET
        name                = COALESCE(NULLIF(btrim(p_name), '')::citext, name),
        description         = COALESCE(p_description, description),
        is_new_title        = COALESCE(p_is_new_title, is_new_title),
        tags                = COALESCE(p_tags, tags),
        meta_title          = COALESCE(p_meta_title, meta_title),
        meta_description    = COALESCE(p_meta_description, meta_description),
        meta_keywords       = COALESCE(p_meta_keywords, meta_keywords),
        canonical_url       = COALESCE(p_canonical_url, canonical_url),
        og_site_name        = COALESCE(p_og_site_name, og_site_name),
        og_title            = COALESCE(p_og_title, og_title),
        og_description      = COALESCE(p_og_description, og_description),
        og_type             = COALESCE(p_og_type, og_type),
        og_image            = COALESCE(p_og_image, og_image),
        og_url              = COALESCE(p_og_url, og_url),
        twitter_site        = COALESCE(p_twitter_site, twitter_site),
        twitter_title       = COALESCE(p_twitter_title, twitter_title),
        twitter_description = COALESCE(p_twitter_description, twitter_description),
        twitter_image       = COALESCE(p_twitter_image, twitter_image),
        twitter_card        = COALESCE(p_twitter_card, twitter_card),
        robots_directive    = COALESCE(p_robots_directive, robots_directive),
        focus_keyword       = COALESCE(p_focus_keyword, focus_keyword),
        structured_data     = COALESCE(p_structured_data, structured_data),
        is_active           = COALESCE(p_is_active, is_active),
        updated_by          = COALESCE(p_updated_by, updated_by),
        updated_at          = CURRENT_TIMESTAMP
    WHERE id = p_id
      AND is_deleted = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Translation %s updated successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error updating translation: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: Update translation name
-- SELECT * FROM udf_category_translations_update(p_id := 1, p_name := 'Updated Name');

-- Test: Update SEO fields
-- SELECT * FROM udf_category_translations_update(p_id := 1, p_meta_title := 'New SEO Title');

-- Test: Deactivate translation
-- SELECT * FROM udf_category_translations_update(p_id := 1, p_is_active := FALSE);
