// ═══════════════════════════════════════════════════════════════
// /api/v1/sub-topics router — phase 08 material management CRUD.
//
// Authorization model:
//   Sub-topic CRUD:
//     GET    /              sub_topic.read
//     GET    /:id           sub_topic.read
//     POST   /              sub_topic.create
//     PATCH  /:id           sub_topic.update
//     DELETE /:id           sub_topic.delete
//     POST   /:id/restore   sub_topic.restore
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations              sub_topic.read
//     GET    /:id/translations/:tid         sub_topic.read
//     POST   /:id/translations              sub_topic.create
//     PATCH  /:id/translations/:tid         sub_topic.update
//     DELETE /:id/translations/:tid         sub_topic.delete
//     POST   /:id/translations/:tid/restore sub_topic.restore
//
// All routes require an authenticated user.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchSubTopicTranslationFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as subTopicsService from '../../../modules/sub-topics/sub-topics.service';
import type { SubTopicTranslationImageFiles } from '../../../modules/sub-topics/sub-topics.service';

const collectSubTopicTranslationFiles = (req: Parameters<typeof getSlotFile>[0]): SubTopicTranslationImageFiles => {
  const files: SubTopicTranslationImageFiles = {};
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
  createSubTopicBodySchema,
  listSubTopicsQuerySchema,
  updateSubTopicBodySchema,
  createSubTopicTranslationBodySchema,
  listSubTopicTranslationsQuerySchema,
  updateSubTopicTranslationBodySchema,
  type CreateSubTopicBody,
  type ListSubTopicsQuery,
  type UpdateSubTopicBody,
  type CreateSubTopicTranslationBody,
  type ListSubTopicTranslationsQuery,
  type UpdateSubTopicTranslationBody
} from '../../../modules/sub-topics/sub-topics.schemas';

const router = Router();

router.use(authenticate);

// ─── Sub-topic CRUD ──────────────────────────────────────────────

router.get(
  '/',
  authorize('sub_topic.read'),
  validate({ query: listSubTopicsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListSubTopicsQuery;
    const { rows, meta } = await subTopicsService.listSubTopics(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('sub_topic.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const st = await subTopicsService.getSubTopicById(id);
    if (!st) throw AppError.notFound(`Sub-topic ${id} not found`);
    return ok(res, st, 'OK');
  })
);

router.post(
  '/',
  authorize('sub_topic.create'),
  validate({ body: createSubTopicBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateSubTopicBody;
    const result = await subTopicsService.createSubTopic(body, req.user?.id ?? null);
    const st = await subTopicsService.getSubTopicById(result.id);
    return created(res, st, 'Sub-topic created');
  })
);

router.patch(
  '/:id',
  authorize('sub_topic.update'),
  validate({ params: idParamSchema, body: updateSubTopicBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSubTopicBody;

    // At-least-one-change check
    if (Object.keys(body).length === 0) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    await subTopicsService.updateSubTopic(id, body, req.user?.id ?? null);
    const st = await subTopicsService.getSubTopicById(id);
    return ok(res, st, 'Sub-topic updated');
  })
);

router.delete(
  '/:id',
  authorize('sub_topic.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await subTopicsService.deleteSubTopic(id);
    return ok(res, { id, deleted: true }, 'Sub-topic deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('sub_topic.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await subTopicsService.restoreSubTopic(id);
    const st = await subTopicsService.getSubTopicById(id);
    return ok(res, st, 'Sub-topic restored');
  })
);

// ─── Translation sub-resource ────────────────────────────────────

router.get(
  '/:id/translations',
  authorize('sub_topic.read'),
  validate({ params: idParamSchema, query: listSubTopicTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const subTopicId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListSubTopicTranslationsQuery;
    const { rows, meta } = await subTopicsService.listSubTopicTranslations(subTopicId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('sub_topic.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const stt = await subTopicsService.getSubTopicTranslationById(tid);
    if (!stt) throw AppError.notFound(`Sub-topic translation ${tid} not found`);
    return ok(res, stt, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('sub_topic.create'),
  patchSubTopicTranslationFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: createSubTopicTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const subTopicId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateSubTopicTranslationBody;
    const files = collectSubTopicTranslationFiles(req);

    const result = await subTopicsService.createSubTopicTranslation(
      subTopicId,
      body,
      req.user?.id ?? null
    );
    if (Object.keys(files).length > 0) {
      await subTopicsService.processSubTopicTranslationImageUploads(
        result.id,
        files,
        req.user?.id ?? null
      );
    }
    const stt = await subTopicsService.getSubTopicTranslationById(result.id);
    return created(res, stt, 'Sub-topic translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('sub_topic.update'),
  patchSubTopicTranslationFiles,
  coerceMultipartBody,
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateSubTopicTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateSubTopicTranslationBody;
    const files = collectSubTopicTranslationFiles(req);

    const hasTextChange = Object.keys(body).length > 0;
    const hasFile = Object.keys(files).length > 0;
    if (!hasTextChange && !hasFile) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await subTopicsService.updateSubTopicTranslation(tid, body, req.user?.id ?? null);
    }
    if (hasFile) {
      await subTopicsService.processSubTopicTranslationImageUploads(
        tid,
        files,
        req.user?.id ?? null
      );
    }

    const stt = await subTopicsService.getSubTopicTranslationById(tid);
    return ok(res, stt, 'Sub-topic translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('sub_topic.delete'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await subTopicsService.deleteSubTopicTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Sub-topic translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('sub_topic.restore'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await subTopicsService.restoreSubTopicTranslation(tid);
    const stt = await subTopicsService.getSubTopicTranslationById(tid);
    return ok(res, stt, 'Sub-topic translation restored');
  })
);

export default router;
