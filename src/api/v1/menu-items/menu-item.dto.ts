import { z } from 'zod';

// ─── Create ────────────────────────────────────────────────

export const createMenuItemDto = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    code: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'Code must be lowercase alphanumeric with underscores'),
    route: z.string().max(255).optional(),
    icon: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    parentMenuId: z.coerce.number().int().positive().optional(),
    permissionId: z.coerce.number().int().positive().optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    isVisible: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
});

// ─── Update ────────────────────────────────────────────────

export const updateMenuItemDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    code: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'Code must be lowercase alphanumeric with underscores').optional(),
    route: z.string().max(255).optional(),
    icon: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    parentMenuId: z.coerce.number().int().positive().optional(),
    permissionId: z.coerce.number().int().positive().optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    isVisible: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
});

// ─── ID Param ──────────────────────────────────────────────

export const menuItemIdParamDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  })
});

// ─── Restore ───────────────────────────────────────────────

export const restoreMenuItemDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  }),
  body: z.object({
    restoreChildren: z.boolean().optional()
  })
});

// ─── Query: List ───────────────────────────────────────────

export const listMenuItemsDto = z.object({
  query: z.object({
    id: z.coerce.number().int().positive().optional(),
    code: z.string().min(1).optional(),
    parentId: z.coerce.number().int().positive().optional(),
    topLevelOnly: z.enum(['true', 'false']).optional(),
    isActive: z.enum(['true', 'false']).optional(),
    sortBy: z.enum(['display_order', 'name', 'code', 'created_at']).optional(),
    sortDir: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional()
  })
});
