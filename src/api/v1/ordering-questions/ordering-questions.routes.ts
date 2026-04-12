// ═══════════════════════════════════════════════════════════════
// /api/v1/ordering-questions router — phase 10 Ordering parent CRUD.
//
// Authorization model:
//   GET    /              ordering_question.read
//   GET    /:id           ordering_question.read        (translation id)
//   POST   /              ordering_question.create
//   PATCH  /:id           ordering_question.update
//   DELETE /:id           ordering_question.delete       (cascade)
//   POST   /:id/restore   ordering_question.restore      (cascade)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as oqService from '../../../modules/ordering-questions/ordering-questions.service';
import {
  createOrderingQuestionBodySchema,
  listOrderingQuestionsQuerySchema,
  updateOrderingQuestionBodySchema,
  type CreateOrderingQuestionBody,
  type ListOrderingQuestionsQuery,
  type UpdateOrderingQuestionBody
} from '../../../modules/ordering-questions/ordering-questions.schemas';

const router = Router();

router.use(authenticate);

// ─── LIST ──────────────────────────────────────────────────────

router.get(
  '/',
  authorize('ordering_question.read'),
  validate({ query: listOrderingQuestionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListOrderingQuestionsQuery;
    const { rows, meta } = await oqService.listOrderingQuestions(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET BY ID (translation id) ────────────────────────────────

router.get(
  '/:id',
  authorize('ordering_question.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await oqService.getOrderingQuestionById(id);
    if (!row) throw AppError.notFound(`Ordering question translation ${id} not found`);
    return ok(res, row, 'OK');
  })
);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('ordering_question.create'),
  validate({ body: createOrderingQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateOrderingQuestionBody;
    const result = await oqService.createOrderingQuestion(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Ordering question created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('ordering_question.update'),
  validate({ params: idParamSchema, body: updateOrderingQuestionBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateOrderingQuestionBody;
    await oqService.updateOrderingQuestion(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Ordering question updated');
  })
);

// ─── DELETE (cascade) ──────────────────────────────────────────

router.delete(
  '/:id',
  authorize('ordering_question.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await oqService.deleteOrderingQuestion(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Ordering question and all children deleted');
  })
);

// ─── RESTORE (cascade) ────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('ordering_question.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await oqService.restoreOrderingQuestion(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Ordering question and all children restored');
  })
);

export default router;
