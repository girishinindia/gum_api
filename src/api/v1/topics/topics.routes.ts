// ═══════════════════════════════════════════════════════════════
// /api/v1/topics router — phase 08 material management CRUD.
//
// Authorization model:
//   Topic CRUD:
//     GET    /              topic.read
//     GET    /:id           topic.read
//     POST   /              topic.create
//     PATCH  /:id           topic.update
//     DELETE /:id           topic.delete
//     POST   /:id/restore   topic.restore
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations              topic.read
//     GET    /:id/translations/:tid         topic.read
//     POST   /:id/translations              topic.update
//     PATCH  /:id/translations/:tid         topic.update
//     DELETE /:id/translations/:tid         topic.update
//     POST   /:id/translations/:tid/restore topic.update
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
import * as topicsService from '../../../modules/topics/topics.service';
import {
  createTopicBodySchema,
  listTopicsQuerySchema,
  updateTopicBodySchema,
  createTopicTranslationBodySchema,
  listTopicTranslationsQuerySchema,
  updateTopicTranslationBodySchema,
  type CreateTopicBody,
  type ListTopicsQuery,
  type UpdateTopicBody,
  type CreateTopicTranslationBody,
  type ListTopicTranslationsQuery,
  type UpdateTopicTranslationBody
} from '../../../modules/topics/topics.schemas';

const router = Router();

router.use(authenticate);

// ─── Topic CRUD ──────────────────────────────────────────────────

router.get(
  '/',
  authorize('topic.read'),
  validate({ query: listTopicsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListTopicsQuery;
    const { rows, meta } = await topicsService.listTopics(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('topic.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const t = await topicsService.getTopicById(id);
    if (!t) throw AppError.notFound(`Topic ${id} not found`);
    return ok(res, t, 'OK');
  })
);

router.post(
  '/',
  authorize('topic.create'),
  validate({ body: createTopicBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateTopicBody;
    const result = await topicsService.createTopic(body, req.user?.id ?? null);
    const t = await topicsService.getTopicById(result.id);
    return created(res, t, 'Topic created');
  })
);

router.patch(
  '/:id',
  authorize('topic.update'),
  validate({ params: idParamSchema, body: updateTopicBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateTopicBody;
    await topicsService.updateTopic(id, body, req.user?.id ?? null);
    const t = await topicsService.getTopicById(id);
    return ok(res, t, 'Topic updated');
  })
);

router.delete(
  '/:id',
  authorize('topic.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await topicsService.deleteTopic(id);
    return ok(res, { id, deleted: true }, 'Topic deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('topic.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await topicsService.restoreTopic(id);
    const t = await topicsService.getTopicById(id);
    return ok(res, t, 'Topic restored');
  })
);

// ─── Translation sub-resource ────────────────────────────────────

router.get(
  '/:id/translations',
  authorize('topic.read'),
  validate({ params: idParamSchema, query: listTopicTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const topicId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListTopicTranslationsQuery;
    const { rows, meta } = await topicsService.listTopicTranslations(topicId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('topic.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const tt = await topicsService.getTopicTranslationById(tid);
    if (!tt) throw AppError.notFound(`Topic translation ${tid} not found`);
    return ok(res, tt, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('topic.update'),
  validate({ params: idParamSchema, body: createTopicTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const topicId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateTopicTranslationBody;
    const result = await topicsService.createTopicTranslation(
      topicId,
      body,
      req.user?.id ?? null
    );
    const tt = await topicsService.getTopicTranslationById(result.id);
    return created(res, tt, 'Topic translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('topic.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateTopicTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateTopicTranslationBody;
    await topicsService.updateTopicTranslation(tid, body, req.user?.id ?? null);
    const tt = await topicsService.getTopicTranslationById(tid);
    return ok(res, tt, 'Topic translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('topic.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await topicsService.deleteTopicTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Topic translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('topic.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await topicsService.restoreTopicTranslation(tid);
    const tt = await topicsService.getTopicTranslationById(tid);
    return ok(res, tt, 'Topic translation restored');
  })
);

export default router;
