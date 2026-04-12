import { z } from 'zod';

export const createMatchingPairBodySchema = z.object({
  matchingQuestionId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});
export type CreateMatchingPairBody = z.infer<typeof createMatchingPairBodySchema>;

export const updateMatchingPairBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateMatchingPairBody = z.infer<typeof updateMatchingPairBodySchema>;
