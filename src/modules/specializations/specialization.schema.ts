import { z } from 'zod';

export const SPECIALIZATION_CATEGORIES = ['technology', 'data', 'design', 'business', 'language', 'science', 'mathematics', 'arts', 'health', 'exam_prep', 'professional', 'other'] as const;

export const createSpecializationSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  category: z.enum(SPECIALIZATION_CATEGORIES).optional().default('technology'),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateSpecializationSchema = createSpecializationSchema.partial();
