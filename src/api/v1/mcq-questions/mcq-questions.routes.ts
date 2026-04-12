// ═══════════════════════════════════════════════════════════════
// /api/v1/mcq-questions router — phase 10 MCQ parent CRUD.
//
// Authorization model:
//   GET    /              mcq_question.read
//   GET    /:id           mcq_question.read        (translation id)
//   POST   /              mcq_question.create
//   PATCH  /:id           mcq_question.update
//   DELETE /:id           mcq_question.delete       (cascade)
//   POST   /:id/restore   mcq_question.restore      (cascade)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as mcqService from '../../../modules/mcq-questions/mcq-questions.service';
import {
  createMcqQuestionBodySchema,
  listMcqQuestionsQuerySchema,
  updateMcqQuestionBodySchema,
  type CreateMcqQuestionBody,
  type ListMcqQuestionsQuery,
  type UpdateMcqQuestionBody
} from '../../../modules/mcq-questions/mcq-questions.schemas';

const router = Router();

router.use(authenticate);

// ─── LIST ──────────────────────────────────────────────────────

router.get(
  '/',
  authorize('mcq_question.read'),
  validate({ query: listMcqQuestionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListMcqQuestionsQuery;
    const { rows, meta } = await mcqService.listMcqQuestions(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET BY ID (translation id) ────────────────────────────────

router.get(
  '/:id',
  authorize('mcq_question.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await mcqService.getMcqQuestionById(id);
    if (!row) throw AppError.notFound(`MCQ question translation ${id} not found`);
    return ok(res, row, 'OK');
  })
);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('mcq_question.create'),
  validate({ body: createMcqQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateMcqQuestionBody;
    const result = await mcqService.createMcqQuestion(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'MCQ question created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('mcq_question.update'),
  validate({ params: idParamSchema, body: updateMcqQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateMcqQuestionBody;
    await mcqService.updateMcqQuestion(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'MCQ question updated');
  })
);

// ─── DELETE (cascade) ──────────────────────────────────────────

router.delete(
  '/:id',
  authorize('mcq_question.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mcqService.deleteMcqQuestion(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'MCQ question and all children deleted');
  })
);

// ─── RESTORE (cascade) ────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('mcq_question.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mcqService.restoreMcqQuestion(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'MCQ question and all children restored');
  })
);

export default router;
