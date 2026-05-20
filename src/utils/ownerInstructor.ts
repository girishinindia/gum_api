import { supabase } from '../config/supabase';

/**
 * Phase 45 — Owner ↔ Instructor validation, shared by bundles, webinars and
 * course_batches.
 *
 * Rule (matches the owner-aware picker in the admin portal):
 *   • owner === 'instructor'  → instructor_id REQUIRED and must reference a
 *                               user with users.type = 'instructor'
 *   • any other owner (gum_admin / system) → instructor_id OPTIONAL, but when
 *                               set it must reference a user holding the
 *                               super_admin role (user_roles.role_id = 1)
 *
 * Returns a human-friendly error string when invalid, or null when OK.
 * Enforced at the API layer (not a DB trigger) so it only fires on the writes
 * that actually change owner/instructor and never blocks unrelated edits to
 * legacy rows.
 */
export const SUPER_ADMIN_ROLE_ID = 1;

export async function validateOwnerInstructor(
  owner: string | null | undefined,
  instructorId: number | null | undefined,
): Promise<string | null> {
  if (owner === 'instructor') {
    if (instructorId == null) {
      return 'An instructor must be selected when the owner is "Instructor".';
    }
    const { data: user } = await supabase
      .from('users')
      .select('id, type')
      .eq('id', instructorId)
      .single();
    if (!user) return 'The selected instructor was not found.';
    if (user.type !== 'instructor') {
      return 'The selected user is not an instructor — pick a user whose type is Instructor.';
    }
    return null;
  }

  // Admin / system owner — instructor is optional, but if present must be a super admin.
  if (instructorId == null) return null;

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('id', instructorId)
    .single();
  if (!user) return 'The selected user was not found.';

  const { data: role } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('user_id', instructorId)
    .eq('role_id', SUPER_ADMIN_ROLE_ID)
    .maybeSingle();
  if (!role) {
    return 'For an admin-owned item the selected user must be a Super Admin.';
  }
  return null;
}
