import { z } from 'zod';

export const createLearningGoalSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  display_order: z.number().int().optional().default(0),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateLearningGoalSchema = createLearningGoalSchema.partial();
