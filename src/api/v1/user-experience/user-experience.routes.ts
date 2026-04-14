// ═══════════════════════════════════════════════════════════════
// /api/v1/user-experience router — phase 04.
//
// Authorization model (permission codes seeded by
// phase-04 for the 'user_experience' resource):
//
//   GET    /                   user_experience.read                 (admin+)
//   GET    /me                 user_experience.read.own             (self, all roles)
//   POST   /me                 user_experience.update.own           (self, creates own row)
//   PATCH  /me/:id             user_experience.update.own           (self-match enforced)
//   DELETE /me/:id             user_experience.delete.own           (self-match enforced)
//   GET    /:id                user_experience.read
//                              OR  user_experience.read.own     (+ self match)
//   POST   /                   user_experience.create               (admin+, targets any userId)
//   PATCH  /:id                user_experience.update
//                              OR  user_experience.update.own   (+ self match)
//   DELETE /:id                user_experience.delete
//                              OR  user_experience.delete.own   (+ self match)
//   POST   /:id/restore        user_experience.restore             (admin+)
//
// Authority summary:
//   • Super Admin: everything
//   • Admin:       everything EXCEPT the global user_experience.delete
//                  (admin keeps delete.own to manage their own rows,
//                   AND user_experience.restore to un-soft-delete rows)
//   • Instructor:  only self — read.own + update.own + delete.own
//   • Student:     same as instructor
//
// Deletion is SOFT-DELETE — the row is hidden from default GETs but
// still present in the table. Admin+ can un-delete via POST /:id/restore.
// Instructor/student have no restore path and must ask an admin.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { authorizeSelfOr } from '../../../core/middlewares/authorize-self-or';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as userExperienceService from '../../../modules/user-experience/user-experience.service';
import {
  createMyUserExperienceBodySchema,
  createUserExperienceBodySchema,
  listUserExperienceQuerySchema,
  updateUserExperienceBodySchema,
  type CreateMyUserExperienceBody,
  type CreateUserExperienceBody,
  type ListUserExperienceQuery,
  type UpdateUserExperienceBody
} from '../../../modules/user-experience/user-experience.schemas';

const router = Router();

router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
// /me routes — must come BEFORE /:id so Express doesn't treat
// "me" as an id segment.
// ═══════════════════════════════════════════════════════════════

// ─── GET /me  (list own experience history) ────────────────────

router.get(
  '/me',
  authorize('user_experience.read.own'),
  validate({ query: listUserExperienceQuerySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const q = req.query as unknown as ListUserExperienceQuery;
    // Force the ownership filter server-side so a student can't list
    // someone else's rows by omitting userId.
    const { rows, meta } = await userExperienceService.listUserExperience({
      ...q,
      userId
    });
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── POST /me  (self-service create) ────────────────────────────

router.post(
  '/me',
  authorize('user_experience.update.own'),
  validate({ body: createMyUserExperienceBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body as CreateMyUserExperienceBody;
    const result = await userExperienceService.createMyUserExperience(userId, body);
    const row = await userExperienceService.getUserExperienceById(result.id);
    return created(res, row, 'Experience record created');
  })
);

// ─── PATCH /me/:id  (self-service update) ───────────────────────

router.patch(
  '/me/:id',
  validate({ params: idParamSchema, body: updateUserExperienceBodySchema }),
  authorize('user_experience.update.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userExperienceService.getUserExperienceById(id);

    if (!existing) throw AppError.notFound(`Experience record ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only edit your own experience records.',
        403,
        'FORBIDDEN'
      );
    }

    const body = req.body as UpdateUserExperienceBody;
    await userExperienceService.updateUserExperience(id, body, userId);
    const row = await userExperienceService.getUserExperienceById(id);
    return ok(res, row, 'Experience record updated');
  })
);

// ─── DELETE /me/:id  (self-service soft-delete) ─────────────────

router.delete(
  '/me/:id',
  validate({ params: idParamSchema }),
  authorize('user_experience.delete.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userExperienceService.getUserExperienceById(id);

    if (!existing) throw AppError.notFound(`Experience record ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only delete your own experience records.',
        403,
        'FORBIDDEN'
      );
    }

    await userExperienceService.deleteUserExperience(id, userId);
    return ok(res, { id, deleted: true }, 'Experience record deleted');
  })
);

// ═══════════════════════════════════════════════════════════════
// Admin + shared endpoints
// ═══════════════════════════════════════════════════════════════

// ─── GET /  list (admin+) ───────────────────────────────────────

router.get(
  '/',
  authorize('user_experience.read'),
  validate({ query: listUserExperienceQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUserExperienceQuery;
    const { rows, meta } = await userExperienceService.listUserExperience(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── POST /  create (admin+, targets any userId) ───────────────

router.post(
  '/',
  authorize('user_experience.create'),
  validate({ body: createUserExperienceBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserExperienceBody;
    const result = await userExperienceService.createUserExperience(
      body,
      req.user?.id ?? null
    );
    const row = await userExperienceService.getUserExperienceById(result.id);
    return created(res, row, 'Experience record created');
  })
);

// ─── GET /:id  (self-or-admin) ──────────────────────────────────

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_experience.read',
    ownPermission: 'user_experience.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userExperienceService.getUserExperienceById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await userExperienceService.getUserExperienceById(id);
    if (!row) throw AppError.notFound(`Experience record ${id} not found`);
    return ok(res, row, 'OK');
  })
);

// ─── PATCH /:id  (self-or-admin) ────────────────────────────────

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserExperienceBodySchema }),
  authorizeSelfOr({
    globalPermission: 'user_experience.update',
    ownPermission: 'user_experience.update.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userExperienceService.getUserExperienceById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateUserExperienceBody;
    await userExperienceService.updateUserExperience(id, body, req.user?.id ?? null);
    const row = await userExperienceService.getUserExperienceById(id);
    return ok(res, row, 'Experience record updated');
  })
);

// ─── DELETE /:id  (self-or-admin, soft-delete) ─────────────────

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_experience.delete',
    ownPermission: 'user_experience.delete.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userExperienceService.getUserExperienceById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userExperienceService.deleteUserExperience(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Experience record deleted');
  })
);

// ─── POST /:id/restore  (admin+ only, un-soft-delete) ──────────

router.post(
  '/:id/restore',
  validate({ params: idParamSchema }),
  authorize('user_experience.restore'),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const existing =
      await userExperienceService.getUserExperienceByIdIncludingDeleted(id);
    if (!existing) {
      throw AppError.notFound(`Experience record ${id} not found`);
    }
    if (!existing.isDeleted) {
      throw new AppError(
        `Experience record ${id} is not deleted; nothing to restore`,
        400,
        'BAD_REQUEST'
      );
    }

    await userExperienceService.restoreUserExperience(id, req.user?.id ?? null);
    const row = await userExperienceService.getUserExperienceById(id);
    return ok(res, row, 'Experience record restored');
  })
);

export default router;
