// ═══════════════════════════════════════════════════════════════
// /api/v1/users router — user CRUD + admin ops with hierarchy
// enforcement.
//
// Authorization model (permission codes seeded by
// udf_auto_create_resource_permissions for the 'user' resource):
//
//   GET    /                       user.read
//   GET    /:id                    user.read
//   POST   /                       user.create
//   PATCH  /:id                    user.update
//   DELETE /:id                    user.delete
//   POST   /:id/restore            user.restore
//
// Step 11 admin operations (added to this router because they
// fit the resource shape, even though they call udf_auth_*):
//
//   POST /:id/change-role          user.update     (super-admin only)
//   POST /:id/deactivate           user.update     (super-admin only)
//   POST /:id/set-verification     user.update     (admin or super-admin)
//
// All hierarchy-protected UDFs receive `req.user.id` as
// `p_caller_id` so the database can do the real authz check.
//
// Email / mobile / password changes still live on the auth router —
// those are user-self flows; the ops above are admin-on-other-user.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as usersService from '../../../modules/users/users.service';
import {
  changeUserRoleBodySchema,
  createUserBodySchema,
  listUsersQuerySchema,
  setVerificationBodySchema,
  updateUserBodySchema,
  type ChangeUserRoleBody,
  type CreateUserBody,
  type ListUsersQuery,
  type SetVerificationBody,
  type UpdateUserBody
} from '../../../modules/users/users.schemas';

const router = Router();

router.use(authenticate);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('user.read'),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUsersQuery;
    const { rows, meta } = await usersService.listUsers(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET /:id  read one ─────────────────────────────────────────

router.get(
  '/:id',
  authorize('user.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const user = await usersService.getUserById(id);
    if (!user) throw AppError.notFound(`User ${id} not found`);
    return ok(res, user, 'OK');
  })
);

// ─── POST /  create ──────────────────────────────────────────────

router.post(
  '/',
  authorize('user.create'),
  validate({ body: createUserBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserBody;
    const result = await usersService.createUser(body, req.user?.id ?? null);
    const user = await usersService.getUserById(result.id);
    return created(res, user, 'User created');
  })
);

// ─── PATCH /:id  update ──────────────────────────────────────────

router.patch(
  '/:id',
  authorize('user.update'),
  validate({ params: idParamSchema, body: updateUserBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateUserBody;
    await usersService.updateUser(id, body, req.user?.id ?? null);
    const user = await usersService.getUserById(id);
    return ok(res, user, 'User updated');
  })
);

// ─── DELETE /:id  soft delete (hierarchy protected) ─────────────

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('user.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await usersService.deleteUser(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'User deleted');
  })
);

// ─── POST /:id/restore  restore (hierarchy protected) ──────────

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('user.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await usersService.restoreUser(id, req.user?.id ?? null);
    const user = await usersService.getUserById(id);
    return ok(res, user, 'User restored');
  })
);

// ─── POST /:id/change-role  (super-admin only) ──────────────────

router.post(
  '/:id/change-role',
  authorize('user.update'),
  validate({ params: idParamSchema, body: changeUserRoleBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as ChangeUserRoleBody;
    await usersService.changeUserRole(id, body.roleId, req.user?.id ?? null);
    const user = await usersService.getUserById(id);
    return ok(res, user, 'User role changed');
  })
);

// ─── POST /:id/deactivate  (super-admin only) ───────────────────
//
// Distinct from DELETE: deactivate flips is_active=FALSE and
// revokes sessions but does NOT soft-delete the user.

router.post(
  '/:id/deactivate',
  authorize('user.update'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await usersService.deactivateUser(id, req.user?.id ?? null);
    const user = await usersService.getUserById(id);
    return ok(res, user, 'User deactivated');
  })
);

// ─── POST /:id/set-verification  (admin or super-admin) ────────

router.post(
  '/:id/set-verification',
  authorize('user.update'),
  validate({ params: idParamSchema, body: setVerificationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as SetVerificationBody;
    await usersService.setUserVerification(
      id,
      {
        isEmailVerified: body.isEmailVerified,
        isMobileVerified: body.isMobileVerified
      },
      req.user?.id ?? null
    );
    const user = await usersService.getUserById(id);
    return ok(res, user, 'Verification status updated');
  })
);

export default router;
