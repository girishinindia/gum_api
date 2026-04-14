// ═══════════════════════════════════════════════════════════════
// /api/v1/user-skills router — phase 04.
//
// Authorization model (permission codes seeded by
// phase-04/02_seed_permissions.sql for the 'user_skill'
// resource — note singular):
//
//   GET    /                   user_skill.read                 (admin+)
//   GET    /me                 user_skill.read.own             (self, all roles)
//   POST   /me                 user_skill.update.own           (self, creates own row)
//   PATCH  /me/:id             user_skill.update.own           (self-match enforced)
//   DELETE /me/:id             user_skill.delete.own           (self-match enforced)
//   GET    /:id                user_skill.read
//                              OR  user_skill.read.own     (+ self match)
//   POST   /                   user_skill.create               (admin+, targets any userId)
//   PATCH  /:id                user_skill.update
//                              OR  user_skill.update.own   (+ self match)
//   DELETE /:id                user_skill.delete
//                              OR  user_skill.delete.own   (+ self match)
//   POST   /:id/restore        user_skill.restore              (admin+)
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
import * as userSkillsService from '../../../modules/user-skills/user-skills.service';
import {
  createMyUserSkillBodySchema,
  createUserSkillBodySchema,
  listUserSkillsQuerySchema,
  updateUserSkillBodySchema,
  type CreateMyUserSkillBody,
  type CreateUserSkillBody,
  type ListUserSkillsQuery,
  type UpdateUserSkillBody
} from '../../../modules/user-skills/user-skills.schemas';

const router = Router();

router.use(authenticate);
router.use(gateSoftDeleteFilters);

// ═══════════════════════════════════════════════════════════════
// /me routes — must come BEFORE /:id so Express doesn't treat
// "me" as an id segment.
// ═══════════════════════════════════════════════════════════════

router.get(
  '/me',
  authorize('user_skill.read.own'),
  validate({ query: listUserSkillsQuerySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const q = req.query as unknown as ListUserSkillsQuery;
    const { rows, meta } = await userSkillsService.listUserSkills({
      ...q,
      userId
    });
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/me',
  authorize('user_skill.update.own'),
  validate({ body: createMyUserSkillBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body as CreateMyUserSkillBody;
    const result = await userSkillsService.createMyUserSkill(userId, body);
    const row = await userSkillsService.getUserSkillById(result.id);
    return created(res, row, 'User skill created');
  })
);

router.patch(
  '/me/:id',
  validate({ params: idParamSchema, body: updateUserSkillBodySchema }),
  authorize('user_skill.update.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userSkillsService.getUserSkillById(id);

    if (!existing) throw AppError.notFound(`User skill ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only edit your own skills.',
        403,
        'FORBIDDEN'
      );
    }

    const body = req.body as UpdateUserSkillBody;
    await userSkillsService.updateUserSkill(id, body, userId);
    const row = await userSkillsService.getUserSkillById(id);
    return ok(res, row, 'User skill updated');
  })
);

router.delete(
  '/me/:id',
  validate({ params: idParamSchema }),
  authorize('user_skill.delete.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userSkillsService.getUserSkillById(id);

    if (!existing) throw AppError.notFound(`User skill ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only delete your own skills.',
        403,
        'FORBIDDEN'
      );
    }

    await userSkillsService.deleteUserSkill(id, userId);
    return ok(res, { id, deleted: true }, 'User skill deleted');
  })
);

// ═══════════════════════════════════════════════════════════════
// Admin + shared endpoints
// ═══════════════════════════════════════════════════════════════

router.get(
  '/',
  authorize('user_skill.read'),
  validate({ query: listUserSkillsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUserSkillsQuery;
    const { rows, meta } = await userSkillsService.listUserSkills(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/',
  authorize('user_skill.create'),
  validate({ body: createUserSkillBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserSkillBody;
    const result = await userSkillsService.createUserSkill(
      body,
      req.user?.id ?? null
    );
    const row = await userSkillsService.getUserSkillById(result.id);
    return created(res, row, 'User skill created');
  })
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_skill.read',
    ownPermission: 'user_skill.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userSkillsService.getUserSkillById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await userSkillsService.getUserSkillById(id);
    if (!row) throw AppError.notFound(`User skill ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserSkillBodySchema }),
  authorizeSelfOr({
    globalPermission: 'user_skill.update',
    ownPermission: 'user_skill.update.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userSkillsService.getUserSkillById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateUserSkillBody;
    await userSkillsService.updateUserSkill(id, body, req.user?.id ?? null);
    const row = await userSkillsService.getUserSkillById(id);
    return ok(res, row, 'User skill updated');
  })
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_skill.delete',
    ownPermission: 'user_skill.delete.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userSkillsService.getUserSkillById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userSkillsService.deleteUserSkill(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'User skill deleted');
  })
);

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  validate({ params: idParamSchema }),
  authorize('user_skill.restore'),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userSkillsService.getUserSkillByIdIncludingDeleted(id);
    if (!existing) {
      throw AppError.notFound(`User skill ${id} not found`);
    }
    if (!existing.isDeleted) {
      throw new AppError(
        `User skill ${id} is not deleted; nothing to restore`,
        400,
        'BAD_REQUEST'
      );
    }

    await userSkillsService.restoreUserSkill(id, req.user?.id ?? null);
    const row = await userSkillsService.getUserSkillById(id);
    return ok(res, row, 'User skill restored');
  })
);

export default router;
