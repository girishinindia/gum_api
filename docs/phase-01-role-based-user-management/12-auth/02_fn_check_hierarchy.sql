/**
 * Purpose: Check role-based hierarchy access control for user actions
 * Validates caller's permissions against target user based on role levels
 * Depends: users table, roles table
 * Usage: SELECT udf_check_hierarchy_access(p_caller_id, p_target_id, 'edit');
 */

CREATE OR REPLACE FUNCTION udf_check_hierarchy_access(
    p_caller_id BIGINT,
    p_target_id BIGINT,
    p_action TEXT DEFAULT 'view'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role_level INT;
    v_target_role_level INT;
    v_caller_exists BOOLEAN;
    v_target_exists BOOLEAN;
    v_allowed BOOLEAN;
    v_message TEXT;
BEGIN
    -- Get caller's role level
    SELECT r.level INTO v_caller_role_level
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_caller_id
      AND u.is_deleted = FALSE
    LIMIT 1;

    IF v_caller_role_level IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Caller user does not exist or is deleted',
            'caller_role_level', NULL,
            'target_role_level', NULL
        );
    END IF;

    v_caller_exists := TRUE;

    -- Get target's role level.
    -- For 'restore' the target is *expected* to be soft-deleted, so we
    -- intentionally do not filter on is_deleted for that action.
    SELECT r.level INTO v_target_role_level
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_target_id
      AND (p_action = 'restore' OR u.is_deleted = FALSE)
    LIMIT 1;

    IF v_target_role_level IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Target user does not exist or is deleted',
            'caller_role_level', v_caller_role_level,
            'target_role_level', NULL
        );
    END IF;

    v_target_exists := TRUE;

    -- Initialize default denied
    v_allowed := FALSE;
    v_message := 'Access denied';

    -- Super Admin (level 0) permissions
    IF v_caller_role_level = 0 THEN
        IF p_action = 'delete' OR p_action = 'deactivate' THEN
            -- Cannot delete/deactivate other super admins
            IF v_target_role_level = 0 THEN
                v_allowed := FALSE;
                v_message := 'Cannot delete or deactivate other super administrators';
            -- Cannot delete primary super admin (id=1)
            ELSIF p_target_id = 1 THEN
                v_allowed := FALSE;
                v_message := 'Cannot delete or deactivate the primary super administrator';
            ELSE
                v_allowed := TRUE;
                v_message := 'Access granted';
            END IF;
        ELSE
            -- All other actions allowed
            v_allowed := TRUE;
            v_message := 'Access granted';
        END IF;

    -- Admin (level 1) permissions
    ELSIF v_caller_role_level = 1 THEN
        -- Admin cannot see super admins
        IF v_target_role_level = 0 THEN
            v_allowed := FALSE;
            v_message := 'Cannot access super administrator accounts';
        -- Cannot delete or restore anyone
        ELSIF p_action = 'delete' OR p_action = 'restore' THEN
            v_allowed := FALSE;
            v_message := 'Admins cannot delete or restore user accounts';
        -- Cannot change roles
        ELSIF p_action = 'change_role' THEN
            v_allowed := FALSE;
            v_message := 'Admins cannot change user roles';
        -- Can view/edit/deactivate/set_verification on users below their level
        ELSIF p_action = 'view' OR p_action = 'edit' OR p_action = 'deactivate'
              OR p_action = 'set_verification' THEN
            IF v_target_role_level > v_caller_role_level THEN
                v_allowed := TRUE;
                v_message := 'Access granted';
            ELSE
                v_allowed := FALSE;
                v_message := 'Can only manage users with lower privilege level';
            END IF;
        ELSE
            v_allowed := FALSE;
            v_message := 'Action not permitted for admin role';
        END IF;

    -- Other roles (level 3+) - can only view/edit themselves
    ELSE
        IF p_action = 'create' THEN
            v_allowed := FALSE;
            v_message := 'Only admins and super admins can create users';
        ELSIF p_action = 'delete' OR p_action = 'restore' OR p_action = 'change_role' OR p_action = 'deactivate' THEN
            v_allowed := FALSE;
            v_message := 'Only admins can perform this action';
        ELSIF p_caller_id = p_target_id THEN
            v_allowed := TRUE;
            v_message := 'Access granted';
        ELSE
            v_allowed := FALSE;
            v_message := 'Can only manage your own account';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', v_allowed,
        'message', v_message,
        'caller_role_level', v_caller_role_level,
        'target_role_level', v_target_role_level
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Error checking hierarchy access: ' || SQLERRM,
        'caller_role_level', v_caller_role_level,
        'target_role_level', v_target_role_level
    );
END;
$$;

-- Testing queries (commented out)
/*
-- Super Admin (id=1, level=1) viewing another user
SELECT udf_check_hierarchy_access(1, 8, 'view');

-- Super Admin trying to delete another super admin
SELECT udf_check_hierarchy_access(1, 2, 'delete');

-- Super Admin trying to delete primary super admin
SELECT udf_check_hierarchy_access(1, 1, 'delete');

-- Admin (id=2, level=2) viewing student
SELECT udf_check_hierarchy_access(2, 8, 'view');

-- Admin trying to view super admin
SELECT udf_check_hierarchy_access(2, 1, 'view');

-- Student trying to edit another student
SELECT udf_check_hierarchy_access(8, 9, 'edit');

-- Student editing self
SELECT udf_check_hierarchy_access(8, 8, 'edit');
*/
