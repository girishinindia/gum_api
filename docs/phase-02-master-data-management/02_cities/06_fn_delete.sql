-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_cities_delete
-- PURPOSE:  Soft-delete a city.
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_cities_delete` with a UDF matching the API's JSONB contract.
-- Cities have no child tables today, so there's no referential guard.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_cities_delete(
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
        SELECT 1 FROM cities WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'City with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE cities
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('City %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting city: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_cities_delete(p_id := 12);
-- ══════════════════════════════════════════════════════════════════════════════
