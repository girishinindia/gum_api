// ═══════════════════════════════════════════════════════════════
// /api/v1/subjects router — phase 08 material management CRUD.
//
// Authorization model:
//   Subject CRUD:
//     GET    /              subject.read
//     GET    /:id           subject.read
//     POST   /              subject.create
//     PATCH  /:id           subject.update
//     DELETE /:id           subject.delete
//     POST   /:id/restore   subject.restore
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations              subject.read
//     GET    /:id/translations/:tid         subject.read
//     POST   /:id/translations              subject.create
//     PATCH  /:id/translations/:tid         subject.update
//     DELETE /:id/translations/:tid         subject.delete
//     POST   /:id/translations/:tid/restore subject.restore
//
// All routes require an authenticated user.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchSubjectTranslationFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as subjectsService from '../../../modules/subjects/subjects.service';
import type { SubjectTranslationImageFiles } from '../../../modules/subjects/subjects.service';

const collectSubjectTranslationFiles = (req: Parameters<typeof getSlotFile>[0]): SubjectTranslationImageFiles => {
  const files: SubjectTranslationImageFiles = {};
  const icon = getSlotFile(req, 'icon');
  const image = getSlotFile(req, 'image');
  const ogImage = getSlotFile(req, 'ogImage');
  const twitterImage = getSlotFile(req, 'twitterImage');
  if (icon) files.icon = icon;
  if (image) files.image = image;
  if (ogImage) files.ogImage = ogImage;
  if (twitterImage) files.twitterImage = twitterImage;
  return files;
};
import {
  createSubjectBodySchema,
  listSubjectsQuerySchema,
  updateSubjectBodySchema,
  createSubjectTranslationBodySchema,
  listSubjectTranslationsQuerySchema,
  updateSubjectTranslationBodySchema,
  type CreateSubjectBody,
  type ListSubjectsQuery,
  type UpdateSubjectBody,
  type CreateSubjectTranslationBody,
  type ListSubjectTranslationsQuery,
  type UpdateSubjectTranslationBody
} from '../../../modules/subjects/subjects.schemas';

const router = Router();

router.use(authenticate);

// ─── Subject CRUD ────────────────────────────────────────────────

router.get(
  '/',
  authorize('subject.read'),
  validate({ query: listSubjectsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListSubjectsQuery;
    const { rows, meta } = await subjectsService.listSubjects(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('subject.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const s = await subjectsService.getSubjectById(id);
    if (!s) throw AppError.notFound(`Subject ${id} not found`);
    return ok(res, s, 'OK');
  })
);

router.post(
  '/',
  authorize('subject.create'),
  validate({ body: createSubjectBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateSubjectBody;
    const result = await subjectsService.createSubject(body, req.user?.id ?? null);
    const s = await subjectsService.getSubjectById(result.id);
    return created(res, s, 'Subject created');
  })
);

router.patch(
  '/:id',
  authorize('subject.update'),
  validate({ params: idParamSchema, body: updateSubjectBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSubjectBody;
    await subjectsService.updateSubject(id, body, req.user?.id ?? null);
    const s = await subjectsService.getSubjectById(id);
    return ok(res, s, 'Subject updated');
  })
);

router.delete(
  '/:id',
  authorize('subject.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await subjectsService.deleteSubject(id);
    return ok(res, { id, deleted: true }, 'Subject deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('subject.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await subjectsService.restoreSubject(id);
    const s = await subjectsService.getSubjectById(id);
    return ok(res, s, 'Subject restored');
  })
);

// ─── Translation sub-resource ───────────────────────────────────

router.get(
  '/:id/translations',
  authorize('subject.read'),
  validate({ params: idParamSchema, query: listSubjectTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const subjectId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListSubjectTranslationsQuery;
    const { rows, meta } = await subjectsService.listSubjectTranslations(subjectId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('subject.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const st = await subjectsService.getSubjectTranslationById(tid);
    if (!st) throw AppError.notFound(`Subject translation ${tid} not found`);
    return ok(res, st, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('subject.create'),
  patchSubjectTranslationFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: createSubjectTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const subjectId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateSubjectTranslationBody;
    const files = collectSubjectTranslationFiles(req);

    const result = await subjectsService.createSubjectTranslation(
      subjectId,
      body,
      req.user?.id ?? null
    );
    if (Object.keys(files).length > 0) {
      await subjectsService.processSubjectTranslationImageUploads(
        result.id,
        files,
        req.user?.id ?? null
      );
    }
    const st = await subjectsService.getSubjectTranslationById(result.id);
    return created(res, st, 'Subject translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('subject.update'),
  patchSubjectTranslationFiles,
  coerceMultipartBody,
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateSubjectTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateSubjectTranslationBody;
    const files = collectSubjectTranslationFiles(req);

    const hasTextChange = Object.keys(body).length > 0;
    const hasFile = Object.keys(files).length > 0;
    if (!hasTextChange && !hasFile) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await subjectsService.updateSubjectTranslation(tid, body, req.user?.id ?? null);
    }
    if (hasFile) {
      await subjectsService.processSubjectTranslationImageUploads(
        tid,
        files,
        req.user?.id ?? null
      );
    }

    const st = await subjectsService.getSubjectTranslationById(tid);
    return ok(res, st, 'Subject translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('subject.delete'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await subjectsService.deleteSubjectTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Subject translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('subject.restore'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await subjectsService.restoreSubjectTranslation(tid);
    const st = await subjectsService.getSubjectTranslationById(tid);
    return ok(res, st, 'Subject translation restored');
  })
);

export default router;
