/*
 * User Contact Change Requests - View
 * Purpose: Join contact change requests with user details for easy querying
 * Depends: users table, user_contact_change_requests table
 * Usage: SELECT from uv_contact_change_requests to get enriched request data
 */

-- ============================================================================
-- VIEW: uv_contact_change_requests
-- ============================================================================
-- Provides a denormalized view of contact change requests with user details.
-- Uses security_invoker to respect row-level security policies.

CREATE VIEW uv_contact_change_requests WITH (security_invoker = true) AS
SELECT
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
    -- User details
    u.first_name,
    u.last_name,
    u.email,
    u.mobile
FROM user_contact_change_requests ucr
JOIN users u ON ucr.user_id = u.id;

-- ============================================================================
-- TESTING QUERIES (commented out)
-- ============================================================================

/*

-- Query view (assuming test data exists)
SELECT * FROM uv_contact_change_requests LIMIT 5;

-- Filter by user
SELECT * FROM uv_contact_change_requests WHERE user_id = 1;

-- Filter by change type
SELECT * FROM uv_contact_change_requests WHERE change_type = 'email';

-- Filter by status
SELECT * FROM uv_contact_change_requests WHERE status = 'pending';

*/
