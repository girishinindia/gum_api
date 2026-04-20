import { z } from 'zod';

export const createSubjectSchema = z.object({
  code: z.string().min(1).max(100).trim(),
  slug: z.string().min(1).max(200).trim(),
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert', 'all_levels']).optional().default('beginner'),
  estimated_hours: z.number().positive().optional().nullable(),
  display_order: z.number().int().optional().default(0),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateSubjectSchema = createSubjectSchema.partial();
