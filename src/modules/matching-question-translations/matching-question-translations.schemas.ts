// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/matching-question-translations
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

// ─── Create body ────────────────────────────────────────────────

export const createMatchingQuestionTranslationBodySchema = z.object({
  matchingQuestionId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  questionText: z.string().trim().min(1),
  explanation: z.string().trim().optional(),
  hint: z.string().trim().optional(),
  image1: z.string().url().optional(),
  image2: z.string().url().optional(),
  isActive: z.boolean().optional()
});
export type CreateMatchingQuestionTranslationBody = z.infer<typeof createMatchingQuestionTranslationBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateMatchingQuestionTranslationBodySchema = z
  .object({
    questionText: z.string().trim().min(1).optional(),
    explanation: z.string().trim().nullable().optional(),
    hint: z.string().trim().nullable().optional(),
    image1: z.string().url().nullable().optional(),
    image2: z.string().url().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateMatchingQuestionTranslationBody = z.infer<typeof updateMatchingQuestionTranslationBodySchema>;
