// ═══════════════════════════════════════════════════════════════
// /api/v1/descriptive-questions router — phase 10 Descriptive parent CRUD.
//
// Authorization model:
//   GET    /              descriptive_question.read
//   GET    /:id           descriptive_question.read        (translation id)
//   POST   /              descriptive_question.create
//   PATCH  /:id           descriptive_question.update
//   DELETE /:id           descriptive_question.delete       (cascade)
//   POST   /:id/restore   descriptive_question.restore      (cascade)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as dqService from '../../../modules/descriptive-questions/descriptive-questions.service';
import {
  createDescriptiveQuestionBodySchema,
  listDescriptiveQuestionsQuerySchema,
  updateDescriptiveQuestionBodySchema,
  type CreateDescriptiveQuestionBody,
  type ListDescriptiveQuestionsQuery,
  type UpdateDescriptiveQuestionBody
} from '../../../modules/descriptive-questions/descriptive-questions.schemas';

const router = Router();

router.use(authenticate);

// ─── LIST ──────────────────────────────────────────────────────

router.get(
  '/',
  authorize('descriptive_question.read'),
  validate({ query: listDescriptiveQuestionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListDescriptiveQuestionsQuery;
    const { rows, meta } = await dqService.listDescriptiveQuestions(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET BY ID (translation id) ────────────────────────────────

router.get(
  '/:id',
  authorize('descriptive_question.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await dqService.getDescriptiveQuestionById(id);
    if (!row) throw AppError.notFound(`Descriptive question translation ${id} not found`);
    return ok(res, row, 'OK');
  })
);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('descriptive_question.create'),
  validate({ body: createDescriptiveQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateDescriptiveQuestionBody;
    const result = await dqService.createDescriptiveQuestion(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Descriptive question created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('descriptive_question.update'),
  validate({ params: idParamSchema, body: updateDescriptiveQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateDescriptiveQuestionBody;
    await dqService.updateDescriptiveQuestion(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Descriptive question updated');
  })
);

// ─── DELETE (cascade) ──────────────────────────────────────────

router.delete(
  '/:id',
  authorize('descriptive_question.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await dqService.deleteDescriptiveQuestion(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Descriptive question and all translations deleted');
  })
);

// ─── RESTORE (cascade) ────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('descriptive_question.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await dqService.restoreDescriptiveQuestion(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Descriptive question and all translations restored');
  })
);

export default router;
