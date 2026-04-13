/**
 * ============================================================================
 * UDF_GET_LOGIN_ATTEMPTS FUNCTION
 * ============================================================================
 * Purpose:
 *   - Dynamic SQL query builder for login_attempts with flexible filtering
 *   - Supports pagination, sorting, date range, full-text search
 *   - Returns rows with COUNT(*) OVER() for total count
 *   - Used by admin dashboards and audit reports
 *
 * Depends:
 *   - login_attempts table
 *   - users table (via join in queries)
 *
 * Usage:
 *   SELECT * FROM udf_get_login_attempts(
 *     p_user_id => 123,
 *     p_status => 'failed',
 *     p_page_index => 1,
 *     p_page_size => 50
 *   );
 * ============================================================================
 */

CREATE OR REPLACE FUNCTION udf_get_login_attempts(
  p_id BIGINT DEFAULT NULL,
  p_user_id BIGINT DEFAULT NULL,
  p_identifier TEXT DEFAULT NULL,
  p_status login_attempt_status DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date TIMESTAMPTZ DEFAULT NULL,
  p_search_term TEXT DEFAULT NULL,
  p_sort_column TEXT DEFAULT 'attempted_at',
  p_sort_direction TEXT DEFAULT 'DESC',
  -- Pagination (1-based; clamped to [1, 100] at runtime)
  p_page_index INT DEFAULT 1,
  p_page_size INT DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  user_id BIGINT,
  first_name TEXT,
  last_name TEXT,
  email CITEXT,
  mobile TEXT,
  identifier TEXT,
  ip_address INET,
  user_agent TEXT,
  device_type TEXT,
  os TEXT,
  browser TEXT,
  status login_attempt_status,
  failure_reason TEXT,
  blocked_until TIMESTAMPTZ,
  attempted_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_offset INT;
  v_sort_order TEXT;
  v_sql TEXT;
BEGIN
  -- Validate and set sort direction
  v_sort_order := CASE
    WHEN UPPER(p_sort_direction) = 'DESC' THEN 'DESC'
    WHEN UPPER(p_sort_direction) = 'ASC' THEN 'ASC'
    ELSE 'DESC'
  END;

  -- Validate sort column (whitelist)
  p_sort_column := CASE
    WHEN p_sort_column IN (
      'id', 'user_id', 'identifier', 'ip_address', 'device_type', 'os',
      'browser', 'status', 'failure_reason', 'attempted_at', 'blocked_until'
    ) THEN p_sort_column
    ELSE 'attempted_at'
  END;

  -- ── Pagination safety clamp ─────────────────────────────
  p_page_index := GREATEST(COALESCE(p_page_index, 1), 1);
  p_page_size  := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_offset := (p_page_index - 1) * p_page_size;

  -- Build dynamic SQL with filters
  v_sql := 'SELECT
    la.id,
    la.user_id,
    u.first_name,
    u.last_name,
    u.email,
    u.mobile,
    la.identifier,
    la.ip_address,
    la.user_agent,
    la.device_type,
    la.os,
    la.browser,
    la.status,
    la.failure_reason,
    la.blocked_until,
    la.attempted_at,
    COUNT(*) OVER() as total_count
  FROM login_attempts la
  LEFT JOIN users u ON la.user_id = u.id
  WHERE 1=1';

  -- Add optional filters
  IF p_id IS NOT NULL THEN
    v_sql := v_sql || ' AND la.id = ' || p_id;
  END IF;

  IF p_user_id IS NOT NULL THEN
    v_sql := v_sql || ' AND la.user_id = ' || p_user_id;
  END IF;

  IF p_identifier IS NOT NULL THEN
    v_sql := v_sql || ' AND la.identifier = ' || quote_literal(p_identifier);
  END IF;

  IF p_status IS NOT NULL THEN
    v_sql := v_sql || ' AND la.status = ' || quote_literal(p_status::text);
  END IF;

  IF p_ip_address IS NOT NULL THEN
    v_sql := v_sql || ' AND la.ip_address = ' || quote_literal(p_ip_address::text) || '::inet';
  END IF;

  IF p_from_date IS NOT NULL THEN
    v_sql := v_sql || ' AND la.attempted_at >= ' || quote_literal(p_from_date::text) || '::timestamptz';
  END IF;

  IF p_to_date IS NOT NULL THEN
    v_sql := v_sql || ' AND la.attempted_at <= ' || quote_literal(p_to_date::text) || '::timestamptz';
  END IF;

  -- Full-text search on identifier, email, mobile
  IF p_search_term IS NOT NULL AND p_search_term != '' THEN
    v_sql := v_sql || ' AND (
      la.identifier ILIKE ' || quote_literal('%' || p_search_term || '%') || '
      OR u.email ILIKE ' || quote_literal('%' || p_search_term || '%') || '
      OR u.mobile ILIKE ' || quote_literal('%' || p_search_term || '%') || '
      OR u.first_name ILIKE ' || quote_literal('%' || p_search_term || '%') || '
      OR u.last_name ILIKE ' || quote_literal('%' || p_search_term || '%') || '
    )';
  END IF;

  -- Add ordering and pagination
  v_sql := v_sql || ' ORDER BY la.' || quote_ident(p_sort_column) || ' ' || v_sort_order || '
    LIMIT ' || p_page_size || ' OFFSET ' || v_offset;

  -- Execute and return
  RETURN QUERY EXECUTE v_sql;
END;
$$;

-- ============================================================================
-- TESTING / EXAMPLES (uncomment to run)
-- ============================================================================

/*
-- Get all failed attempts, latest first
SELECT id, identifier, status, failure_reason, attempted_at
  FROM udf_get_login_attempts(
    p_status => 'failed'::login_attempt_status,
    p_sort_column => 'attempted_at',
    p_sort_direction => 'DESC',
    p_page_size => 20
  )
  LIMIT 20;

-- Get attempts for a specific user with pagination
SELECT id, email, identifier, status, attempted_at, total_count
  FROM udf_get_login_attempts(
    p_user_id => 123,
    p_page_index => 1,
    p_page_size => 50
  );

-- Find attempts from a specific IP in the last 7 days
SELECT id, identifier, status, ip_address, attempted_at
  FROM udf_get_login_attempts(
    p_ip_address => '192.168.1.100'::inet,
    p_from_date => CURRENT_TIMESTAMP - INTERVAL '7 days',
    p_page_size => 100
  )
  ORDER BY attempted_at DESC;

-- Search for attempts matching email pattern
SELECT id, email, identifier, device_type, status, attempted_at
  FROM udf_get_login_attempts(
    p_search_term => 'example.com',
    p_page_size => 50
  );

-- Get blocked attempts with blocking details
SELECT id, identifier, status, blocked_until, attempted_at
  FROM udf_get_login_attempts(
    p_status => 'blocked'::login_attempt_status,
    p_sort_column => 'blocked_until',
    p_sort_direction => 'DESC',
    p_page_size => 100
  );
*/
