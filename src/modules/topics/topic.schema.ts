import { z } from 'zod';

export const createTopicSchema = z.object({
  chapter_id: z.number().int().positive().optional().nullable(),  // nullable for standalone topics
  slug: z.string().max(200).trim().optional().nullable(),
  display_order: z.number().int().optional().default(0),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateTopicSchema = createTopicSchema.partial();
