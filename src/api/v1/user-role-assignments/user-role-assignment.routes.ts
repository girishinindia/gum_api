import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import {
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  restoreAssignment
} from './user-role-assignment.controller';
import {
  listAssignmentsDto,
  assignmentIdParamDto,
  createAssignmentDto,
  updateAssignmentDto
} from './user-role-assignment.dto';

const userRoleAssignmentRoutes = Router();

// ─── List assignments ──────────────────────────────────────
userRoleAssignmentRoutes.get('/', authMiddleware, authorize('role.assign'), validate(listAssignmentsDto), listAssignments);

// ─── Get single assignment ─────────────────────────────────
userRoleAssignmentRoutes.get('/:id', authMiddleware, authorize('role.assign'), validate(assignmentIdParamDto), getAssignment);

// ─── Create assignment ─────────────────────────────────────
userRoleAssignmentRoutes.post('/', authMiddleware, authorize('role.assign'), validate(createAssignmentDto), createAssignment);

// ─── Update assignment ─────────────────────────────────────
userRoleAssignmentRoutes.put('/:id', authMiddleware, authorize('role.assign'), validate(updateAssignmentDto), updateAssignment);

// ─── Delete assignment (soft) ──────────────────────────────
userRoleAssignmentRoutes.delete('/:id', authMiddleware, authorize('role.assign'), validate(assignmentIdParamDto), deleteAssignment);

// ─── Restore assignment ────────────────────────────────────
userRoleAssignmentRoutes.patch('/:id/restore', authMiddleware, authorize('role.assign'), validate(assignmentIdParamDto), restoreAssignment);

export { userRoleAssignmentRoutes };
