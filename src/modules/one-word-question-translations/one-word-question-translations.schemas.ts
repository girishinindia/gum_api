// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/one-word-question-translations
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

export const createOneWordQuestionTranslationBodySchema = z.object({
  oneWordQuestionId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  questionText: z.string().trim().min(1, 'questionText is required'),
  correctAnswer: z.string().trim().min(1, 'correctAnswer is required'),
  explanation: z.string().trim().optional(),
  hint: z.string().trim().optional(),
  image1: z.string().trim().url().optional(),
  image2: z.string().trim().url().optional(),
  isActive: z.boolean().optional()
});
export type CreateOneWordQuestionTranslationBody = z.infer<typeof createOneWordQuestionTranslationBodySchema>;

export const updateOneWordQuestionTranslationBodySchema = z
  .object({
    questionText: z.string().trim().min(1).optional(),
    correctAnswer: z.string().trim().min(1).optional(),
    explanation: z.string().trim().nullable().optional(),
    hint: z.string().trim().nullable().optional(),
    image1: z.string().trim().nullable().optional(),
    image2: z.string().trim().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateOneWordQuestionTranslationBody = z.infer<typeof updateOneWordQuestionTranslationBodySchema>;
