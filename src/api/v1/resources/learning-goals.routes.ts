// ═══════════════════════════════════════════════════════════════
// /api/v1/learning-goals router — phase 02 master data CRUD.
//
// Authorization model:
//   GET    /              learning_goal.read
//   GET    /:id           learning_goal.read
//   POST   /              learning_goal.create  (JSON or multipart/form-data)
//   PATCH  /:id           learning_goal.update   (JSON or multipart/form-data)
//   DELETE /:id           learning_goal.delete
//   POST   /:id/restore   learning_goal.restore
//
// All routes require an authenticated user.
//
// Unified PATCH accepts BOTH text field updates and optional icon
// uploads in a single request:
//   • JSON body: plain text-field patch
//   • multipart/form-data: text fields + optional `icon` slot (100 KB
//     WebP pipeline). Aliases: `iconImage`, `file`.
//   • To clear the icon, set `iconAction=delete` in the same body.
//     Uploading + deleting the same slot in one request is rejected.
//
// Icons (pipeline spec, enforced downstream):
//   • Input MIME:   PNG / JPEG / WebP / SVG
//   • Max raw size: 100 KB
//   • Output:       always WebP, resized to fit 256×256 box
//   • Storage key:  learning-goals/icons/<id>.webp  (deterministic)
//   • On replace:   prior Bunny object(s) deleted BEFORE new PUT
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchLearningGoalFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as learningGoalsService from '../../../modules/resources/learning-goals.service';
import {
  createLearningGoalBodySchema,
  listLearningGoalsQuerySchema,
  updateLearningGoalBodySchema,
  type CreateLearningGoalBody,
  type ListLearningGoalsQuery,
  type UpdateLearningGoalBody
} from '../../../modules/resources/learning-goals.schemas';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('learning_goal.read'),
  validate({ query: listLearningGoalsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListLearningGoalsQuery;
    const { rows, meta } = await learningGoalsService.listLearningGoals(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('learning_goal.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const lg = await learningGoalsService.getLearningGoalById(id);
    if (!lg) throw AppError.notFound(`Learning goal ${id} not found`);
    return ok(res, lg, 'OK');
  })
);

// POST / — create (JSON or multipart/form-data with optional icon).
router.post(
  '/',
  authorize('learning_goal.create'),
  patchLearningGoalFiles,
  coerceMultipartBody,
  validate({ body: createLearningGoalBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateLearningGoalBody;
    const iconFile = getSlotFile(req, 'icon');
    const result = await learningGoalsService.createLearningGoal(body, req.user?.id ?? null);
    if (iconFile) {
      await learningGoalsService.processLearningGoalIconUpload(result.id, iconFile, req.user?.id ?? null);
    }
    const lg = await learningGoalsService.getLearningGoalById(result.id);
    return created(res, lg, 'Learning goal created');
  })
);

// PATCH /:id — unified text + icon update.
router.patch(
  '/:id',
  authorize('learning_goal.update'),
  patchLearningGoalFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateLearningGoalBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateLearningGoalBody;

    const { iconAction, ...textFields } = body;
    const iconFile = getSlotFile(req, 'icon');

    if (iconFile && iconAction === 'delete') {
      throw AppError.badRequest(
        "Cannot upload a new learning goal icon AND iconAction=delete in the same request — pick one."
      );
    }

    const hasTextChange = Object.keys(textFields).length > 0;
    const hasFileChange = Boolean(iconFile);
    const hasDelete = iconAction === 'delete';
    if (!hasTextChange && !hasFileChange && !hasDelete) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await learningGoalsService.updateLearningGoal(
        id,
        textFields as UpdateLearningGoalBody,
        req.user?.id ?? null
      );
    }

    if (iconFile) {
      await learningGoalsService.processLearningGoalIconUpload(
        id,
        iconFile,
        req.user?.id ?? null
      );
    } else if (iconAction === 'delete') {
      await learningGoalsService.deleteLearningGoalIcon(
        id,
        req.user?.id ?? null
      );
    }

    const lg = await learningGoalsService.getLearningGoalById(id);
    return ok(res, lg, 'Learning goal updated');
  })
);

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('learning_goal.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await learningGoalsService.deleteLearningGoal(id);
    return ok(res, { id, deleted: true }, 'Learning goal deleted');
  })
);

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('learning_goal.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await learningGoalsService.restoreLearningGoal(id);
    const lg = await learningGoalsService.getLearningGoalById(id);
    return ok(res, lg, 'Learning goal restored');
  })
);

export default router;
