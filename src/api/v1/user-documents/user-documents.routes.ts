// ═══════════════════════════════════════════════════════════════
// /api/v1/user-documents router — phase 04.
//
// Authorization model (permission codes seeded by
// phase-04/02_seed_permissions.sql for the 'user_document'
// resource — note singular):
//
//   GET    /                   user_document.read                 (admin+)
//   GET    /me                 user_document.read.own             (self, all roles)
//   POST   /me                 user_document.update.own           (self, creates own row; workflow fields blocked by schema)
//   PATCH  /me/:id             user_document.update.own           (self-match enforced; workflow fields blocked by schema)
//   DELETE /me/:id             user_document.delete.own           (self-match enforced)
//   GET    /:id                user_document.read
//                              OR  user_document.read.own     (+ self match)
//   POST   /                   user_document.create               (admin+, may set workflow fields)
//   PATCH  /:id                user_document.update               (admin+, may set workflow fields)
//                              OR  user_document.update.own   (+ self match, self schema)
//   DELETE /:id                user_document.delete
//                              OR  user_document.delete.own   (+ self match)
//   POST   /:id/restore        user_document.restore              (admin+)
//
// Verification workflow:
//   Only admin + super_admin may set verificationStatus, verifiedBy,
//   verifiedAt, rejectionReason, adminNotes. The self /me schemas
//   use .strict() to reject those keys with a clean 400 rather than
//   silently dropping them.
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
import * as userDocumentsService from '../../../modules/user-documents/user-documents.service';
import {
  createMyUserDocumentBodySchema,
  createUserDocumentBodySchema,
  listUserDocumentsQuerySchema,
  updateMyUserDocumentBodySchema,
  updateUserDocumentBodySchema,
  type CreateMyUserDocumentBody,
  type CreateUserDocumentBody,
  type ListUserDocumentsQuery,
  type UpdateMyUserDocumentBody,
  type UpdateUserDocumentBody
} from '../../../modules/user-documents/user-documents.schemas';

const router = Router();

router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
// /me routes — must come BEFORE /:id so Express doesn't treat
// "me" as an id segment.
// ═══════════════════════════════════════════════════════════════

router.get(
  '/me',
  authorize('user_document.read.own'),
  validate({ query: listUserDocumentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const q = req.query as unknown as ListUserDocumentsQuery;
    const { rows, meta } = await userDocumentsService.listUserDocuments({
      ...q,
      userId
    });
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/me',
  authorize('user_document.update.own'),
  validate({ body: createMyUserDocumentBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body as CreateMyUserDocumentBody;
    const result = await userDocumentsService.createMyUserDocument(userId, body);
    const row = await userDocumentsService.getUserDocumentById(result.id);
    return created(res, row, 'User document created');
  })
);

router.patch(
  '/me/:id',
  validate({ params: idParamSchema, body: updateMyUserDocumentBodySchema }),
  authorize('user_document.update.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userDocumentsService.getUserDocumentById(id);

    if (!existing) throw AppError.notFound(`User document ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only edit your own documents.',
        403,
        'FORBIDDEN'
      );
    }

    const body = req.body as UpdateMyUserDocumentBody;
    await userDocumentsService.updateMyUserDocument(id, body, userId);
    const row = await userDocumentsService.getUserDocumentById(id);
    return ok(res, row, 'User document updated');
  })
);

router.delete(
  '/me/:id',
  validate({ params: idParamSchema }),
  authorize('user_document.delete.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userDocumentsService.getUserDocumentById(id);

    if (!existing) throw AppError.notFound(`User document ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only delete your own documents.',
        403,
        'FORBIDDEN'
      );
    }

    await userDocumentsService.deleteUserDocument(id, userId);
    return ok(res, { id, deleted: true }, 'User document deleted');
  })
);

// ═══════════════════════════════════════════════════════════════
// Admin + shared endpoints
// ═══════════════════════════════════════════════════════════════

router.get(
  '/',
  authorize('user_document.read'),
  validate({ query: listUserDocumentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUserDocumentsQuery;
    const { rows, meta } = await userDocumentsService.listUserDocuments(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/',
  authorize('user_document.create'),
  validate({ body: createUserDocumentBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserDocumentBody;
    const result = await userDocumentsService.createUserDocument(
      body,
      req.user?.id ?? null
    );
    const row = await userDocumentsService.getUserDocumentById(result.id);
    return created(res, row, 'User document created');
  })
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_document.read',
    ownPermission: 'user_document.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userDocumentsService.getUserDocumentById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await userDocumentsService.getUserDocumentById(id);
    if (!row) throw AppError.notFound(`User document ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserDocumentBodySchema }),
  authorizeSelfOr({
    globalPermission: 'user_document.update',
    ownPermission: 'user_document.update.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userDocumentsService.getUserDocumentById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateUserDocumentBody;
    await userDocumentsService.updateUserDocument(id, body, req.user?.id ?? null);
    const row = await userDocumentsService.getUserDocumentById(id);
    return ok(res, row, 'User document updated');
  })
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_document.delete',
    ownPermission: 'user_document.delete.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userDocumentsService.getUserDocumentById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userDocumentsService.deleteUserDocument(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'User document deleted');
  })
);

router.post(
  '/:id/restore',
  validate({ params: idParamSchema }),
  authorize('user_document.restore'),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userDocumentsService.getUserDocumentByIdIncludingDeleted(id);
    if (!existing) {
      throw AppError.notFound(`User document ${id} not found`);
    }
    if (!existing.isDeleted) {
      throw new AppError(
        `User document ${id} is not deleted; nothing to restore`,
        400,
        'BAD_REQUEST'
      );
    }

    await userDocumentsService.restoreUserDocument(id, req.user?.id ?? null);
    const row = await userDocumentsService.getUserDocumentById(id);
    return ok(res, row, 'User document restored');
  })
);

export default router;
