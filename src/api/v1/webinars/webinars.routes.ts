// ═══════════════════════════════════════════════════════════════
// /api/v1/webinars router — phase 12 webinar CRUD.
//
// Authorization model:
//   Webinar CRUD:
//     GET    /              webinar.read
//     GET    /:id           webinar.read
//     POST   /              webinar.create
//     PATCH  /:id           webinar.update
//     DELETE /:id           webinar.delete
//     POST   /:id/restore   webinar.restore
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations              webinar_translation.read
//     GET    /:id/translations/:tid         webinar_translation.read
//     POST   /:id/translations              webinar_translation.create
//     PATCH  /:id/translations/:tid         webinar_translation.update
//     DELETE /:id/translations/:tid         webinar_translation.delete
//     POST   /:id/translations/:tid/restore webinar_translation.restore
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
import * as webinarService from '../../../modules/webinars/webinars.service';
import {
  createWebinarBodySchema,
  listWebinarsQuerySchema,
  updateWebinarBodySchema,
  createWebinarTranslationBodySchema,
  listWebinarTranslationsQuerySchema,
  updateWebinarTranslationBodySchema,
  type CreateWebinarBody,
  type ListWebinarsQuery,
  type UpdateWebinarBody,
  type CreateWebinarTranslationBody,
  type ListWebinarTranslationsQuery,
  type UpdateWebinarTranslationBody
} from '../../../modules/webinars/webinars.schemas';

const router = Router();

router.use(authenticate);

// ─── Webinar CRUD ────────────────────────────────────────────────

router.get(
  '/',
  authorize('webinar.read'),
  validate({ query: listWebinarsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListWebinarsQuery;
    const { rows, meta } = await webinarService.listWebinars(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('webinar.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await webinarService.getWebinarById(id);
    if (!row) throw AppError.notFound(`Webinar ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('webinar.create'),
  validate({ body: createWebinarBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateWebinarBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await webinarService.createWebinar(body, callerId);
    const row = await webinarService.getWebinarById(id);
    return created(res, row, 'Webinar created');
  })
);

router.patch(
  '/:id',
  authorize('webinar.update'),
  validate({ params: idParamSchema, body: updateWebinarBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateWebinarBody;
    const callerId = (req as any).user?.id ?? null;
    await webinarService.updateWebinar(id, body, callerId);
    const row = await webinarService.getWebinarById(id);
    if (!row) throw AppError.notFound(`Webinar ${id} not found`);
    return ok(res, row, 'Webinar updated');
  })
);

router.delete(
  '/:id',
  authorize('webinar.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await webinarService.deleteWebinar(id);
    return ok(res, { id, deleted: true }, 'Webinar deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('webinar.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await webinarService.restoreWebinar(id);
    const row = await webinarService.getWebinarById(id);
    return ok(res, row, 'Webinar restored');
  })
);

// ─── Translation sub-resource ────────────────────────────────────

router.get(
  '/:id/translations',
  authorize('webinar_translation.read'),
  validate({ params: idParamSchema, query: listWebinarTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const webinarId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListWebinarTranslationsQuery;
    const { rows, meta } = await webinarService.listWebinarTranslations(webinarId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('webinar_translation.read'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const row = await webinarService.getWebinarTranslationById(tid);
    if (!row) throw AppError.notFound(`Webinar translation ${tid} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('webinar_translation.create'),
  validate({ params: idParamSchema, body: createWebinarTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const webinarId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateWebinarTranslationBody;
    const { id } = await webinarService.createWebinarTranslation(webinarId, body);
    const row = await webinarService.getWebinarTranslationById(id);
    return created(res, row, 'Webinar translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('webinar_translation.update'),
  validate({ body: updateWebinarTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const body = req.body as UpdateWebinarTranslationBody;
    await webinarService.updateWebinarTranslation(tid, body);
    const row = await webinarService.getWebinarTranslationById(tid);
    if (!row) throw AppError.notFound(`Webinar translation ${tid} not found`);
    return ok(res, row, 'Webinar translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('webinar_translation.delete'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await webinarService.deleteWebinarTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Webinar translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('webinar_translation.restore'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await webinarService.restoreWebinarTranslation(tid);
    const row = await webinarService.getWebinarTranslationById(tid);
    return ok(res, row, 'Webinar translation restored');
  })
);

export default router;
