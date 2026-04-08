import { z } from 'zod';

// ─── Assign (single) ───────────────────────────────────────

export const assignPermissionDto = z.object({
  body: z.object({
    roleId: z.coerce.number().int().positive(),
    permissionId: z.coerce.number().int().positive()
  })
});

// ─── Bulk Assign ────────────────────────────────────────────

export const bulkAssignPermissionsDto = z.object({
  body: z.object({
    roleId: z.coerce.number().int().positive(),
    permissionIds: z.array(z.coerce.number().int().positive()).min(1, 'At least one permission ID required.')
  })
});

// ─── Remove (single) ───────────────────────────────────────

export const removePermissionDto = z.object({
  body: z.object({
    roleId: z.coerce.number().int().positive(),
    permissionId: z.coerce.number().int().positive()
  })
});

// ─── Bulk Remove (by role) ──────────────────────────────────

export const bulkRemovePermissionsDto = z.object({
  params: z.object({
    roleId: z.coerce.number().int().positive()
  })
});

// ─── Replace (atomic) ──────────────────────────────────────

export const replacePermissionsDto = z.object({
  body: z.object({
    roleId: z.coerce.number().int().positive(),
    permissionIds: z.array(z.coerce.number().int().positive())  // empty array = clear all
  })
});

// ─── User permissions param ─────────────────────────────────

export const userIdParamDto = z.object({
  params: z.object({
    userId: z.coerce.number().int().positive()
  })
});

// ─── Query: List ────────────────────────────────────────────

export const listRolePermissionsDto = z.object({
  query: z.object({
    roleId: z.coerce.number().int().positive().optional(),
    roleCode: z.string().min(1).optional(),
    permissionId: z.coerce.number().int().positive().optional(),
    moduleCode: z.string().min(1).optional(),
    action: z.string().min(1).optional(),
    scope: z.enum(['global', 'own', 'assigned']).optional(),
    search: z.string().min(1).optional(),
    sortBy: z.string().min(1).optional(),
    sortDir: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional()
  })
});
