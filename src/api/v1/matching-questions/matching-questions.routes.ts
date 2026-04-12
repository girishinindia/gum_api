// ═══════════════════════════════════════════════════════════════
// /api/v1/matching-questions router — phase 10 Matching parent CRUD.
//
// Authorization model:
//   GET    /              matching_question.read
//   GET    /:id           matching_question.read        (translation id)
//   POST   /              matching_question.create
//   PATCH  /:id           matching_question.update
//   DELETE /:id           matching_question.delete       (cascade)
//   POST   /:id/restore   matching_question.restore      (cascade)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as mqService from '../../../modules/matching-questions/matching-questions.service';
import {
  createMatchingQuestionBodySchema,
  listMatchingQuestionsQuerySchema,
  updateMatchingQuestionBodySchema,
  type CreateMatchingQuestionBody,
  type ListMatchingQuestionsQuery,
  type UpdateMatchingQuestionBody
} from '../../../modules/matching-questions/matching-questions.schemas';

const router = Router();

router.use(authenticate);

// ─── LIST ──────────────────────────────────────────────────────

router.get(
  '/',
  authorize('matching_question.read'),
  validate({ query: listMatchingQuestionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListMatchingQuestionsQuery;
    const { rows, meta } = await mqService.listMatchingQuestions(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET BY ID (translation id) ────────────────────────────────

router.get(
  '/:id',
  authorize('matching_question.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await mqService.getMatchingQuestionById(id);
    if (!row) throw AppError.notFound(`Matching question translation ${id} not found`);
    return ok(res, row, 'OK');
  })
);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('matching_question.create'),
  validate({ body: createMatchingQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateMatchingQuestionBody;
    const result = await mqService.createMatchingQuestion(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Matching question created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('matching_question.update'),
  validate({ params: idParamSchema, body: updateMatchingQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateMatchingQuestionBody;
    await mqService.updateMatchingQuestion(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Matching question updated');
  })
);

// ─── DELETE (cascade) ──────────────────────────────────────────

router.delete(
  '/:id',
  authorize('matching_question.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mqService.deleteMatchingQuestion(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Matching question and all children deleted');
  })
);

// ─── RESTORE (cascade) ────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('matching_question.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mqService.restoreMatchingQuestion(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Matching question and all children restored');
  })
);

export default router;
