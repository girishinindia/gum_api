// ═══════════════════════════════════════════════════════════════
// /api/v1/user-languages router — phase 04.
//
// Authorization model (permission codes seeded by
// phase-04/02_seed_permissions.sql for the 'user_language'
// resource — note singular):
//
//   GET    /                   user_language.read                 (admin+)
//   GET    /me                 user_language.read.own             (self, all roles)
//   POST   /me                 user_language.update.own           (self, creates own row)
//   PATCH  /me/:id             user_language.update.own           (self-match enforced)
//   DELETE /me/:id             user_language.delete.own           (self-match enforced)
//   GET    /:id                user_language.read
//                              OR  user_language.read.own     (+ self match)
//   POST   /                   user_language.create               (admin+, targets any userId)
//   PATCH  /:id                user_language.update
//                              OR  user_language.update.own   (+ self match)
//   DELETE /:id                user_language.delete
//                              OR  user_language.delete.own   (+ self match)
//   POST   /:id/restore        user_language.restore              (admin+)
//
// Deletion is SOFT — the row is hidden from default GETs but still
// present in the table. Admin+ can un-delete via POST /:id/restore.
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
import * as userLanguagesService from '../../../modules/user-languages/user-languages.service';
import {
  createMyUserLanguageBodySchema,
  createUserLanguageBodySchema,
  listUserLanguagesQuerySchema,
  updateUserLanguageBodySchema,
  type CreateMyUserLanguageBody,
  type CreateUserLanguageBody,
  type ListUserLanguagesQuery,
  type UpdateUserLanguageBody
} from '../../../modules/user-languages/user-languages.schemas';

const router = Router();

router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
// /me routes — must come BEFORE /:id so Express doesn't treat
// "me" as an id segment.
// ═══════════════════════════════════════════════════════════════

router.get(
  '/me',
  authorize('user_language.read.own'),
  validate({ query: listUserLanguagesQuerySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const q = req.query as unknown as ListUserLanguagesQuery;
    const { rows, meta } = await userLanguagesService.listUserLanguages({
      ...q,
      userId
    });
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/me',
  authorize('user_language.update.own'),
  validate({ body: createMyUserLanguageBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body as CreateMyUserLanguageBody;
    const result = await userLanguagesService.createMyUserLanguage(userId, body);
    const row = await userLanguagesService.getUserLanguageById(result.id);
    return created(res, row, 'User language created');
  })
);

router.patch(
  '/me/:id',
  validate({ params: idParamSchema, body: updateUserLanguageBodySchema }),
  authorize('user_language.update.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userLanguagesService.getUserLanguageById(id);

    if (!existing) throw AppError.notFound(`User language ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only edit your own languages.',
        403,
        'FORBIDDEN'
      );
    }

    const body = req.body as UpdateUserLanguageBody;
    await userLanguagesService.updateUserLanguage(id, body, userId);
    const row = await userLanguagesService.getUserLanguageById(id);
    return ok(res, row, 'User language updated');
  })
);

router.delete(
  '/me/:id',
  validate({ params: idParamSchema }),
  authorize('user_language.delete.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userLanguagesService.getUserLanguageById(id);

    if (!existing) throw AppError.notFound(`User language ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only delete your own languages.',
        403,
        'FORBIDDEN'
      );
    }

    await userLanguagesService.deleteUserLanguage(id, userId);
    return ok(res, { id, deleted: true }, 'User language deleted');
  })
);

// ═══════════════════════════════════════════════════════════════
// Admin + shared endpoints
// ═══════════════════════════════════════════════════════════════

router.get(
  '/',
  authorize('user_language.read'),
  validate({ query: listUserLanguagesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUserLanguagesQuery;
    const { rows, meta } = await userLanguagesService.listUserLanguages(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/',
  authorize('user_language.create'),
  validate({ body: createUserLanguageBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserLanguageBody;
    const result = await userLanguagesService.createUserLanguage(
      body,
      req.user?.id ?? null
    );
    const row = await userLanguagesService.getUserLanguageById(result.id);
    return created(res, row, 'User language created');
  })
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_language.read',
    ownPermission: 'user_language.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userLanguagesService.getUserLanguageById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await userLanguagesService.getUserLanguageById(id);
    if (!row) throw AppError.notFound(`User language ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserLanguageBodySchema }),
  authorizeSelfOr({
    globalPermission: 'user_language.update',
    ownPermission: 'user_language.update.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userLanguagesService.getUserLanguageById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateUserLanguageBody;
    await userLanguagesService.updateUserLanguage(id, body, req.user?.id ?? null);
    const row = await userLanguagesService.getUserLanguageById(id);
    return ok(res, row, 'User language updated');
  })
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_language.delete',
    ownPermission: 'user_language.delete.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userLanguagesService.getUserLanguageById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userLanguagesService.deleteUserLanguage(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'User language deleted');
  })
);

router.post(
  '/:id/restore',
  validate({ params: idParamSchema }),
  authorize('user_language.restore'),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userLanguagesService.getUserLanguageByIdIncludingDeleted(id);
    if (!existing) {
      throw AppError.notFound(`User language ${id} not found`);
    }
    if (!existing.isDeleted) {
      throw new AppError(
        `User language ${id} is not deleted; nothing to restore`,
        400,
        'BAD_REQUEST'
      );
    }

    await userLanguagesService.restoreUserLanguage(id, req.user?.id ?? null);
    const row = await userLanguagesService.getUserLanguageById(id);
    return ok(res, row, 'User language restored');
  })
);

export default router;
