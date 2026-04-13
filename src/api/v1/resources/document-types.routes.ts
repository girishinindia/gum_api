// ═══════════════════════════════════════════════════════════════
// /api/v1/document-types router — phase 02 master data CRUD.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as documentTypesService from '../../../modules/resources/document-types.service';
import {
  createDocumentTypeBodySchema,
  listDocumentTypesQuerySchema,
  updateDocumentTypeBodySchema,
  type CreateDocumentTypeBody,
  type ListDocumentTypesQuery,
  type UpdateDocumentTypeBody
} from '../../../modules/resources/document-types.schemas';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('document_type.read'),
  validate({ query: listDocumentTypesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListDocumentTypesQuery;
    const { rows, meta } = await documentTypesService.listDocumentTypes(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('document_type.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const dt = await documentTypesService.getDocumentTypeById(id);
    if (!dt) throw AppError.notFound(`Document type ${id} not found`);
    return ok(res, dt, 'OK');
  })
);

router.post(
  '/',
  authorize('document_type.create'),
  validate({ body: createDocumentTypeBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateDocumentTypeBody;
    const result = await documentTypesService.createDocumentType(body, req.user?.id ?? null);
    const dt = await documentTypesService.getDocumentTypeById(result.id);
    return created(res, dt, 'Document type created');
  })
);

router.patch(
  '/:id',
  authorize('document_type.update'),
  validate({ params: idParamSchema, body: updateDocumentTypeBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateDocumentTypeBody;
    await documentTypesService.updateDocumentType(id, body, req.user?.id ?? null);
    const dt = await documentTypesService.getDocumentTypeById(id);
    return ok(res, dt, 'Document type updated');
  })
);

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('document_type.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await documentTypesService.deleteDocumentType(id);
    return ok(res, { id, deleted: true }, 'Document type deleted');
  })
);

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('document_type.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await documentTypesService.restoreDocumentType(id);
    const dt = await documentTypesService.getDocumentTypeById(id);
    return ok(res, dt, 'Document type restored');
  })
);

export default router;
