-- ============================================================================
-- FUNCTION: udf_get_password_history
-- ============================================================================
-- Purpose:
--   Dynamic SQL get function with filtering, date range, sorting, and pagination.
--   Never returns password_hash for security.
--   Whitelisted columns to prevent SQL injection via sort_column.
--
-- Parameters:
--   p_id                : Filter by password_history.id (optional)
--   p_user_id           : Filter by user_id (optional)
--   p_from_date         : Inclusive lower bound on created_at (optional)
--   p_to_date           : Inclusive upper bound on created_at (optional)
--   p_sort_column       : 'id', 'user_id', 'changed_by', 'created_at' (default: 'created_at')
--   p_sort_direction    : 'ASC', 'DESC' (default: 'DESC')
--   p_page_index        : 1-based page index (default: 1, min: 1)
--   p_page_size         : Records per page (default: 50, min: 1, max: 1000)
--
-- Returns:
--   SETOF record with columns:
--   - id, user_id, user_first_name, user_last_name, user_email,
--     changed_by, changed_by_email, change_reason, created_at,
--     total_count (COUNT(*) OVER())
--
-- Depends:
--   - uv_password_history view
--   - users table
--
-- Usage:
--   SELECT * FROM udf_get_password_history(p_user_id => 5, p_page_size => 20);
--   SELECT * FROM udf_get_password_history(p_sort_column => 'id', p_sort_direction => 'ASC');
--
-- ============================================================================

CREATE OR REPLACE FUNCTION udf_get_password_history(
  p_id BIGINT DEFAULT NULL,
  p_user_id BIGINT DEFAULT NULL,
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date TIMESTAMPTZ DEFAULT NULL,
  p_sort_column TEXT DEFAULT 'created_at',
  p_sort_direction TEXT DEFAULT 'DESC',
  -- Pagination (1-based; clamped to [1, 1000] at runtime — audit data, larger cap)
  p_page_index INT DEFAULT 1,
  p_page_size INT DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  user_id BIGINT,
  user_first_name TEXT,
  user_last_name TEXT,
  user_email CITEXT,
  changed_by BIGINT,
  changed_by_email CITEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
) LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_query TEXT;
  v_offset INT;
  v_safe_sort_col TEXT;
  v_safe_sort_dir TEXT;
BEGIN
  -- Validate and whitelist sort_column
  v_safe_sort_col := CASE p_sort_column
    WHEN 'id' THEN 'ph.id'
    WHEN 'user_id' THEN 'ph.user_id'
    WHEN 'changed_by' THEN 'ph.changed_by'
    WHEN 'created_at' THEN 'ph.created_at'
    ELSE 'ph.created_at'  -- Default fallback
  END;

  -- Validate and whitelist sort_direction
  v_safe_sort_dir := CASE UPPER(p_sort_direction)
    WHEN 'ASC' THEN 'ASC'
    WHEN 'DESC' THEN 'DESC'
    ELSE 'DESC'  -- Default fallback
  END;

  -- ── Pagination safety clamp (1-based, larger cap for audit data) ──
  p_page_index := GREATEST(COALESCE(p_page_index, 1), 1);
  p_page_size  := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 1000);
  v_offset := (p_page_index - 1) * p_page_size;

  -- Build dynamic SQL query
  v_query := 'SELECT
    ph.id,
    ph.user_id,
    u_target.first_name AS user_first_name,
    u_target.last_name AS user_last_name,
    u_target.email AS user_email,
    ph.changed_by,
    u_changer.email AS changed_by_email,
    ph.change_reason,
    ph.created_at,
    COUNT(*) OVER() AS total_count
  FROM password_history ph
  INNER JOIN users u_target ON ph.user_id = u_target.id
  LEFT JOIN users u_changer ON ph.changed_by = u_changer.id
  WHERE 1=1';

  -- Add filters
  IF p_id IS NOT NULL THEN
    v_query := v_query || ' AND ph.id = ' || p_id;
  END IF;

  IF p_user_id IS NOT NULL THEN
    v_query := v_query || ' AND ph.user_id = ' || p_user_id;
  END IF;

  IF p_from_date IS NOT NULL THEN
    v_query := v_query || ' AND ph.created_at >= ' || quote_literal(p_from_date);
  END IF;

  IF p_to_date IS NOT NULL THEN
    v_query := v_query || ' AND ph.created_at <= ' || quote_literal(p_to_date);
  END IF;

  -- Add ORDER BY and LIMIT
  v_query := v_query || ' ORDER BY ' || v_safe_sort_col || ' ' || v_safe_sort_dir
    || ' LIMIT ' || p_page_size || ' OFFSET ' || v_offset;

  -- Execute and return results
  RETURN QUERY EXECUTE v_query;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*
-- Get all password history for a user, paginated
SELECT * FROM udf_get_password_history(
  p_user_id => 1,
  p_page_size => 10,
  p_page_index => 1
);

-- Get password history sorted by creation date, newest first
SELECT * FROM udf_get_password_history(
  p_sort_column => 'created_at',
  p_sort_direction => 'DESC',
  p_page_size => 20
);

-- Get password history within a date range
SELECT * FROM udf_get_password_history(
  p_from_date => CURRENT_TIMESTAMP - INTERVAL '30 days',
  p_to_date => CURRENT_TIMESTAMP,
  p_page_size => 50
);

-- Get a specific password history record by ID
SELECT * FROM udf_get_password_history(p_id => 5);

-- Get password changes ordered by changed_by (admin actions)
SELECT * FROM udf_get_password_history(
  p_sort_column => 'changed_by',
  p_sort_direction => 'ASC',
  p_page_size => 25
);

-- Count total records for a user
SELECT total_count
FROM udf_get_password_history(p_user_id => 1)
LIMIT 1;

-- Retrieve page 2 (20 items per page)
SELECT * FROM udf_get_password_history(
  p_page_size => 20,
  p_page_index => 2  -- Second page
);
*/
