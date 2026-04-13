-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_category_translations_restore
-- PURPOSE:  Restore a soft-deleted translation. Parent category must not be
--           deleted (ensures consistency).
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_category_translations_restore(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_category_id BIGINT;
    v_category_deleted BOOLEAN;
BEGIN
    -- ── Verify record exists and is currently deleted ───────
    IF NOT EXISTS (
        SELECT 1 FROM category_translations WHERE id = p_id AND is_deleted = TRUE
    ) THEN
        RAISE EXCEPTION 'Translation with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Verify parent category is not deleted ──────────────────
    SELECT category_id, is_deleted
    INTO v_category_id, v_category_deleted
    FROM category_translations
    WHERE id = p_id;

    IF EXISTS (
        SELECT 1 FROM categories
        WHERE id = v_category_id AND is_deleted = TRUE
    ) THEN
        RAISE EXCEPTION 'Cannot restore translation: parent category is deleted.';
    END IF;

    -- ── Restore ──────────────────────────────────────────────
    UPDATE category_translations
    SET
        is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Translation %s restored successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring translation: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: Restore a translation
-- SELECT * FROM udf_category_translations_restore(p_id := 1);

-- Test: Should fail — parent category deleted
-- SELECT * FROM udf_category_translations_restore(p_id := 1);
