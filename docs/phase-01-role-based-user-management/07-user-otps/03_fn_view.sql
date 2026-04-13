-- ============================================================================
-- udf_get_otps() - Dynamic OTP Query Function
-- ============================================================================
-- Purpose: Flexible function to retrieve OTP records with filtering, searching,
--          sorting, and pagination. Returns paginated results with total count.
--
-- Depends: uv_user_otps view, user_otps table
--
-- Usage: SELECT * FROM udf_get_otps(
--          p_id := 123,
--          p_user_id := 456,
--          p_purpose := 'registration',
--          p_channel := 'email',
--          p_status := 'pending',
--          p_search_term := 'john@example.com',
--          p_sort_column := 'created_at',
--          p_sort_direction := 'DESC',
--          p_page_index := 1,
--          p_page_size := 20
--        );
--
-- Returns: Paginated result set with row_number, total_count, and OTP fields.
--          Never returns otp_hash.
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_get_otps(
    p_id BIGINT DEFAULT NULL,
    p_user_id BIGINT DEFAULT NULL,
    p_purpose otp_purpose DEFAULT NULL,
    p_channel otp_channel DEFAULT NULL,
    p_status otp_status DEFAULT NULL,
    p_search_term TEXT DEFAULT NULL,
    p_sort_column TEXT DEFAULT 'created_at',
    p_sort_direction TEXT DEFAULT 'DESC',
    p_page_index INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
    row_number BIGINT,
    total_count BIGINT,
    id BIGINT,
    user_id BIGINT,
    first_name TEXT,
    last_name TEXT,
    user_email CITEXT,
    user_mobile TEXT,
    purpose otp_purpose,
    channel otp_channel,
    destination TEXT,
    status otp_status,
    expires_at TIMESTAMPTZ,
    resend_available_at TIMESTAMPTZ,
    attempts_count SMALLINT,
    max_attempts SMALLINT,
    resend_count SMALLINT,
    max_resend SMALLINT,
    cooldown_until TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_offset INTEGER;
    v_dynamic_query TEXT;
    v_where_clauses TEXT[] := ARRAY[]::TEXT[];
    v_sort_column_safe TEXT;
BEGIN
    -- ── Pagination safety clamp ─────────────────────────────
    p_page_index := GREATEST(COALESCE(p_page_index, 1), 1);
    p_page_size  := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);

    -- Validate and sanitize sort column (whitelist)
    v_sort_column_safe := CASE p_sort_column
        WHEN 'id' THEN 'uo.id'
        WHEN 'user_id' THEN 'uo.user_id'
        WHEN 'purpose' THEN 'uo.purpose'
        WHEN 'channel' THEN 'uo.channel'
        WHEN 'status' THEN 'uo.status'
        WHEN 'destination' THEN 'uo.destination'
        WHEN 'expires_at' THEN 'uo.expires_at'
        WHEN 'created_at' THEN 'uo.created_at'
        WHEN 'updated_at' THEN 'uo.updated_at'
        WHEN 'verified_at' THEN 'uo.verified_at'
        WHEN 'attempts_count' THEN 'uo.attempts_count'
        WHEN 'resend_count' THEN 'uo.resend_count'
        ELSE 'uo.created_at' -- default fallback
    END;

    -- Validate sort direction
    IF LOWER(p_sort_direction) NOT IN ('asc', 'desc') THEN
        p_sort_direction := 'DESC';
    END IF;

    -- Build WHERE clauses dynamically
    IF p_id IS NOT NULL THEN
        v_where_clauses := array_append(v_where_clauses, 'uo.id = ' || p_id);
    END IF;

    IF p_user_id IS NOT NULL THEN
        v_where_clauses := array_append(v_where_clauses, 'uo.user_id = ' || p_user_id);
    END IF;

    IF p_purpose IS NOT NULL THEN
        v_where_clauses := array_append(v_where_clauses, 'uo.purpose = ' || quote_literal(p_purpose::TEXT));
    END IF;

    IF p_channel IS NOT NULL THEN
        v_where_clauses := array_append(v_where_clauses, 'uo.channel = ' || quote_literal(p_channel::TEXT));
    END IF;

    IF p_status IS NOT NULL THEN
        v_where_clauses := array_append(v_where_clauses, 'uo.status = ' || quote_literal(p_status::TEXT));
    END IF;

    -- Search term: destination, user first/last name, or user email
    IF p_search_term IS NOT NULL AND p_search_term != '' THEN
        v_where_clauses := array_append(
            v_where_clauses,
            '(uo.destination ILIKE ' || quote_literal('%' || p_search_term || '%') ||
            ' OR u.first_name ILIKE ' || quote_literal('%' || p_search_term || '%') ||
            ' OR u.last_name ILIKE ' || quote_literal('%' || p_search_term || '%') ||
            ' OR u.email ILIKE ' || quote_literal('%' || p_search_term || '%') || ')'
        );
    END IF;

    -- Calculate offset for pagination (values already clamped at top)
    v_offset := (p_page_index - 1) * p_page_size;

    -- Build and execute dynamic query
    v_dynamic_query := 'SELECT
        ROW_NUMBER() OVER (ORDER BY ' || v_sort_column_safe || ' ' || p_sort_direction || ') AS row_number,
        COUNT(*) OVER () AS total_count,
        uo.id,
        uo.user_id,
        u.first_name,
        u.last_name,
        u.email AS user_email,
        u.mobile AS user_mobile,
        uo.purpose,
        uo.channel,
        uo.destination,
        uo.status,
        uo.expires_at,
        uo.resend_available_at,
        uo.attempts_count,
        uo.max_attempts,
        uo.resend_count,
        uo.max_resend,
        uo.cooldown_until,
        uo.verified_at,
        uo.used_at,
        uo.created_at,
        uo.updated_at
    FROM user_otps uo
    INNER JOIN users u ON uo.user_id = u.id';

    -- Append WHERE clause if any conditions exist
    IF array_length(v_where_clauses, 1) > 0 THEN
        v_dynamic_query := v_dynamic_query || ' WHERE ' || array_to_string(v_where_clauses, ' AND ');
    END IF;

    -- Append ORDER, LIMIT, OFFSET
    v_dynamic_query := v_dynamic_query || ' ORDER BY ' || v_sort_column_safe || ' ' || p_sort_direction ||
                       ' LIMIT ' || p_page_size || ' OFFSET ' || v_offset;

    -- Execute and return results
    RETURN QUERY EXECUTE v_dynamic_query;
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================
/*

-- Get all pending OTPs for a specific user
SELECT * FROM udf_get_otps(p_user_id := 1, p_status := 'pending');

-- Search by email destination
SELECT * FROM udf_get_otps(p_search_term := 'john@example.com', p_page_size := 10);

-- Get registration OTPs via email channel, sorted by creation
SELECT * FROM udf_get_otps(
    p_purpose := 'registration',
    p_channel := 'email',
    p_sort_column := 'created_at',
    p_sort_direction := 'DESC',
    p_page_index := 1,
    p_page_size := 25
);

-- Get specific OTP record by ID
SELECT * FROM udf_get_otps(p_id := 100);

-- Search by user name
SELECT * FROM udf_get_otps(p_search_term := 'John Smith');

-- Verify otp_hash is never returned
SELECT column_name
FROM (
    SELECT * FROM udf_get_otps(LIMIT 1)
) sub
WHERE column_name = 'otp_hash';
-- Should return 0 rows

*/
