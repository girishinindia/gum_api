// ═══════════════════════════════════════════════════════════════
// /api/v1/course-batches router — phase 13 course batches CRUD.
//
// Authorization model:
//   Course Batch CRUD:
//     GET    /                        course_batch.read
//     GET    /:id                     course_batch.read
//     POST   /                        course_batch.create
//     PATCH  /:id                     course_batch.update
//     DELETE /:id                     course_batch.delete
//     POST   /:id/restore             course_batch.restore
//
//   Batch Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations                       batch_translation.read
//     GET    /:id/translations/:tid                  batch_translation.read
//     POST   /:id/translations                       batch_translation.create
//     PATCH  /:id/translations/:tid                  batch_translation.update
//     DELETE /:id/translations/:tid                  batch_translation.delete
//     POST   /:id/translations/:tid/restore          batch_translation.restore
//
//   Batch Session sub-resource (nested under /:batchId/sessions):
//     GET    /:batchId/sessions                      batch_session.read
//     GET    /:batchId/sessions/:sessionId           batch_session.read
//     POST   /:batchId/sessions                      batch_session.create
//     PATCH  /:batchId/sessions/:sessionId           batch_session.update
//     DELETE /:batchId/sessions/:sessionId           batch_session.delete
//     POST   /:batchId/sessions/:sessionId/restore   batch_session.restore
//
//   Batch Session Translation sub-resource (nested under /:batchId/sessions/:sessionId/translations):
//     GET    /:batchId/sessions/:sessionId/translations                   batch_session_translation.read
//     GET    /:batchId/sessions/:sessionId/translations/:tid              batch_session_translation.read
//     POST   /:batchId/sessions/:sessionId/translations                   batch_session_translation.create
//     PATCH  /:batchId/sessions/:sessionId/translations/:tid              batch_session_translation.update
//     DELETE /:batchId/sessions/:sessionId/translations/:tid              batch_session_translation.delete
//     POST   /:batchId/sessions/:sessionId/translations/:tid/restore      batch_session_translation.restore
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
import * as courseBatchService from '../../../modules/course-batches/course-batches.service';
import {
  createCourseBatchBodySchema,
  listCourseBatchesQuerySchema,
  updateCourseBatchBodySchema,
  createBatchTranslationBodySchema,
  listBatchTranslationsQuerySchema,
  updateBatchTranslationBodySchema,
  createBatchSessionBodySchema,
  listBatchSessionsQuerySchema,
  updateBatchSessionBodySchema,
  createBatchSessionTranslationBodySchema,
  listBatchSessionTranslationsQuerySchema,
  updateBatchSessionTranslationBodySchema,
  type CreateCourseBatchBody,
  type ListCourseBatchesQuery,
  type UpdateCourseBatchBody,
  type CreateBatchTranslationBody,
  type ListBatchTranslationsQuery,
  type UpdateBatchTranslationBody,
  type CreateBatchSessionBody,
  type ListBatchSessionsQuery,
  type UpdateBatchSessionBody,
  type CreateBatchSessionTranslationBody,
  type ListBatchSessionTranslationsQuery,
  type UpdateBatchSessionTranslationBody
} from '../../../modules/course-batches/course-batches.schemas';

const router = Router();

router.use(authenticate);

// ─── Course Batch CRUD ───────────────────────────────────────────

router.get(
  '/',
  authorize('course_batch.read'),
  validate({ query: listCourseBatchesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCourseBatchesQuery;
    const { rows, meta } = await courseBatchService.listCourseBatches(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('course_batch.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await courseBatchService.getCourseBatchById(id);
    if (!row) throw AppError.notFound(`Course batch ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('course_batch.create'),
  validate({ body: createCourseBatchBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCourseBatchBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await courseBatchService.createCourseBatch(body, callerId);
    const row = await courseBatchService.getCourseBatchById(id);
    return created(res, row, 'Course batch created');
  })
);

router.patch(
  '/:id',
  authorize('course_batch.update'),
  validate({ params: idParamSchema, body: updateCourseBatchBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCourseBatchBody;
    const callerId = (req as any).user?.id ?? null;
    await courseBatchService.updateCourseBatch(id, body, callerId);
    const row = await courseBatchService.getCourseBatchById(id);
    if (!row) throw AppError.notFound(`Course batch ${id} not found`);
    return ok(res, row, 'Course batch updated');
  })
);

router.delete(
  '/:id',
  authorize('course_batch.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await courseBatchService.deleteCourseBatch(id);
    return ok(res, { id, deleted: true }, 'Course batch deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('course_batch.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await courseBatchService.restoreCourseBatch(id);
    const row = await courseBatchService.getCourseBatchById(id);
    return ok(res, row, 'Course batch restored');
  })
);

// ─── Batch Translation sub-resource ──────────────────────────────

router.get(
  '/:id/translations',
  authorize('batch_translation.read'),
  validate({ params: idParamSchema, query: listBatchTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const batchId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListBatchTranslationsQuery;
    const { rows, meta } = await courseBatchService.listBatchTranslations(batchId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('batch_translation.read'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const row = await courseBatchService.getBatchTranslationById(tid);
    if (!row) throw AppError.notFound(`Batch translation ${tid} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('batch_translation.create'),
  validate({ params: idParamSchema, body: createBatchTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const batchId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateBatchTranslationBody;
    const { id } = await courseBatchService.createBatchTranslation(batchId, body);
    const row = await courseBatchService.getBatchTranslationById(id);
    return created(res, row, 'Batch translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('batch_translation.update'),
  validate({ body: updateBatchTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const body = req.body as UpdateBatchTranslationBody;
    await courseBatchService.updateBatchTranslation(tid, body);
    const row = await courseBatchService.getBatchTranslationById(tid);
    if (!row) throw AppError.notFound(`Batch translation ${tid} not found`);
    return ok(res, row, 'Batch translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('batch_translation.delete'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await courseBatchService.deleteBatchTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Batch translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('batch_translation.restore'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await courseBatchService.restoreBatchTranslation(tid);
    const row = await courseBatchService.getBatchTranslationById(tid);
    return ok(res, row, 'Batch translation restored');
  })
);

// ─── Batch Session sub-resource ──────────────────────────────────

router.get(
  '/:batchId/sessions',
  authorize('batch_session.read'),
  validate({ query: listBatchSessionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const batchId = Number((req.params as unknown as { batchId: number }).batchId);
    const q = req.query as unknown as ListBatchSessionsQuery;
    const { rows, meta } = await courseBatchService.listBatchSessions(batchId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:batchId/sessions/:sessionId',
  authorize('batch_session.read'),
  asyncHandler(async (req, res) => {
    const sessionId = Number((req.params as any).sessionId);
    const row = await courseBatchService.getBatchSessionById(sessionId);
    if (!row) throw AppError.notFound(`Batch session ${sessionId} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:batchId/sessions',
  authorize('batch_session.create'),
  validate({ body: createBatchSessionBodySchema }),
  asyncHandler(async (req, res) => {
    const batchId = Number((req.params as unknown as { batchId: number }).batchId);
    const body = req.body as CreateBatchSessionBody;
    const { id } = await courseBatchService.createBatchSession(batchId, body);
    const row = await courseBatchService.getBatchSessionById(id);
    return created(res, row, 'Batch session created');
  })
);

router.patch(
  '/:batchId/sessions/:sessionId',
  authorize('batch_session.update'),
  validate({ body: updateBatchSessionBodySchema }),
  asyncHandler(async (req, res) => {
    const sessionId = Number((req.params as any).sessionId);
    const body = req.body as UpdateBatchSessionBody;
    await courseBatchService.updateBatchSession(sessionId, body);
    const row = await courseBatchService.getBatchSessionById(sessionId);
    if (!row) throw AppError.notFound(`Batch session ${sessionId} not found`);
    return ok(res, row, 'Batch session updated');
  })
);

router.delete(
  '/:batchId/sessions/:sessionId',
  authorize('batch_session.delete'),
  asyncHandler(async (req, res) => {
    const sessionId = Number((req.params as any).sessionId);
    await courseBatchService.deleteBatchSession(sessionId);
    return ok(res, { id: sessionId, deleted: true }, 'Batch session deleted');
  })
);

router.post(
  '/:batchId/sessions/:sessionId/restore',
  authorize('batch_session.restore'),
  asyncHandler(async (req, res) => {
    const sessionId = Number((req.params as any).sessionId);
    await courseBatchService.restoreBatchSession(sessionId);
    const row = await courseBatchService.getBatchSessionById(sessionId);
    return ok(res, row, 'Batch session restored');
  })
);

// ─── Batch Session Translation sub-resource ──────────────────────

router.get(
  '/:batchId/sessions/:sessionId/translations',
  authorize('batch_session_translation.read'),
  validate({ query: listBatchSessionTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const sessionId = Number((req.params as any).sessionId);
    const q = req.query as unknown as ListBatchSessionTranslationsQuery;
    const { rows, meta } = await courseBatchService.listBatchSessionTranslations(sessionId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:batchId/sessions/:sessionId/translations/:tid',
  authorize('batch_session_translation.read'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const row = await courseBatchService.getBatchSessionTranslationById(tid);
    if (!row) throw AppError.notFound(`Batch session translation ${tid} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:batchId/sessions/:sessionId/translations',
  authorize('batch_session_translation.create'),
  validate({ body: createBatchSessionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const sessionId = Number((req.params as any).sessionId);
    const body = req.body as CreateBatchSessionTranslationBody;
    const { id } = await courseBatchService.createBatchSessionTranslation(sessionId, body);
    const row = await courseBatchService.getBatchSessionTranslationById(id);
    return created(res, row, 'Batch session translation created');
  })
);

router.patch(
  '/:batchId/sessions/:sessionId/translations/:tid',
  authorize('batch_session_translation.update'),
  validate({ body: updateBatchSessionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const body = req.body as UpdateBatchSessionTranslationBody;
    await courseBatchService.updateBatchSessionTranslation(tid, body);
    const row = await courseBatchService.getBatchSessionTranslationById(tid);
    if (!row) throw AppError.notFound(`Batch session translation ${tid} not found`);
    return ok(res, row, 'Batch session translation updated');
  })
);

router.delete(
  '/:batchId/sessions/:sessionId/translations/:tid',
  authorize('batch_session_translation.delete'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await courseBatchService.deleteBatchSessionTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Batch session translation deleted');
  })
);

router.post(
  '/:batchId/sessions/:sessionId/translations/:tid/restore',
  authorize('batch_session_translation.restore'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await courseBatchService.restoreBatchSessionTranslation(tid);
    const row = await courseBatchService.getBatchSessionTranslationById(tid);
    return ok(res, row, 'Batch session translation restored');
  })
);

export default router;
