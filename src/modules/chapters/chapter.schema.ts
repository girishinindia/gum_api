import { z } from 'zod';

export const createChapterSchema = z.object({
  subject_id: z.number().int().positive(),
  slug: z.string().max(200).trim().optional().nullable(),
  display_order: z.number().int().optional().default(0),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateChapterSchema = createChapterSchema.partial();
