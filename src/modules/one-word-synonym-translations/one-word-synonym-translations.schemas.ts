import { z } from 'zod';

export const createOneWordSynonymTranslationBodySchema = z.object({
  oneWordSynonymId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  synonymText: z.string().trim().min(1, 'synonymText is required'),
  isActive: z.boolean().optional()
});
export type CreateOneWordSynonymTranslationBody = z.infer<typeof createOneWordSynonymTranslationBodySchema>;

export const updateOneWordSynonymTranslationBodySchema = z
  .object({
    synonymText: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateOneWordSynonymTranslationBody = z.infer<typeof updateOneWordSynonymTranslationBodySchema>;
