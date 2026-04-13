-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: udf_countries_delete
-- PURPOSE:  Soft-delete a country. Guards against deleting a country that is
--           referenced by active users (users.country_id).
-- RETURNS:  JSONB { success, message }
--
-- Replaces `sp_countries_delete` with a UDF matching the API's JSONB contract.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION udf_countries_delete(
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
        SELECT 1 FROM countries WHERE id = p_id AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Country with ID % does not exist or is already deleted.', p_id;
    END IF;

    -- ── Referential guard: active users referencing this country ──
    -- users.country_id is optional in the schema, so only block when
    -- there's an actual live reference. Soft-deleted users don't count.
    IF EXISTS (
        SELECT 1 FROM users
        WHERE country_id = p_id
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Cannot delete country: it is currently referenced by active users.';
    END IF;

    -- ── Soft delete ──────────────────────────────────────────
    UPDATE countries
    SET
        is_deleted = TRUE,
        is_active  = FALSE,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Country %s deleted successfully.', p_id)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', format('Error deleting country: %s', SQLERRM)
    );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTING
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT udf_countries_delete(p_id := 10);
-- ══════════════════════════════════════════════════════════════════════════════
