// ═══════════════════════════════════════════════════════════════
// /api/v1/learning-goals router — phase 02 master data CRUD.
//
// Authorization model:
//   GET    /              learning_goal.read
//   GET    /:id           learning_goal.read
//   POST   /              learning_goal.create
//   PATCH  /:id           learning_goal.update
//   DELETE /:id           learning_goal.delete
//   POST   /:id/restore   learning_goal.restore
//   POST   /:id/icon      learning_goal.update   (multipart, field `file`)
//   DELETE /:id/icon      learning_goal.update
//
// All routes require an authenticated user.
//
// Icons:
//   • Input MIME:   PNG / JPEG / WebP / SVG (enforced by multer)
//   • Max raw size: 100 KB (enforced by multer)
//   • Output:       always WebP, resized to fit 256×256 box
//   • Byte cap:     ≤ 100 KB on the final WebP (sharp quality loop)
//   • Storage key:  learning-goals/icons/<id>.webp  (deterministic)
//   • On replace:   prior Bunny object(s) are deleted BEFORE new PUT,
//                   so there are no orphans left behind.
//   • DELETE /icon: clears icon_url and best-effort removes the
//                   prior Bunny object.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { uploadLearningGoalIcon } from '../../../core/middlewares/upload';
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

router.post(
  '/',
  authorize('learning_goal.create'),
  validate({ body: createLearningGoalBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateLearningGoalBody;
    const result = await learningGoalsService.createLearningGoal(body, req.user?.id ?? null);
    const lg = await learningGoalsService.getLearningGoalById(result.id);
    return created(res, lg, 'Learning goal created');
  })
);

router.patch(
  '/:id',
  authorize('learning_goal.update'),
  validate({ params: idParamSchema, body: updateLearningGoalBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateLearningGoalBody;
    await learningGoalsService.updateLearningGoal(id, body, req.user?.id ?? null);
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

// ─── Icon upload ────────────────────────────────────────────────

router.post(
  '/:id/icon',
  authorize('learning_goal.update'),
  validate({ params: idParamSchema }),
  uploadLearningGoalIcon,
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    if (!req.file) {
      throw AppError.badRequest('file field is required (multipart/form-data)');
    }
    const lg = await learningGoalsService.processLearningGoalIconUpload(
      id,
      req.file,
      req.user?.id ?? null
    );
    return ok(res, lg, 'Learning goal icon uploaded');
  })
);

router.delete(
  '/:id/icon',
  authorize('learning_goal.update'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const lg = await learningGoalsService.deleteLearningGoalIcon(id, req.user?.id ?? null);
    return ok(res, lg, 'Learning goal icon deleted');
  })
);

export default router;
