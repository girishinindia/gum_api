-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_sub_categories_restore
-- PURPOSE:  Restore a soft-deleted sub-category. Optionally restore all soft-deleted
--           translations for that sub-category as well.
-- RETURNS:  JSONB { success, message, translationsRestored }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_sub_categories_restore(
    p_id                    BIGINT,
    p_restore_translations  BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trans_count BIGINT := 0;
BEGIN
    -- ── Verify record exists and is currently deleted ───────
    IF NOT EXISTS (
        SELECT 1 FROM sub_categories WHERE id = p_id AND is_deleted = TRUE
    ) THEN
        RAISE EXCEPTION 'Sub-category with ID % is not deleted or does not exist.', p_id;
    END IF;

    -- ── Conditionally restore translations ────────────────────
    IF p_restore_translations = TRUE THEN
        UPDATE sub_category_translations
        SET
            is_deleted = FALSE,
            is_active  = TRUE,
            deleted_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE sub_category_id = p_id
          AND is_deleted = TRUE;

        GET DIAGNOSTICS v_trans_count = ROW_COUNT;
    END IF;

    -- ── Restore parent sub-category ──────────────────────────
    UPDATE sub_categories
    SET
        is_deleted = FALSE,
        is_active  = TRUE,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Sub-category %s restored successfully.', p_id),
        'translationsRestored', v_trans_count
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error restoring sub-category: %s', SQLERRM),
        'translationsRestored', 0
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: Restore a sub-category
-- SELECT * FROM udf_sub_categories_restore(p_id := 999);

-- Test: Restore a sub-category and its translations
-- SELECT * FROM udf_sub_categories_restore(p_id := 999, p_restore_translations := TRUE);
