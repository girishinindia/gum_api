import { z } from 'zod';

export const SKILL_CATEGORIES = [
  'technical', 'soft_skill', 'tool', 'framework',
  'language', 'domain', 'certification', 'other',
] as const;

export const createSkillSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  category: z.enum(SKILL_CATEGORIES).optional().default('technical'),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateSkillSchema = createSkillSchema.partial();
