import { z } from 'zod';

export const LEVEL_CATEGORIES = [
  'pre_school', 'school', 'diploma', 'undergraduate',
  'postgraduate', 'doctoral', 'professional', 'informal', 'other',
] as const;

export const createEducationLevelSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  abbreviation: z.string().max(50).optional(),
  level_order: z.number().int().optional().default(0),
  level_category: z.enum(LEVEL_CATEGORIES).optional().default('other'),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateEducationLevelSchema = createEducationLevelSchema.partial();
