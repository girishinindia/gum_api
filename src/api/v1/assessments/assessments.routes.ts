// ═══════════════════════════════════════════════════════════════
// /api/v1/assessments router — phase 11 assessment CRUD.
//
// Authorization model:
//   Assessment CRUD:
//     GET    /              assessment.read
//     GET    /:id           assessment.read
//     POST   /              assessment.create
//     PATCH  /:id           assessment.update
//     DELETE /:id           assessment.delete
//     POST   /:id/restore   assessment.restore
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations              assessment_translation.read
//     GET    /:id/translations/:tid         assessment_translation.read
//     POST   /:id/translations              assessment_translation.create
//     PATCH  /:id/translations/:tid         assessment_translation.update
//     DELETE /:id/translations/:tid         assessment_translation.delete
//     POST   /:id/translations/:tid/restore assessment_translation.restore
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
import * as asmtService from '../../../modules/assessments/assessments.service';
import {
  createAssessmentBodySchema,
  listAssessmentsQuerySchema,
  updateAssessmentBodySchema,
  createAssessmentTranslationBodySchema,
  listAssessmentTranslationsQuerySchema,
  updateAssessmentTranslationBodySchema,
  type CreateAssessmentBody,
  type ListAssessmentsQuery,
  type UpdateAssessmentBody,
  type CreateAssessmentTranslationBody,
  type ListAssessmentTranslationsQuery,
  type UpdateAssessmentTranslationBody
} from '../../../modules/assessments/assessments.schemas';

const router = Router();

router.use(authenticate);

// ─── Assessment CRUD ───────────────────────────────────────────

router.get(
  '/',
  authorize('assessment.read'),
  validate({ query: listAssessmentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListAssessmentsQuery;
    const { rows, meta } = await asmtService.listAssessments(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('assessment.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await asmtService.getAssessmentById(id);
    if (!row) throw AppError.notFound(`Assessment ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('assessment.create'),
  validate({ body: createAssessmentBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateAssessmentBody;
    const result = await asmtService.createAssessment(body, req.user?.id ?? null);
    const row = await asmtService.getAssessmentById(result.id);
    return created(res, row, 'Assessment created');
  })
);

router.patch(
  '/:id',
  authorize('assessment.update'),
  validate({ params: idParamSchema, body: updateAssessmentBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateAssessmentBody;
    await asmtService.updateAssessment(id, body, req.user?.id ?? null);
    const row = await asmtService.getAssessmentById(id);
    return ok(res, row, 'Assessment updated');
  })
);

router.delete(
  '/:id',
  authorize('assessment.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await asmtService.deleteAssessment(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Assessment deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('assessment.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await asmtService.restoreAssessment(id, req.user?.id ?? null);
    const row = await asmtService.getAssessmentById(id);
    return ok(res, row, 'Assessment restored');
  })
);

// ─── Translation sub-resource ──────────────────────────────────

router.get(
  '/:id/translations',
  authorize('assessment_translation.read'),
  validate({ params: idParamSchema, query: listAssessmentTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const assessmentId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListAssessmentTranslationsQuery;
    const { rows, meta } = await asmtService.listAssessmentTranslations(assessmentId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('assessment_translation.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const ct = await asmtService.getAssessmentTranslationById(tid);
    if (!ct) throw AppError.notFound(`Assessment translation ${tid} not found`);
    return ok(res, ct, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('assessment_translation.create'),
  validate({ params: idParamSchema, body: createAssessmentTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const assessmentId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateAssessmentTranslationBody;
    const result = await asmtService.createAssessmentTranslation(
      assessmentId,
      body,
      req.user?.id ?? null
    );
    const ct = await asmtService.getAssessmentTranslationById(result.id);
    return created(res, ct, 'Assessment translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('assessment_translation.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateAssessmentTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateAssessmentTranslationBody;
    await asmtService.updateAssessmentTranslation(tid, body, req.user?.id ?? null);
    const ct = await asmtService.getAssessmentTranslationById(tid);
    return ok(res, ct, 'Assessment translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('assessment_translation.delete'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await asmtService.deleteAssessmentTranslation(tid, req.user?.id ?? null);
    return ok(res, { id: tid, deleted: true }, 'Assessment translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('assessment_translation.restore'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await asmtService.restoreAssessmentTranslation(tid, req.user?.id ?? null);
    const ct = await asmtService.getAssessmentTranslationById(tid);
    return ok(res, ct, 'Assessment translation restored');
  })
);

export default router;
