-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_sub_categories_delete
-- PURPOSE:  Soft-delete a sub-category and cascade soft-delete all related
--           translations in a single atomic transaction.
-- RETURNS:  JSONB { success, message, translationsDeleted }
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_sub_categories_delete(
    p_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trans_count BIGINT;
BEGIN
    -- ── Verify record exists and is not already deleted ─────
    IF NOT EXISTS (
        SELECT 1 FROM sub_categories WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Sub-category with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Soft delete all related translations ──────────────────
    UPDATE sub_category_translations
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE sub_category_id = p_id
      AND is_deleted = FALSE;

    GET DIAGNOSTICS v_trans_count = ROW_COUNT;

    -- ── Soft delete parent sub-category ──────────────────────
    UPDATE sub_categories
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Sub-category %s deleted successfully.', p_id),
        'translationsDeleted', v_trans_count
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting sub-category: %s', SQLERRM),
        'translationsDeleted', 0
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════

-- Test: Delete a sub-category
-- SELECT * FROM udf_sub_categories_delete(p_id := 999);

-- Test: Should fail — already deleted
-- SELECT * FROM udf_sub_categories_delete(p_id := 999);
