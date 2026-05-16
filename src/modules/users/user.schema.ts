import { z } from 'zod';

/**
 * Allow-list of roles a user can self-assign immediately after signup.
 * Anything else (admin, faculty, super_admin) must be granted by a
 * super admin via the gated `POST /users/:id/roles` endpoint.
 *
 * This list is intentionally short — adding to it is a security-sensitive
 * change because the endpoint is gated only by `authMiddleware`, meaning
 * any authenticated user can assign these roles to themselves.
 */
export const SELF_ASSIGNABLE_ROLES = ['student', 'instructor'] as const;
export type SelfAssignableRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

/** Body schema for POST /users/me/roles */
export const assignSelfRoleSchema = z.object({
  role: z.enum(SELF_ASSIGNABLE_ROLES),
});
