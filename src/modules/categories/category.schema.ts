import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(200).trim(),
  code: z.string().min(1).max(100).trim(),
  slug: z.string().min(1).max(200).trim(),
  display_order: z.number().int().optional().default(0),
  is_new: z.boolean().optional().default(false),
  new_until: z.string().optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateCategorySchema = createCategorySchema.partial();
