// ═══════════════════════════════════════════════════════════════
// /api/v1/course-module-topics router — phase 09 junction CRUD.
//
// Authorization model:
//   GET    /              course_module_topic.read
//   GET    /:id           course_module_topic.read
//   POST   /              course_module_topic.create
//   PATCH  /:id           course_module_topic.update
//   DELETE /:id           course_module_topic.delete
//   POST   /:id/restore   course_module_topic.restore
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
import * as cmtService from '../../../modules/course-module-topics/course-module-topics.service';
import {
  createCourseModuleTopicBodySchema,
  listCourseModuleTopicsQuerySchema,
  updateCourseModuleTopicBodySchema,
  type CreateCourseModuleTopicBody,
  type ListCourseModuleTopicsQuery,
  type UpdateCourseModuleTopicBody
} from '../../../modules/course-module-topics/course-module-topics.schemas';

const router = Router();

router.use(authenticate);

// ─── CRUD ───────────────────────────────────────────────────────

router.get(
  '/',
  authorize('course_module_topic.read'),
  validate({ query: listCourseModuleTopicsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCourseModuleTopicsQuery;
    const { rows, meta } = await cmtService.listCourseModuleTopics(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('course_module_topic.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await cmtService.getCourseModuleTopicById(id);
    if (!row) throw AppError.notFound(`Course-module-topic mapping ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('course_module_topic.create'),
  validate({ body: createCourseModuleTopicBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCourseModuleTopicBody;
    const result = await cmtService.createCourseModuleTopic(body, req.user?.id ?? null);
    const row = await cmtService.getCourseModuleTopicById(result.id);
    return created(res, row, 'Course-module-topic mapping created');
  })
);

router.patch(
  '/:id',
  authorize('course_module_topic.update'),
  validate({ params: idParamSchema, body: updateCourseModuleTopicBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCourseModuleTopicBody;
    await cmtService.updateCourseModuleTopic(id, body, req.user?.id ?? null);
    const row = await cmtService.getCourseModuleTopicById(id);
    return ok(res, row, 'Course-module-topic mapping updated');
  })
);

router.delete(
  '/:id',
  authorize('course_module_topic.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await cmtService.deleteCourseModuleTopic(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Course-module-topic mapping deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('course_module_topic.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await cmtService.restoreCourseModuleTopic(id, req.user?.id ?? null);
    const row = await cmtService.getCourseModuleTopicById(id);
    return ok(res, row, 'Course-module-topic mapping restored');
  })
);

export default router;
