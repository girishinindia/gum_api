/*
 * Purpose:
 *   Provide a flexible, dynamic get function for querying user sessions.
 *   Supports filtering, searching, sorting, and pagination.
 *   Never returns session_token or refresh_token in results.
 *
 * Depends:
 *   - user_sessions table
 *   - users table
 *
 * Parameters:
 *   - p_id: Filter by specific session ID (optional)
 *   - p_user_id: Filter by user ID (optional)
 *   - p_is_active: Filter by active status (optional)
 *   - p_filter_device_type: Filter by device type (optional)
 *   - p_filter_os: Filter by OS (optional)
 *   - p_filter_browser: Filter by browser (optional)
 *   - p_search_term: Search across user name, email, device, os, browser (optional)
 *   - p_sort_column: Column to sort by (default: 'created_at', whitelisted)
 *   - p_sort_direction: ASC or DESC (default: 'DESC')
 *   - p_page_index: 1-based page index (default: 1, min: 1)
 *   - p_page_size: Records per page (default: 20, min: 1, max: 100)
 *
 * Returns:
 *   SETOF RECORD with columns: id, user_id, first_name, last_name, email, role_id,
 *   ip_address, user_agent, device_type, os, browser, location, login_at, expires_at,
 *   last_active_at, revoked_at, is_active, created_at, updated_at, total_count
 */

CREATE OR REPLACE FUNCTION udf_get_sessions(
  p_id BIGINT DEFAULT NULL,
  p_user_id BIGINT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_filter_device_type TEXT DEFAULT NULL,
  p_filter_os TEXT DEFAULT NULL,
  p_filter_browser TEXT DEFAULT NULL,
  p_search_term TEXT DEFAULT NULL,
  p_sort_column TEXT DEFAULT 'created_at',
  p_sort_direction TEXT DEFAULT 'DESC',
  p_page_index INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id BIGINT,
  user_id BIGINT,
  first_name TEXT,
  last_name TEXT,
  email CITEXT,
  role_id BIGINT,
  ip_address INET,
  user_agent TEXT,
  device_type TEXT,
  os TEXT,
  browser TEXT,
  location JSONB,
  login_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_offset INTEGER;
  v_sort_sql TEXT;
  v_where_clauses TEXT[] := ARRAY[]::TEXT[];
  v_where_sql TEXT;
BEGIN
  -- ── Pagination safety clamp (1-based) ───────────────────
  p_page_index := GREATEST(COALESCE(p_page_index, 1), 1);
  p_page_size  := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_offset := (p_page_index - 1) * p_page_size;

  -- Build WHERE clause conditions dynamically
  IF p_id IS NOT NULL THEN
    v_where_clauses := array_append(v_where_clauses, 'us.id = ' || p_id);
  END IF;

  IF p_user_id IS NOT NULL THEN
    v_where_clauses := array_append(v_where_clauses, 'us.user_id = ' || p_user_id);
  END IF;

  IF p_is_active IS NOT NULL THEN
    v_where_clauses := array_append(v_where_clauses, 'us.is_active = ' || p_is_active);
  END IF;

  IF p_filter_device_type IS NOT NULL THEN
    v_where_clauses := array_append(
      v_where_clauses,
      'us.device_type ILIKE ' || quote_literal('%' || p_filter_device_type || '%')
    );
  END IF;

  IF p_filter_os IS NOT NULL THEN
    v_where_clauses := array_append(
      v_where_clauses,
      'us.os ILIKE ' || quote_literal('%' || p_filter_os || '%')
    );
  END IF;

  IF p_filter_browser IS NOT NULL THEN
    v_where_clauses := array_append(
      v_where_clauses,
      'us.browser ILIKE ' || quote_literal('%' || p_filter_browser || '%')
    );
  END IF;

  -- Build search condition (searches across multiple fields)
  IF p_search_term IS NOT NULL AND p_search_term != '' THEN
    v_where_clauses := array_append(
      v_where_clauses,
      '(' ||
        'u.first_name ILIKE ' || quote_literal('%' || p_search_term || '%') || ' OR ' ||
        'u.last_name ILIKE ' || quote_literal('%' || p_search_term || '%') || ' OR ' ||
        'u.email ILIKE ' || quote_literal('%' || p_search_term || '%') || ' OR ' ||
        'us.device_type ILIKE ' || quote_literal('%' || p_search_term || '%') || ' OR ' ||
        'us.os ILIKE ' || quote_literal('%' || p_search_term || '%') || ' OR ' ||
        'us.browser ILIKE ' || quote_literal('%' || p_search_term || '%') ||
      ')'
    );
  END IF;

  -- Build final WHERE clause
  IF array_length(v_where_clauses, 1) > 0 THEN
    v_where_sql := 'WHERE ' || array_to_string(v_where_clauses, ' AND ');
  ELSE
    v_where_sql := '';
  END IF;

  -- Whitelist sort columns to prevent SQL injection
  CASE p_sort_column
    WHEN 'created_at' THEN v_sort_sql := 'us.created_at';
    WHEN 'login_at' THEN v_sort_sql := 'us.login_at';
    WHEN 'last_active_at' THEN v_sort_sql := 'us.last_active_at';
    WHEN 'expires_at' THEN v_sort_sql := 'us.expires_at';
    WHEN 'user_id' THEN v_sort_sql := 'us.user_id';
    WHEN 'is_active' THEN v_sort_sql := 'us.is_active';
    WHEN 'device_type' THEN v_sort_sql := 'us.device_type';
    WHEN 'browser' THEN v_sort_sql := 'us.browser';
    WHEN 'os' THEN v_sort_sql := 'us.os';
    ELSE v_sort_sql := 'us.created_at'; -- Default fallback
  END CASE;

  -- Validate sort direction
  IF UPPER(p_sort_direction) NOT IN ('ASC', 'DESC') THEN
    p_sort_direction := 'DESC';
  END IF;

  v_sort_sql := v_sort_sql || ' ' || UPPER(p_sort_direction);

  -- Execute dynamic query with pagination and total count
  RETURN QUERY EXECUTE
    'SELECT
      us.id,
      us.user_id,
      u.first_name,
      u.last_name,
      u.email,
      u.role_id,
      us.ip_address,
      us.user_agent,
      us.device_type,
      us.os,
      us.browser,
      us.location,
      us.login_at,
      us.expires_at,
      us.last_active_at,
      us.revoked_at,
      us.is_active,
      us.created_at,
      us.updated_at,
      COUNT(*) OVER () as total_count
    FROM
      user_sessions us
      INNER JOIN users u ON us.user_id = u.id
    ' || v_where_sql || '
    ORDER BY ' || v_sort_sql || '
    LIMIT ' || p_page_size || ' OFFSET ' || v_offset;

END;
$$;

-- Add function comment

/*
 * Testing Queries
 * ===============
 *
 * -- Get all sessions
 * SELECT * FROM udf_get_sessions() LIMIT 10;
 *
 * -- Get sessions for specific user
 * SELECT * FROM udf_get_sessions(p_user_id := 1);
 *
 * -- Get only active sessions
 * SELECT * FROM udf_get_sessions(p_is_active := true);
 *
 * -- Search for sessions by device
 * SELECT * FROM udf_get_sessions(p_search_term := 'iPhone');
 *
 * -- Filter by device type
 * SELECT * FROM udf_get_sessions(p_filter_device_type := 'mobile');
 *
 * -- Get sessions with custom sorting and pagination
 * SELECT * FROM udf_get_sessions(
 *   p_sort_column := 'login_at',
 *   p_sort_direction := 'DESC',
 *   p_page_index := 1,
 *   p_page_size := 10
 * );
 *
 * -- Multiple filters combined
 * SELECT * FROM udf_get_sessions(
 *   p_user_id := 1,
 *   p_is_active := true,
 *   p_filter_os := 'iOS',
 *   p_search_term := 'Chrome'
 * );
 *
 * -- Verify tokens are not returned
 * SELECT column_name FROM information_schema.columns
 * WHERE table_name = 'udf_get_sessions'
 * AND (column_name LIKE '%token%')
 * ORDER BY column_name;
 */
