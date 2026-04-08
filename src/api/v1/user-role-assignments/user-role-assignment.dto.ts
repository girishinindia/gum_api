import { z } from 'zod';

const contextTypeEnum = z.enum(['course', 'batch', 'department', 'branch', 'internship']);

// ─── Create ────────────────────────────────────────────────

export const createAssignmentDto = z.object({
  body: z.object({
    userId: z.coerce.number().int().positive(),
    roleId: z.coerce.number().int().positive(),
    contextType: contextTypeEnum.optional(),
    contextId: z.coerce.number().int().positive().optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    reason: z.string().min(1).max(500).optional()
  }).refine(
    (data) => {
      // If contextType is provided, contextId must also be provided (and vice versa)
      if (data.contextType && !data.contextId) return false;
      if (data.contextId && !data.contextType) return false;
      return true;
    },
    { message: 'contextType and contextId must both be provided or both be omitted.' }
  )
});

// ─── Update ────────────────────────────────────────────────

export const updateAssignmentDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  }),
  body: z.object({
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    reason: z.string().min(1).max(500).nullable().optional(),
    isActive: z.boolean().optional()
  })
});

// ─── ID Param ──────────────────────────────────────────────

export const assignmentIdParamDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  })
});

// ─── Query: List ───────────────────────────────────────────

export const listAssignmentsDto = z.object({
  query: z.object({
    id: z.coerce.number().int().positive().optional(),
    userId: z.coerce.number().int().positive().optional(),
    roleId: z.coerce.number().int().positive().optional(),
    roleCode: z.string().min(1).optional(),
    contextType: contextTypeEnum.optional(),
    contextId: z.coerce.number().int().positive().optional(),
    isValid: z.enum(['true', 'false']).optional(),
    search: z.string().min(1).optional(),
    sortBy: z.string().min(1).optional(),
    sortDir: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional()
  })
});
