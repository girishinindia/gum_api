import { z } from 'zod';

// ─── Create ─────────────────────────────────────────────────

export const createModuleDto = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    code: z.string().trim().min(2).max(50).regex(/^[a-z0-9_]+$/, 'Code must be lowercase alphanumeric with underscores.'),
    description: z.string().trim().max(500).optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    icon: z.string().trim().max(50).optional(),
    color: z.string().trim().max(20).optional(),
    isActive: z.boolean().optional()
  })
});

// ─── Update ─────────────────────────────────────────────────

export const updateModuleDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  }),
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    code: z.string().trim().min(2).max(50).regex(/^[a-z0-9_]+$/, 'Code must be lowercase alphanumeric with underscores.').optional(),
    description: z.string().trim().max(500).optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    icon: z.string().trim().max(50).optional(),
    color: z.string().trim().max(20).optional(),
    isActive: z.boolean().optional()
  })
});

// ─── Params: ID ─────────────────────────────────────────────

export const moduleIdParamDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  })
});

// ─── Query: List ────────────────────────────────────────────

export const listModulesDto = z.object({
  query: z.object({
    isActive: z.enum(['true', 'false']).optional(),
    search: z.string().min(1).optional(),
    sortBy: z.string().min(1).optional(),
    sortDir: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  })
});
