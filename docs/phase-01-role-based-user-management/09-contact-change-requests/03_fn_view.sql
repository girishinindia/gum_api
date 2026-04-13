/*
 * User Contact Change Requests - View/Query Function
 * Purpose: Retrieve contact change requests with filtering, search, sorting, and pagination
 * Depends: uv_contact_change_requests view
 * Usage: udf_get_contact_change_requests(filters, search, sort, pagination)
 */

-- ============================================================================
-- FUNCTION: udf_get_contact_change_requests
-- ============================================================================
-- Retrieves contact change requests with dynamic filtering, search, sorting, and pagination.
-- Returns paginated results with total row count via window function.

CREATE OR REPLACE FUNCTION udf_get_contact_change_requests(
    p_id BIGINT DEFAULT NULL,
    p_user_id BIGINT DEFAULT NULL,
    p_change_type contact_change_type DEFAULT NULL,
    p_status contact_change_status DEFAULT NULL,
    p_search_term TEXT DEFAULT NULL,
    p_sort_column TEXT DEFAULT 'created_at',
    p_sort_direction TEXT DEFAULT 'DESC',
    -- Pagination (1-based; clamped to [1, 100] at runtime)
    p_page_index INT DEFAULT 1,
    p_page_size INT DEFAULT 20
)
RETURNS TABLE (
    id BIGINT,
    user_id BIGINT,
    change_type contact_change_type,
    old_value TEXT,
    new_value TEXT,
    status contact_change_status,
    expires_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    first_name TEXT,
    last_name TEXT,
    email CITEXT,
    mobile TEXT,
    total_count BIGINT
) LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v_offset INT;
    v_sql TEXT;
BEGIN
    -- ── Pagination safety clamp ─────────────────────────────
    p_page_index := GREATEST(COALESCE(p_page_index, 1), 1);
    p_page_size  := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
    v_offset := (p_page_index - 1) * p_page_size;

    -- Validate sort parameters (whitelist)
    IF p_sort_column NOT IN ('id', 'user_id', 'change_type', 'status', 'created_at', 'updated_at', 'expires_at') THEN
        p_sort_column := 'created_at';
    END IF;
    IF UPPER(p_sort_direction) NOT IN ('ASC', 'DESC') THEN
        p_sort_direction := 'DESC';
    END IF;

    -- Build dynamic SQL with filtering and search
    v_sql := 'SELECT
        ucr.id,
        ucr.user_id,
        ucr.change_type,
        ucr.old_value,
        ucr.new_value,
        ucr.status,
        ucr.expires_at,
        ucr.verified_at,
        ucr.completed_at,
        ucr.cancelled_at,
        ucr.created_at,
        ucr.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.mobile,
        COUNT(*) OVER() AS total_count
    FROM uv_contact_change_requests ucr
    JOIN users u ON ucr.user_id = u.id
    WHERE 1=1';

    -- Add optional filters
    IF p_id IS NOT NULL THEN
        v_sql := v_sql || ' AND ucr.id = ' || p_id;
    END IF;

    IF p_user_id IS NOT NULL THEN
        v_sql := v_sql || ' AND ucr.user_id = ' || p_user_id;
    END IF;

    IF p_change_type IS NOT NULL THEN
        v_sql := v_sql || ' AND ucr.change_type = ''' || p_change_type || '''';
    END IF;

    IF p_status IS NOT NULL THEN
        v_sql := v_sql || ' AND ucr.status = ''' || p_status || '''';
    END IF;

    -- Add search term (searches in first_name, last_name, old_value, new_value)
    IF p_search_term IS NOT NULL AND p_search_term <> '' THEN
        v_sql := v_sql || ' AND (
            LOWER(u.first_name) LIKE LOWER(''%' || p_search_term || '%'') OR
            LOWER(u.last_name) LIKE LOWER(''%' || p_search_term || '%'') OR
            LOWER(ucr.old_value) LIKE LOWER(''%' || p_search_term || '%'') OR
            LOWER(ucr.new_value) LIKE LOWER(''%' || p_search_term || '%'')
        )';
    END IF;

    -- Add sorting and pagination
    v_sql := v_sql || ' ORDER BY ucr.' || p_sort_column || ' ' || p_sort_direction;
    v_sql := v_sql || ' LIMIT ' || p_page_size || ' OFFSET ' || v_offset;

    -- Execute query
    RETURN QUERY EXECUTE v_sql;
END;
$$;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*

-- Get all contact change requests with defaults
SELECT * FROM udf_get_contact_change_requests();

-- Filter by user_id
SELECT * FROM udf_get_contact_change_requests(p_user_id => 1);

-- Filter by status
SELECT * FROM udf_get_contact_change_requests(p_status => 'pending');

-- Filter by change type
SELECT * FROM udf_get_contact_change_requests(p_change_type => 'email');

-- Search by user name
SELECT * FROM udf_get_contact_change_requests(p_search_term => 'john');

-- Custom sorting and pagination
SELECT * FROM udf_get_contact_change_requests(
    p_sort_column => 'created_at',
    p_sort_direction => 'ASC',
    p_page_index => 1,
    p_page_size => 10
);

-- Combined filters
SELECT * FROM udf_get_contact_change_requests(
    p_user_id => 1,
    p_change_type => 'email',
    p_status => 'pending',
    p_sort_column => 'expires_at',
    p_sort_direction => 'ASC'
);

*/
