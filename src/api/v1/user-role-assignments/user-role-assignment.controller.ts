import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { userRoleAssignmentService } from '../../../modules/user-role-assignments/user-role-assignment.service';

// ─── List user-role assignments ────────────────────────────

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    id: req.query.id ? Number(req.query.id) : undefined,
    userId: req.query.userId ? Number(req.query.userId) : undefined,
    roleId: req.query.roleId ? Number(req.query.roleId) : undefined,
    roleCode: req.query.roleCode as string | undefined,
    filterContextType: req.query.contextType as string | undefined,
    filterContextId: req.query.contextId ? Number(req.query.contextId) : undefined,
    filterIsValid: req.query.isValid !== undefined ? req.query.isValid === 'true' : undefined,
    searchTerm: req.query.search as string | undefined,
    sortColumn: req.query.sortBy as string | undefined,
    sortDirection: req.query.sortDir as string | undefined,
    pageIndex: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.limit ? Number(req.query.limit) : undefined
  };
  const data = await userRoleAssignmentService.list(query);
  return sendSuccess(res, data, 'User role assignments fetched');
});

// ─── Get single assignment by ID ───────────────────────────

export const getAssignment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await userRoleAssignmentService.getById(id);
  return sendSuccess(res, data, 'User role assignment fetched');
});

// ─── Create assignment ─────────────────────────────────────

export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { userId, roleId, contextType, contextId, expiresAt, reason } = req.body;
  const assignedBy = req.user!.userId;
  const data = await userRoleAssignmentService.create({
    userId,
    roleId,
    contextType,
    contextId,
    expiresAt,
    reason,
    assignedBy
  });
  return sendSuccess(res, data, 'User role assignment created', 201);
});

// ─── Update assignment ─────────────────────────────────────

export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { expiresAt, reason, isActive } = req.body;
  const updatedBy = req.user!.userId;
  const data = await userRoleAssignmentService.update(id, {
    expiresAt,
    reason,
    isActive,
    updatedBy
  });
  return sendSuccess(res, data, 'User role assignment updated');
});

// ─── Delete assignment (soft) ──────────────────────────────

export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const currentUserId = req.user!.userId;
  const data = await userRoleAssignmentService.delete(id, currentUserId);
  return sendSuccess(res, data, 'User role assignment deleted');
});

// ─── Restore assignment ────────────────────────────────────

export const restoreAssignment = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await userRoleAssignmentService.restore(id);
  return sendSuccess(res, data, 'User role assignment restored');
});
