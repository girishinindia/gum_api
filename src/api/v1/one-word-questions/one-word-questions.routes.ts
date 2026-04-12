// ═══════════════════════════════════════════════════════════════
// /api/v1/one-word-questions router — phase 10 One-Word parent CRUD.
//
// Authorization model:
//   GET    /              one_word_question.read
//   GET    /:id           one_word_question.read        (translation id)
//   POST   /              one_word_question.create
//   PATCH  /:id           one_word_question.update
//   DELETE /:id           one_word_question.delete       (cascade)
//   POST   /:id/restore   one_word_question.restore      (cascade)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as owqService from '../../../modules/one-word-questions/one-word-questions.service';
import {
  createOneWordQuestionBodySchema,
  listOneWordQuestionsQuerySchema,
  updateOneWordQuestionBodySchema,
  type CreateOneWordQuestionBody,
  type ListOneWordQuestionsQuery,
  type UpdateOneWordQuestionBody
} from '../../../modules/one-word-questions/one-word-questions.schemas';

const router = Router();

router.use(authenticate);

// ─── LIST ──────────────────────────────────────────────────────

router.get(
  '/',
  authorize('one_word_question.read'),
  validate({ query: listOneWordQuestionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListOneWordQuestionsQuery;
    const { rows, meta } = await owqService.listOneWordQuestions(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET BY ID (translation id) ────────────────────────────────

router.get(
  '/:id',
  authorize('one_word_question.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await owqService.getOneWordQuestionById(id);
    if (!row) throw AppError.notFound(`One-word question translation ${id} not found`);
    return ok(res, row, 'OK');
  })
);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('one_word_question.create'),
  validate({ body: createOneWordQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateOneWordQuestionBody;
    const result = await owqService.createOneWordQuestion(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'One-word question created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('one_word_question.update'),
  validate({ params: idParamSchema, body: updateOneWordQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateOneWordQuestionBody;
    await owqService.updateOneWordQuestion(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'One-word question updated');
  })
);

// ─── DELETE (cascade) ──────────────────────────────────────────

router.delete(
  '/:id',
  authorize('one_word_question.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await owqService.deleteOneWordQuestion(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'One-word question and all children deleted');
  })
);

// ─── RESTORE (cascade) ────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('one_word_question.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await owqService.restoreOneWordQuestion(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'One-word question and all children restored');
  })
);

export default router;
