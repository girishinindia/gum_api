// ═══════════════════════════════════════════════════════════════
// /api/v1/course-modules router — phase 09 module CRUD + translations.
//
// Module CRUD:
//   GET    /                          course_module.read
//   GET    /:id                       course_module.read
//   POST   /                          course_module.create
//   PATCH  /:id                       course_module.update
//   DELETE /:id                       course_module.delete
//   POST   /:id/restore              course_module.restore
//
// Translation sub-resource:
//   GET    /:id/translations          course_module.read
//   GET    /:id/translations/:tid     course_module.read
//   POST   /:id/translations          course_module.create
//   PATCH  /:id/translations/:tid     course_module.update
//   DELETE /:id/translations/:tid     course_module.delete
//   POST   /:id/translations/:tid/restore  course_module.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { Request } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchCourseModuleTranslationFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as cmService from '../../../modules/course-modules/course-modules.service';
import type { CourseModuleTranslationImageFiles } from '../../../modules/course-modules/course-modules.service';

const collectModuleTranslationFiles = (req: Request): CourseModuleTranslationImageFiles => {
  const files: CourseModuleTranslationImageFiles = {};
  const slots: Array<keyof CourseModuleTranslationImageFiles> = [
    'icon',
    'image',
    'ogImage',
    'twitterImage'
  ];
  for (const slot of slots) {
    const f = getSlotFile(req, slot);
    if (f) files[slot] = f;
  }
  return files;
};
import {
  createCourseModuleBodySchema,
  listCourseModulesQuerySchema,
  updateCourseModuleBodySchema,
  createCourseModuleTranslationBodySchema,
  listCourseModuleTranslationsQuerySchema,
  updateCourseModuleTranslationBodySchema,
  type CreateCourseModuleBody,
  type ListCourseModulesQuery,
  type UpdateCourseModuleBody,
  type CreateCourseModuleTranslationBody,
  type ListCourseModuleTranslationsQuery,
  type UpdateCourseModuleTranslationBody
} from '../../../modules/course-modules/course-modules.schemas';

const router = Router();

router.use(authenticate);

// ─── Module CRUD ────────────────────────────────────────────────

router.get(
  '/',
  authorize('course_module.read'),
  validate({ query: listCourseModulesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCourseModulesQuery;
    const { rows, meta } = await cmService.listCourseModules(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('course_module.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await cmService.getCourseModuleById(id);
    if (!row) throw AppError.notFound(`Course module ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('course_module.create'),
  validate({ body: createCourseModuleBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCourseModuleBody;
    const result = await cmService.createCourseModule(body, req.user?.id ?? null);
    const row = await cmService.getCourseModuleById(result.id);
    return created(res, row, 'Course module created');
  })
);

router.patch(
  '/:id',
  authorize('course_module.update'),
  validate({ params: idParamSchema, body: updateCourseModuleBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCourseModuleBody;
    await cmService.updateCourseModule(id, body, req.user?.id ?? null);
    const row = await cmService.getCourseModuleById(id);
    return ok(res, row, 'Course module updated');
  })
);

router.delete(
  '/:id',
  authorize('course_module.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await cmService.deleteCourseModule(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Course module deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('course_module.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await cmService.restoreCourseModule(id, req.user?.id ?? null);
    const row = await cmService.getCourseModuleById(id);
    return ok(res, row, 'Course module restored');
  })
);

// ─── Translation sub-resource ───────────────────────────────────

router.get(
  '/:id/translations',
  authorize('course_module.read'),
  validate({ params: idParamSchema, query: listCourseModuleTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const moduleId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListCourseModuleTranslationsQuery;
    const { rows, meta } = await cmService.listCourseModuleTranslations(moduleId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('course_module.read'),
  asyncHandler(async (req, res) => {
    const tid = Number(req.params.tid);
    const row = await cmService.getCourseModuleTranslationById(tid);
    if (!row) throw AppError.notFound(`Course module translation ${tid} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('course_module.create'),
  patchCourseModuleTranslationFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: createCourseModuleTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const moduleId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateCourseModuleTranslationBody;
    const files = collectModuleTranslationFiles(req);
    const result = await cmService.createCourseModuleTranslation(moduleId, body, req.user?.id ?? null);
    if (Object.keys(files).length > 0) {
      await cmService.processCourseModuleTranslationImageUploads(
        result.id,
        files,
        req.user?.id ?? null
      );
    }
    const row = await cmService.getCourseModuleTranslationById(result.id);
    return created(res, row, 'Course module translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('course_module.update'),
  patchCourseModuleTranslationFiles,
  coerceMultipartBody,
  validate({ body: updateCourseModuleTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const tid = Number(req.params.tid);
    const body = req.body as UpdateCourseModuleTranslationBody;
    const files = collectModuleTranslationFiles(req);

    const hasTextChange = Object.keys(body).length > 0;
    const hasFile = Object.keys(files).length > 0;
    if (!hasTextChange && !hasFile) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await cmService.updateCourseModuleTranslation(tid, body, req.user?.id ?? null);
    }
    if (hasFile) {
      await cmService.processCourseModuleTranslationImageUploads(
        tid,
        files,
        req.user?.id ?? null
      );
    }
    const row = await cmService.getCourseModuleTranslationById(tid);
    return ok(res, row, 'Course module translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('course_module.delete'),
  asyncHandler(async (req, res) => {
    const tid = Number(req.params.tid);
    await cmService.deleteCourseModuleTranslation(tid, req.user?.id ?? null);
    return ok(res, { id: tid, deleted: true }, 'Course module translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('course_module.restore'),
  asyncHandler(async (req, res) => {
    const tid = Number(req.params.tid);
    await cmService.restoreCourseModuleTranslation(tid, req.user?.id ?? null);
    const row = await cmService.getCourseModuleTranslationById(tid);
    return ok(res, row, 'Course module translation restored');
  })
);

export default router;
