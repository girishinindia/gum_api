-- ============================================================
-- 21_profile_permissions.sql — Add permissions for profile resources
-- so non-admin users with roles can access profiles via RBAC
-- ============================================================

-- ── Employee Profile permissions ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('employee_profile', 'create',      'Create Employee Profile',       'Create employee profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('employee_profile', 'read',        'View Employee Profiles',        'View employee profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('employee_profile', 'update',      'Update Employee Profile',       'Update employee profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('employee_profile', 'delete',      'Delete Employee Profile',       'Permanently delete employee profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('employee_profile', 'soft_delete', 'Soft Delete Employee Profile',  'Soft delete employee profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('employee_profile', 'restore',     'Restore Employee Profile',      'Restore soft-deleted employee profile records')
ON CONFLICT (resource, action) DO NOTHING;

-- ── Student Profile permissions ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('student_profile', 'create',      'Create Student Profile',       'Create student profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('student_profile', 'read',        'View Student Profiles',        'View student profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('student_profile', 'update',      'Update Student Profile',       'Update student profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('student_profile', 'delete',      'Delete Student Profile',       'Permanently delete student profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('student_profile', 'soft_delete', 'Soft Delete Student Profile',  'Soft delete student profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('student_profile', 'restore',     'Restore Student Profile',      'Restore soft-deleted student profile records')
ON CONFLICT (resource, action) DO NOTHING;

-- ── Instructor Profile permissions ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('instructor_profile', 'create',      'Create Instructor Profile',       'Create instructor profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('instructor_profile', 'read',        'View Instructor Profiles',        'View instructor profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('instructor_profile', 'update',      'Update Instructor Profile',       'Update instructor profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('instructor_profile', 'delete',      'Delete Instructor Profile',       'Permanently delete instructor profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('instructor_profile', 'soft_delete', 'Soft Delete Instructor Profile',  'Soft delete instructor profile records')
ON CONFLICT (resource, action) DO NOTHING;
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('instructor_profile', 'restore',     'Restore Instructor Profile',      'Restore soft-deleted instructor profile records')
ON CONFLICT (resource, action) DO NOTHING;
