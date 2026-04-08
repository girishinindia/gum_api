import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { roleChangeLogService } from '../../../modules/role-change-log/role-change-log.service';

// ─── List role change log entries ──────────────────────────

export const listLogs = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    id: req.query.id ? Number(req.query.id) : undefined,
    userId: req.query.userId ? Number(req.query.userId) : undefined,
    roleId: req.query.roleId ? Number(req.query.roleId) : undefined,
    filterAction: req.query.action as string | undefined,
    filterContextType: req.query.contextType as string | undefined,
    filterChangedBy: req.query.changedBy ? Number(req.query.changedBy) : undefined,
    filterDateFrom: req.query.dateFrom as string | undefined,
    filterDateTo: req.query.dateTo as string | undefined,
    searchTerm: req.query.search as string | undefined,
    sortColumn: req.query.sortBy as string | undefined,
    sortDirection: req.query.sortDir as string | undefined,
    pageIndex: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.limit ? Number(req.query.limit) : undefined
  };
  const data = await roleChangeLogService.list(query);
  return sendSuccess(res, data, 'Role change logs fetched');
});

// ─── Get single log entry ──────────────────────────────────

export const getLog = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await roleChangeLogService.getById(id);
  return sendSuccess(res, data, 'Role change log entry fetched');
});

// ─── Create manual log entry ───────────────────────────────

export const createLog = asyncHandler(async (req: Request, res: Response) => {
  const {
    userId, action, roleId, contextType, contextId,
    oldValues, newValues, reason, ipAddress
  } = req.body;
  const changedBy = req.user!.userId;
  const data = await roleChangeLogService.create({
    userId, action, roleId, contextType, contextId,
    oldValues, newValues, reason, ipAddress, changedBy
  });
  return sendSuccess(res, data, 'Role change log entry created', 201);
});
