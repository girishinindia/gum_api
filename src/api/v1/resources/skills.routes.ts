// ═══════════════════════════════════════════════════════════════
// /api/v1/skills router — phase 02 master data CRUD.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { uploadSkillIcon } from '../../../core/middlewares/upload';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as skillsService from '../../../modules/resources/skills.service';
import {
  createSkillBodySchema,
  listSkillsQuerySchema,
  updateSkillBodySchema,
  type CreateSkillBody,
  type ListSkillsQuery,
  type UpdateSkillBody
} from '../../../modules/resources/skills.schemas';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('skill.read'),
  validate({ query: listSkillsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListSkillsQuery;
    const { rows, meta } = await skillsService.listSkills(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('skill.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const skill = await skillsService.getSkillById(id);
    if (!skill) throw AppError.notFound(`Skill ${id} not found`);
    return ok(res, skill, 'OK');
  })
);

router.post(
  '/',
  authorize('skill.create'),
  validate({ body: createSkillBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateSkillBody;
    const result = await skillsService.createSkill(body, req.user?.id ?? null);
    const skill = await skillsService.getSkillById(result.id);
    return created(res, skill, 'Skill created');
  })
);

router.patch(
  '/:id',
  authorize('skill.update'),
  validate({ params: idParamSchema, body: updateSkillBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSkillBody;
    await skillsService.updateSkill(id, body, req.user?.id ?? null);
    const skill = await skillsService.getSkillById(id);
    return ok(res, skill, 'Skill updated');
  })
);

// ─── PATCH /:id/icon  icon file upload ────────────────────────────
//
// Accepts multipart/form-data with a single image file (field: "file").
// Pipeline: decode → resize ≤256×256 → WebP encode → Bunny PUT.

router.patch(
  '/:id/icon',
  authorize('skill.update'),
  uploadSkillIcon,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    if (!req.file) {
      throw AppError.badRequest(
        'No icon file provided. Send multipart/form-data with field "file".'
      );
    }
    const skill = await skillsService.processSkillIconUpload(
      id,
      req.file,
      req.user?.id ?? null
    );
    return ok(res, skill, 'Skill icon updated');
  })
);

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('skill.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await skillsService.deleteSkill(id);
    return ok(res, { id, deleted: true }, 'Skill deleted');
  })
);

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('skill.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await skillsService.restoreSkill(id);
    const skill = await skillsService.getSkillById(id);
    return ok(res, skill, 'Skill restored');
  })
);

export default router;
