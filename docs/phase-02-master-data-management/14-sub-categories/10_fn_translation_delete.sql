-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_sub_category_translations_delete
-- PURPOSE:  Soft-delete a single sub-category translation.
-- RETURNS:  JSONB { success, message }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_sub_category_translations_delete(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── Verify record exists and is not already deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM sub_category_translations WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Translation with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE sub_category_translations
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Translation %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting translation: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: Delete a translation
-- SELECT * FROM udf_sub_category_translations_delete(p_id := 1);

-- Test: Should fail — already deleted
-- SELECT * FROM udf_sub_category_translations_delete(p_id := 1);
