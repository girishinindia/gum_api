import { z } from 'zod';

const actionEnum = z.enum([
  'create', 'read', 'update', 'delete',
  'approve', 'reject', 'publish', 'unpublish',
  'export', 'import', 'assign', 'manage',
  'restore', 'ban', 'unban', 'verify'
]);

const scopeEnum = z.enum(['global', 'own', 'assigned']);

// ─── Create ─────────────────────────────────────────────────

export const createPermissionDto = z.object({
  body: z.object({
    moduleId: z.coerce.number().int().positive(),
    name: z.string().trim().min(2).max(100),
    code: z.string().trim().min(2).max(80).regex(/^[a-z0-9_.]+$/, 'Code must be lowercase alphanumeric with dots/underscores.'),
    resource: z.string().trim().min(1).max(50).regex(/^[a-z0-9_]+$/, 'Resource must be lowercase alphanumeric with underscores.'),
    action: actionEnum,
    scope: scopeEnum.optional(),
    description: z.string().trim().max(500).optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
});

// ─── Update ─────────────────────────────────────────────────

export const updatePermissionDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  }),
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    code: z.string().trim().min(2).max(80).regex(/^[a-z0-9_.]+$/, 'Code must be lowercase alphanumeric with dots/underscores.').optional(),
    description: z.string().trim().max(500).optional(),
    resource: z.string().trim().min(1).max(50).regex(/^[a-z0-9_]+$/, 'Resource must be lowercase alphanumeric with underscores.').optional(),
    action: actionEnum.optional(),
    scope: scopeEnum.optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
});

// ─── Params: ID ─────────────────────────────────────────────

export const permissionIdParamDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  })
});

// ─── Query: List ────────────────────────────────────────────

export const listPermissionsDto = z.object({
  query: z.object({
    isActive: z.enum(['true', 'false']).optional(),
    moduleId: z.coerce.number().int().positive().optional(),
    moduleCode: z.string().min(1).optional(),
    resource: z.string().min(1).optional(),
    action: z.string().min(1).optional(),
    scope: z.enum(['global', 'own', 'assigned']).optional(),
    search: z.string().min(1).optional(),
    sortBy: z.string().min(1).optional(),
    sortDir: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional()
  })
});
