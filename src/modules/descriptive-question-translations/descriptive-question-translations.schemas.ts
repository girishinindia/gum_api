// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/descriptive-question-translations
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

// ─── Create body ────────────────────────────────────────────────

export const createDescriptiveQuestionTranslationBodySchema = z.object({
  descriptiveQuestionId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  questionText: z.string().trim().min(1),
  explanation: z.string().trim().optional(),
  hint: z.string().trim().optional(),
  modelAnswer: z.string().trim().optional(),
  questionImage1: z.string().url().optional(),
  questionImage2: z.string().url().optional(),
  questionImage3: z.string().url().optional(),
  answerImage1: z.string().url().optional(),
  answerImage2: z.string().url().optional(),
  answerImage3: z.string().url().optional(),
  isActive: z.boolean().optional()
});
export type CreateDescriptiveQuestionTranslationBody = z.infer<typeof createDescriptiveQuestionTranslationBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateDescriptiveQuestionTranslationBodySchema = z
  .object({
    questionText: z.string().trim().min(1).optional(),
    explanation: z.string().trim().nullable().optional(),
    hint: z.string().trim().nullable().optional(),
    modelAnswer: z.string().trim().nullable().optional(),
    questionImage1: z.string().url().nullable().optional(),
    questionImage2: z.string().url().nullable().optional(),
    questionImage3: z.string().url().nullable().optional(),
    answerImage1: z.string().url().nullable().optional(),
    answerImage2: z.string().url().nullable().optional(),
    answerImage3: z.string().url().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateDescriptiveQuestionTranslationBody = z.infer<typeof updateDescriptiveQuestionTranslationBodySchema>;
