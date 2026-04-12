import { z } from 'zod';

export const createMatchingPairTranslationBodySchema = z.object({
  matchingPairId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  leftText: z.string().trim().min(1, 'leftText is required'),
  rightText: z.string().trim().min(1, 'rightText is required'),
  leftImage: z.string().url().optional(),
  rightImage: z.string().url().optional(),
  isActive: z.boolean().optional()
});
export type CreateMatchingPairTranslationBody = z.infer<typeof createMatchingPairTranslationBodySchema>;

export const updateMatchingPairTranslationBodySchema = z
  .object({
    leftText: z.string().trim().min(1).optional(),
    rightText: z.string().trim().min(1).optional(),
    leftImage: z.string().url().nullable().optional(),
    rightImage: z.string().url().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateMatchingPairTranslationBody = z.infer<typeof updateMatchingPairTranslationBodySchema>;
