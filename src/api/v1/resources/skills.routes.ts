// ═══════════════════════════════════════════════════════════════
// /api/v1/skills router — phase 02 master data CRUD.
//
// Authorization model:
//   GET    /              skill.read
//   GET    /:id           skill.read
//   POST   /              skill.create   (JSON or multipart/form-data)
//   PATCH  /:id           skill.update   (JSON or multipart/form-data)
//   DELETE /:id           skill.delete
//   POST   /:id/restore   skill.restore
//
// All routes require an authenticated user.
//
// Unified PATCH accepts BOTH text field updates and optional icon
// uploads in a single request:
//   • JSON body: plain text-field patch
//   • multipart/form-data: text fields + optional `icon` slot (100 KB
//     WebP pipeline). Aliases: `iconImage`, `file`.
//   • To clear the icon, set `iconAction=delete` in the same body.
//     Uploading + deleting the same slot in one request is rejected.
//
// Icons (pipeline spec, enforced downstream):
//   • Input MIME:   PNG / JPEG / WebP / SVG
//   • Max raw size: 100 KB
//   • Output:       always WebP, resized to fit 256×256 box
//   • Storage key:  skills/icons/<id>.webp  (deterministic)
//   • On replace:   prior Bunny object(s) deleted BEFORE new PUT
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchSkillFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { assertVisibleToCaller } from '../../../core/utils/visibility';
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
router.use(gateSoftDeleteFilters);

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
    assertVisibleToCaller(skill, req.user, 'Skill', id);
    return ok(res, skill, 'OK');
  })
);

// POST / — create (JSON or multipart/form-data with optional icon).
router.post(
  '/',
  authorize('skill.create'),
  patchSkillFiles,
  coerceMultipartBody,
  validate({ body: createSkillBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateSkillBody;
    const iconFile = getSlotFile(req, 'icon');
    const result = await skillsService.createSkill(body, req.user?.id ?? null);
    if (iconFile) {
      await skillsService.processSkillIconUpload(result.id, iconFile, req.user?.id ?? null);
    }
    const skill = await skillsService.getSkillById(result.id);
    return created(res, skill, 'Skill created');
  })
);

// PATCH /:id — unified text + icon update.
router.patch(
  '/:id',
  authorize('skill.update'),
  patchSkillFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateSkillBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSkillBody;

    const { iconAction, ...textFields } = body;
    const iconFile = getSlotFile(req, 'icon');

    if (iconFile && iconAction === 'delete') {
      throw AppError.badRequest(
        "Cannot upload a new skill icon AND iconAction=delete in the same request — pick one."
      );
    }

    const hasTextChange = Object.keys(textFields).length > 0;
    const hasFileChange = Boolean(iconFile);
    const hasDelete = iconAction === 'delete';
    if (!hasTextChange && !hasFileChange && !hasDelete) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await skillsService.updateSkill(
        id,
        textFields as UpdateSkillBody,
        req.user?.id ?? null
      );
    }

    if (iconFile) {
      await skillsService.processSkillIconUpload(
        id,
        iconFile,
        req.user?.id ?? null
      );
    } else if (iconAction === 'delete') {
      await skillsService.deleteSkillIcon(
        id,
        req.user?.id ?? null
      );
    }

    const skill = await skillsService.getSkillById(id);
    return ok(res, skill, 'Skill updated');
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
