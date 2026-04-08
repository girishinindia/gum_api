import { z } from 'zod';

const actionEnum = z.enum(['assigned', 'revoked', 'expired', 'modified', 'restored']);
const contextTypeEnum = z.enum(['course', 'batch', 'department', 'branch', 'internship']);

// ─── Create (manual log entry) ─────────────────────────────

export const createLogDto = z.object({
  body: z.object({
    userId: z.coerce.number().int().positive(),
    action: actionEnum,
    roleId: z.coerce.number().int().positive().optional(),
    contextType: contextTypeEnum.optional(),
    contextId: z.coerce.number().int().positive().optional(),
    oldValues: z.record(z.unknown()).optional(),
    newValues: z.record(z.unknown()).optional(),
    reason: z.string().min(1).max(500).optional(),
    ipAddress: z.string().max(45).optional()
  })
});

// ─── ID Param ──────────────────────────────────────────────

export const logIdParamDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  })
});

// ─── Query: List ───────────────────────────────────────────

export const listLogsDto = z.object({
  query: z.object({
    id: z.coerce.number().int().positive().optional(),
    userId: z.coerce.number().int().positive().optional(),
    roleId: z.coerce.number().int().positive().optional(),
    action: actionEnum.optional(),
    contextType: contextTypeEnum.optional(),
    changedBy: z.coerce.number().int().positive().optional(),
    dateFrom: z.string().datetime({ offset: true }).optional(),
    dateTo: z.string().datetime({ offset: true }).optional(),
    search: z.string().min(1).optional(),
    sortBy: z.enum(['created_at', 'action', 'role_name', 'user_email']).optional(),
    sortDir: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional()
  })
});
