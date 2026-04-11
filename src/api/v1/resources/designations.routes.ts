// ═══════════════════════════════════════════════════════════════
// /api/v1/designations router — phase 02 master data CRUD.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as designationsService from '../../../modules/resources/designations.service';
import {
  createDesignationBodySchema,
  listDesignationsQuerySchema,
  updateDesignationBodySchema,
  type CreateDesignationBody,
  type ListDesignationsQuery,
  type UpdateDesignationBody
} from '../../../modules/resources/designations.schemas';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('designation.read'),
  validate({ query: listDesignationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListDesignationsQuery;
    const { rows, meta } = await designationsService.listDesignations(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('designation.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const d = await designationsService.getDesignationById(id);
    if (!d) throw AppError.notFound(`Designation ${id} not found`);
    return ok(res, d, 'OK');
  })
);

router.post(
  '/',
  authorize('designation.create'),
  validate({ body: createDesignationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateDesignationBody;
    const result = await designationsService.createDesignation(body, req.user?.id ?? null);
    const d = await designationsService.getDesignationById(result.id);
    return created(res, d, 'Designation created');
  })
);

router.patch(
  '/:id',
  authorize('designation.update'),
  validate({ params: idParamSchema, body: updateDesignationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateDesignationBody;
    await designationsService.updateDesignation(id, body, req.user?.id ?? null);
    const d = await designationsService.getDesignationById(id);
    return ok(res, d, 'Designation updated');
  })
);

router.delete(
  '/:id',
  authorize('designation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await designationsService.deleteDesignation(id);
    return ok(res, { id, deleted: true }, 'Designation deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('designation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await designationsService.restoreDesignation(id);
    const d = await designationsService.getDesignationById(id);
    return ok(res, d, 'Designation restored');
  })
);

export default router;
