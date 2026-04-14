// ═══════════════════════════════════════════════════════════════
// /api/v1/user-projects router — phase 04.
//
// Authorization model (permission codes seeded by
// phase-04/02_seed_permissions.sql for the 'user_project'
// resource — note singular):
//
//   GET    /                   user_project.read                 (admin+)
//   GET    /me                 user_project.read.own             (self, all roles)
//   POST   /me                 user_project.update.own           (self, creates own row)
//   PATCH  /me/:id             user_project.update.own           (self-match enforced)
//   DELETE /me/:id             user_project.delete.own           (self-match enforced)
//   GET    /:id                user_project.read
//                              OR  user_project.read.own     (+ self match)
//   POST   /                   user_project.create               (admin+)
//   PATCH  /:id                user_project.update               (admin+)
//                              OR  user_project.update.own   (+ self match)
//   DELETE /:id                user_project.delete
//                              OR  user_project.delete.own   (+ self match)
//   POST   /:id/restore        user_project.restore              (admin+)
//
// Unlike user_documents, user_projects has NO admin-only workflow
// fields — isFeatured and isPublished are student-settable, so a
// single body schema covers both lanes. The /me routes simply
// derive userId from req.user.id rather than requiring it in body.
//
// Deletion is SOFT — the row is hidden from default GETs but still
// present in the table. Admin+ can un-delete via POST /:id/restore.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize, authorizeRole } from '../../../core/middlewares/authorize';
import { authorizeSelfOr } from '../../../core/middlewares/authorize-self-or';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as userProjectsService from '../../../modules/user-projects/user-projects.service';
import {
  createMyUserProjectBodySchema,
  createUserProjectBodySchema,
  listUserProjectsQuerySchema,
  updateUserProjectBodySchema,
  type CreateMyUserProjectBody,
  type CreateUserProjectBody,
  type ListUserProjectsQuery,
  type UpdateUserProjectBody
} from '../../../modules/user-projects/user-projects.schemas';

const router = Router();

router.use(authenticate);
router.use(gateSoftDeleteFilters);

// ═══════════════════════════════════════════════════════════════
// /me routes — must come BEFORE /:id so Express doesn't treat
// "me" as an id segment.
// ═══════════════════════════════════════════════════════════════

router.get(
  '/me',
  authorize('user_project.read.own'),
  validate({ query: listUserProjectsQuerySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const q = req.query as unknown as ListUserProjectsQuery;
    const { rows, meta } = await userProjectsService.listUserProjects({
      ...q,
      userId
    });
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/me',
  authorize('user_project.update.own'),
  validate({ body: createMyUserProjectBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body as CreateMyUserProjectBody;
    const result = await userProjectsService.createMyUserProject(userId, body);
    const row = await userProjectsService.getUserProjectById(result.id);
    return created(res, row, 'User project created');
  })
);

router.patch(
  '/me/:id',
  validate({ params: idParamSchema, body: updateUserProjectBodySchema }),
  authorize('user_project.update.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userProjectsService.getUserProjectById(id);

    if (!existing) throw AppError.notFound(`User project ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only edit your own projects.',
        403,
        'FORBIDDEN'
      );
    }

    const body = req.body as UpdateUserProjectBody;
    await userProjectsService.updateUserProject(id, body, userId);
    const row = await userProjectsService.getUserProjectById(id);
    return ok(res, row, 'User project updated');
  })
);

router.delete(
  '/me/:id',
  validate({ params: idParamSchema }),
  authorize('user_project.delete.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userProjectsService.getUserProjectById(id);

    if (!existing) throw AppError.notFound(`User project ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only delete your own projects.',
        403,
        'FORBIDDEN'
      );
    }

    await userProjectsService.deleteUserProject(id, userId);
    return ok(res, { id, deleted: true }, 'User project deleted');
  })
);

// ═══════════════════════════════════════════════════════════════
// Admin + shared endpoints
// ═══════════════════════════════════════════════════════════════

router.get(
  '/',
  authorize('user_project.read'),
  validate({ query: listUserProjectsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUserProjectsQuery;
    const { rows, meta } = await userProjectsService.listUserProjects(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/',
  authorize('user_project.create'),
  validate({ body: createUserProjectBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserProjectBody;
    const result = await userProjectsService.createUserProject(
      body,
      req.user?.id ?? null
    );
    const row = await userProjectsService.getUserProjectById(result.id);
    return created(res, row, 'User project created');
  })
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_project.read',
    ownPermission: 'user_project.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userProjectsService.getUserProjectById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await userProjectsService.getUserProjectById(id);
    if (!row) throw AppError.notFound(`User project ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserProjectBodySchema }),
  authorizeSelfOr({
    globalPermission: 'user_project.update',
    ownPermission: 'user_project.update.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userProjectsService.getUserProjectById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateUserProjectBody;
    await userProjectsService.updateUserProject(id, body, req.user?.id ?? null);
    const row = await userProjectsService.getUserProjectById(id);
    return ok(res, row, 'User project updated');
  })
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_project.delete',
    ownPermission: 'user_project.delete.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userProjectsService.getUserProjectById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userProjectsService.deleteUserProject(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'User project deleted');
  })
);

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  validate({ params: idParamSchema }),
  authorize('user_project.restore'),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userProjectsService.getUserProjectByIdIncludingDeleted(id);
    if (!existing) {
      throw AppError.notFound(`User project ${id} not found`);
    }
    if (!existing.isDeleted) {
      throw new AppError(
        `User project ${id} is not deleted; nothing to restore`,
        400,
        'BAD_REQUEST'
      );
    }

    await userProjectsService.restoreUserProject(id, req.user?.id ?? null);
    const row = await userProjectsService.getUserProjectById(id);
    return ok(res, row, 'User project restored');
  })
);

export default router;
