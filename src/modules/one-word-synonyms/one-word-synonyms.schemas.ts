import { z } from 'zod';

export const createOneWordSynonymBodySchema = z.object({
  oneWordQuestionId: z.number().int().positive(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});
export type CreateOneWordSynonymBody = z.infer<typeof createOneWordSynonymBodySchema>;

export const updateOneWordSynonymBodySchema = z
  .object({
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateOneWordSynonymBody = z.infer<typeof updateOneWordSynonymBodySchema>;
