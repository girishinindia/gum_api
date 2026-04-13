// ═══════════════════════════════════════════════════════════════
// /api/v1/assessments/:assessmentId/attachments router
// Phase 11 — assessment attachment CRUD.
//
// Authorization model:
//   Attachment CRUD:
//     GET    /                          assessment_attachment.read
//     GET    /:id                       assessment_attachment.read
//     POST   /                          assessment_attachment.create
//     PATCH  /:id                       assessment_attachment.update
//     DELETE /:id                       assessment_attachment.delete
//     POST   /:id/restore              assessment_attachment.restore
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations          assessment_attachment_translation.read
//     GET    /:id/translations/:tid     assessment_attachment_translation.read
//     POST   /:id/translations          assessment_attachment_translation.create
//     PATCH  /:id/translations/:tid     assessment_attachment_translation.update
//     DELETE /:id/translations/:tid     assessment_attachment_translation.delete
//     POST   /:id/translations/:tid/restore assessment_attachment_translation.restore
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
import * as attachSvc from '../../../modules/assessment-attachments/assessment-attachments.service';
import {
  createAssessmentAttachmentBodySchema,
  listAssessmentAttachmentsQuerySchema,
  updateAssessmentAttachmentBodySchema,
  createAttachmentTranslationBodySchema,
  listAttachmentTranslationsQuerySchema,
  updateAttachmentTranslationBodySchema,
  type CreateAssessmentAttachmentBody,
  type ListAssessmentAttachmentsQuery,
  type UpdateAssessmentAttachmentBody,
  type CreateAttachmentTranslationBody,
  type ListAttachmentTranslationsQuery,
  type UpdateAttachmentTranslationBody
} from '../../../modules/assessment-attachments/assessment-attachments.schemas';

// mergeParams: true so we can read :assessmentId from the parent router
const router = Router({ mergeParams: true });

router.use(authenticate);

// ─── Attachment CRUD ───────────────────────────────────────────

router.get(
  '/',
  authorize('assessment_attachment.read'),
  validate({ query: listAssessmentAttachmentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const assessmentId = Number((req.params as unknown as { assessmentId: number }).assessmentId);
    const q = req.query as unknown as ListAssessmentAttachmentsQuery;
    const { rows, meta } = await attachSvc.listAssessmentAttachments(assessmentId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('assessment_attachment.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await attachSvc.getAttachmentById(id);
    if (!row) throw AppError.notFound(`Assessment attachment ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('assessment_attachment.create'),
  validate({ body: createAssessmentAttachmentBodySchema }),
  asyncHandler(async (req, res) => {
    const assessmentId = Number((req.params as unknown as { assessmentId: number }).assessmentId);
    const body = req.body as CreateAssessmentAttachmentBody;
    const result = await attachSvc.createAttachment(assessmentId, body, req.user?.id ?? null);
    const row = await attachSvc.getAttachmentById(result.id);
    return created(res, row, 'Assessment attachment created');
  })
);

router.patch(
  '/:id',
  authorize('assessment_attachment.update'),
  validate({ params: idParamSchema, body: updateAssessmentAttachmentBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateAssessmentAttachmentBody;
    await attachSvc.updateAttachment(id, body, req.user?.id ?? null);
    const row = await attachSvc.getAttachmentById(id);
    return ok(res, row, 'Assessment attachment updated');
  })
);

router.delete(
  '/:id',
  authorize('assessment_attachment.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await attachSvc.deleteAttachment(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Assessment attachment deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('assessment_attachment.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await attachSvc.restoreAttachment(id, req.user?.id ?? null);
    const row = await attachSvc.getAttachmentById(id);
    return ok(res, row, 'Assessment attachment restored');
  })
);

// ─── Translation sub-resource ──────────────────────────────────

router.get(
  '/:id/translations',
  authorize('assessment_attachment_translation.read'),
  validate({ params: idParamSchema, query: listAttachmentTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const attachmentId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListAttachmentTranslationsQuery;
    const { rows, meta } = await attachSvc.listAttachmentTranslations(attachmentId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('assessment_attachment_translation.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const ct = await attachSvc.getAttachmentTranslationById(tid);
    if (!ct) throw AppError.notFound(`Assessment attachment translation ${tid} not found`);
    return ok(res, ct, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('assessment_attachment_translation.create'),
  validate({ params: idParamSchema, body: createAttachmentTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const attachmentId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateAttachmentTranslationBody;
    const result = await attachSvc.createAttachmentTranslation(
      attachmentId,
      body,
      req.user?.id ?? null
    );
    const ct = await attachSvc.getAttachmentTranslationById(result.id);
    return created(res, ct, 'Assessment attachment translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('assessment_attachment_translation.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateAttachmentTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateAttachmentTranslationBody;
    await attachSvc.updateAttachmentTranslation(tid, body, req.user?.id ?? null);
    const ct = await attachSvc.getAttachmentTranslationById(tid);
    return ok(res, ct, 'Assessment attachment translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('assessment_attachment_translation.delete'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await attachSvc.deleteAttachmentTranslation(tid, req.user?.id ?? null);
    return ok(res, { id: tid, deleted: true }, 'Assessment attachment translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('assessment_attachment_translation.restore'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await attachSvc.restoreAttachmentTranslation(tid, req.user?.id ?? null);
    const ct = await attachSvc.getAttachmentTranslationById(tid);
    return ok(res, ct, 'Assessment attachment translation restored');
  })
);

export default router;
