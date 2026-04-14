// ═══════════════════════════════════════════════════════════════
// /api/v1/education-levels router — phase 02 master data CRUD.
//
// Resource/permission code is `education_level` (snake_case), URL
// is kebab-case `/education-levels`.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { assertVisibleToCaller } from '../../../core/utils/visibility';
import { idParamSchema } from '../../../shared/validation/common';
import * as educationLevelsService from '../../../modules/resources/education-levels.service';
import {
  createEducationLevelBodySchema,
  listEducationLevelsQuerySchema,
  updateEducationLevelBodySchema,
  type CreateEducationLevelBody,
  type ListEducationLevelsQuery,
  type UpdateEducationLevelBody
} from '../../../modules/resources/education-levels.schemas';

const router = Router();

router.use(authenticate);
router.use(gateSoftDeleteFilters);

router.get(
  '/',
  authorize('education_level.read'),
  validate({ query: listEducationLevelsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListEducationLevelsQuery;
    const { rows, meta } = await educationLevelsService.listEducationLevels(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('education_level.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const level = await educationLevelsService.getEducationLevelById(id);
    assertVisibleToCaller(level, req.user, 'Education level', id);
    return ok(res, level, 'OK');
  })
);

router.post(
  '/',
  authorize('education_level.create'),
  validate({ body: createEducationLevelBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateEducationLevelBody;
    const result = await educationLevelsService.createEducationLevel(
      body,
      req.user?.id ?? null
    );
    const level = await educationLevelsService.getEducationLevelById(result.id);
    return created(res, level, 'Education level created');
  })
);

router.patch(
  '/:id',
  authorize('education_level.update'),
  validate({ params: idParamSchema, body: updateEducationLevelBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateEducationLevelBody;
    await educationLevelsService.updateEducationLevel(id, body, req.user?.id ?? null);
    const level = await educationLevelsService.getEducationLevelById(id);
    return ok(res, level, 'Education level updated');
  })
);

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('education_level.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await educationLevelsService.deleteEducationLevel(id);
    return ok(res, { id, deleted: true }, 'Education level deleted');
  })
);

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('education_level.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await educationLevelsService.restoreEducationLevel(id);
    const level = await educationLevelsService.getEducationLevelById(id);
    return ok(res, level, 'Education level restored');
  })
);

export default router;
