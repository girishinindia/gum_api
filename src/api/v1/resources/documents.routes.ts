// ═══════════════════════════════════════════════════════════════
// /api/v1/documents router — phase 02 master data CRUD.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as documentsService from '../../../modules/resources/documents.service';
import {
  createDocumentBodySchema,
  listDocumentsQuerySchema,
  updateDocumentBodySchema,
  type CreateDocumentBody,
  type ListDocumentsQuery,
  type UpdateDocumentBody
} from '../../../modules/resources/documents.schemas';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('document.read'),
  validate({ query: listDocumentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListDocumentsQuery;
    const { rows, meta } = await documentsService.listDocuments(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('document.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const doc = await documentsService.getDocumentById(id);
    if (!doc) throw AppError.notFound(`Document ${id} not found`);
    return ok(res, doc, 'OK');
  })
);

router.post(
  '/',
  authorize('document.create'),
  validate({ body: createDocumentBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateDocumentBody;
    const result = await documentsService.createDocument(body, req.user?.id ?? null);
    const doc = await documentsService.getDocumentById(result.id);
    return created(res, doc, 'Document created');
  })
);

router.patch(
  '/:id',
  authorize('document.update'),
  validate({ params: idParamSchema, body: updateDocumentBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateDocumentBody;
    await documentsService.updateDocument(id, body, req.user?.id ?? null);
    const doc = await documentsService.getDocumentById(id);
    return ok(res, doc, 'Document updated');
  })
);

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('document.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await documentsService.deleteDocument(id);
    return ok(res, { id, deleted: true }, 'Document deleted');
  })
);

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('document.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await documentsService.restoreDocument(id);
    const doc = await documentsService.getDocumentById(id);
    return ok(res, doc, 'Document restored');
  })
);

export default router;
