// ═══════════════════════════════════════════════════════════════
// /api/v1/assessments/:assessmentId/solutions router
// Phase 11 — assessment solution CRUD.
//
// Authorization model:
//   Solution CRUD:       assessment_solution.*
//   Translation CRUD:    assessment_solution_translation.*
//
// All routes require an authenticated user.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as solSvc from '../../../modules/assessment-solutions/assessment-solutions.service';
import {
  createAssessmentSolutionBodySchema,
  listAssessmentSolutionsQuerySchema,
  updateAssessmentSolutionBodySchema,
  createSolutionTranslationBodySchema,
  listSolutionTranslationsQuerySchema,
  updateSolutionTranslationBodySchema,
  type CreateAssessmentSolutionBody,
  type ListAssessmentSolutionsQuery,
  type UpdateAssessmentSolutionBody,
  type CreateSolutionTranslationBody,
  type ListSolutionTranslationsQuery,
  type UpdateSolutionTranslationBody
} from '../../../modules/assessment-solutions/assessment-solutions.schemas';

// mergeParams: true so we can read :assessmentId from the parent router
const router = Router({ mergeParams: true });

router.use(authenticate);

// ─── Solution CRUD ─────────────────────────────────────────────

router.get(
  '/',
  authorize('assessment_solution.read'),
  validate({ query: listAssessmentSolutionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const assessmentId = Number((req.params as unknown as { assessmentId: number }).assessmentId);
    const q = req.query as unknown as ListAssessmentSolutionsQuery;
    const { rows, meta } = await solSvc.listAssessmentSolutions(assessmentId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('assessment_solution.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await solSvc.getSolutionById(id);
    if (!row) throw AppError.notFound(`Assessment solution ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('assessment_solution.create'),
  validate({ body: createAssessmentSolutionBodySchema }),
  asyncHandler(async (req, res) => {
    const assessmentId = Number((req.params as unknown as { assessmentId: number }).assessmentId);
    const body = req.body as CreateAssessmentSolutionBody;
    const result = await solSvc.createSolution(assessmentId, body, req.user?.id ?? null);
    const row = await solSvc.getSolutionById(result.id);
    return created(res, row, 'Assessment solution created');
  })
);

router.patch(
  '/:id',
  authorize('assessment_solution.update'),
  validate({ params: idParamSchema, body: updateAssessmentSolutionBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateAssessmentSolutionBody;
    await solSvc.updateSolution(id, body, req.user?.id ?? null);
    const row = await solSvc.getSolutionById(id);
    return ok(res, row, 'Assessment solution updated');
  })
);

router.delete(
  '/:id',
  authorize('assessment_solution.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await solSvc.deleteSolution(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Assessment solution deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('assessment_solution.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await solSvc.restoreSolution(id, req.user?.id ?? null);
    const row = await solSvc.getSolutionById(id);
    return ok(res, row, 'Assessment solution restored');
  })
);

// ─── Translation sub-resource ──────────────────────────────────

router.get(
  '/:id/translations',
  authorize('assessment_solution_translation.read'),
  validate({ params: idParamSchema, query: listSolutionTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const solutionId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListSolutionTranslationsQuery;
    const { rows, meta } = await solSvc.listSolutionTranslations(solutionId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('assessment_solution_translation.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const ct = await solSvc.getSolutionTranslationById(tid);
    if (!ct) throw AppError.notFound(`Assessment solution translation ${tid} not found`);
    return ok(res, ct, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('assessment_solution_translation.create'),
  validate({ params: idParamSchema, body: createSolutionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const solutionId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateSolutionTranslationBody;
    const result = await solSvc.createSolutionTranslation(
      solutionId,
      body,
      req.user?.id ?? null
    );
    const ct = await solSvc.getSolutionTranslationById(result.id);
    return created(res, ct, 'Assessment solution translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('assessment_solution_translation.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateSolutionTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateSolutionTranslationBody;
    await solSvc.updateSolutionTranslation(tid, body, req.user?.id ?? null);
    const ct = await solSvc.getSolutionTranslationById(tid);
    return ok(res, ct, 'Assessment solution translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('assessment_solution_translation.delete'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await solSvc.deleteSolutionTranslation(tid, req.user?.id ?? null);
    return ok(res, { id: tid, deleted: true }, 'Assessment solution translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('assessment_solution_translation.restore'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await solSvc.restoreSolutionTranslation(tid, req.user?.id ?? null);
    const ct = await solSvc.getSolutionTranslationById(tid);
    return ok(res, ct, 'Assessment solution translation restored');
  })
);

export default router;
