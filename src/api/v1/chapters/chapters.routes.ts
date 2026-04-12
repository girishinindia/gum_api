// ═══════════════════════════════════════════════════════════════
// /api/v1/chapters router — phase 08 chapter management CRUD.
//
// Authorization model:
//   Chapter CRUD:
//     GET    /              chapter.read
//     GET    /:id           chapter.read
//     POST   /              chapter.create
//     PATCH  /:id           chapter.update
//     DELETE /:id           chapter.delete
//     POST   /:id/restore   chapter.restore
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations              chapter.read
//     GET    /:id/translations/:tid         chapter.read
//     POST   /:id/translations              chapter.create
//     PATCH  /:id/translations/:tid         chapter.update
//     DELETE /:id/translations/:tid         chapter.delete
//     POST   /:id/translations/:tid/restore chapter.restore
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
import * as chaptersService from '../../../modules/chapters/chapters.service';
import {
  createChapterBodySchema,
  listChaptersQuerySchema,
  updateChapterBodySchema,
  createChapterTranslationBodySchema,
  listChapterTranslationsQuerySchema,
  updateChapterTranslationBodySchema,
  type CreateChapterBody,
  type ListChaptersQuery,
  type UpdateChapterBody,
  type CreateChapterTranslationBody,
  type ListChapterTranslationsQuery,
  type UpdateChapterTranslationBody
} from '../../../modules/chapters/chapters.schemas';

const router = Router();

router.use(authenticate);

// ─── Chapter CRUD ────────────────────────────────────────────────

router.get(
  '/',
  authorize('chapter.read'),
  validate({ query: listChaptersQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListChaptersQuery;
    const { rows, meta } = await chaptersService.listChapters(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('chapter.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const c = await chaptersService.getChapterById(id);
    if (!c) throw AppError.notFound(`Chapter ${id} not found`);
    return ok(res, c, 'OK');
  })
);

router.post(
  '/',
  authorize('chapter.create'),
  validate({ body: createChapterBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateChapterBody;
    const result = await chaptersService.createChapter(body, req.user?.id ?? null);
    const c = await chaptersService.getChapterById(result.id);
    return created(res, c, 'Chapter created');
  })
);

router.patch(
  '/:id',
  authorize('chapter.update'),
  validate({ params: idParamSchema, body: updateChapterBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateChapterBody;

    // At-least-one-change check
    if (Object.keys(body).length === 0) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    await chaptersService.updateChapter(id, body, req.user?.id ?? null);
    const c = await chaptersService.getChapterById(id);
    return ok(res, c, 'Chapter updated');
  })
);

router.delete(
  '/:id',
  authorize('chapter.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await chaptersService.deleteChapter(id);
    return ok(res, { id, deleted: true }, 'Chapter deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('chapter.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await chaptersService.restoreChapter(id);
    const c = await chaptersService.getChapterById(id);
    return ok(res, c, 'Chapter restored');
  })
);

// ─── Translation sub-resource ───────────────────────────────────

router.get(
  '/:id/translations',
  authorize('chapter.read'),
  validate({ params: idParamSchema, query: listChapterTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const chapterId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListChapterTranslationsQuery;
    const { rows, meta } = await chaptersService.listChapterTranslations(chapterId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('chapter.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const ct = await chaptersService.getChapterTranslationById(tid);
    if (!ct) throw AppError.notFound(`Chapter translation ${tid} not found`);
    return ok(res, ct, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('chapter.create'),
  validate({ params: idParamSchema, body: createChapterTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const chapterId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateChapterTranslationBody;
    const result = await chaptersService.createChapterTranslation(
      chapterId,
      body,
      req.user?.id ?? null
    );
    const ct = await chaptersService.getChapterTranslationById(result.id);
    return created(res, ct, 'Chapter translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('chapter.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateChapterTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateChapterTranslationBody;
    await chaptersService.updateChapterTranslation(tid, body, req.user?.id ?? null);
    const ct = await chaptersService.getChapterTranslationById(tid);
    return ok(res, ct, 'Chapter translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('chapter.delete'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await chaptersService.deleteChapterTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Chapter translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('chapter.restore'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await chaptersService.restoreChapterTranslation(tid);
    const ct = await chaptersService.getChapterTranslationById(tid);
    return ok(res, ct, 'Chapter translation restored');
  })
);

export default router;
