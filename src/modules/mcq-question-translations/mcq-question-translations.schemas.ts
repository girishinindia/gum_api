// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/mcq-question-translations (phase 10).
// Child table: mcq_question_translations
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

// ─── Create body ────────────────────────────────────────────────

export const createMcqQuestionTranslationBodySchema = z.object({
  mcqQuestionId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  questionText: z.string().trim().min(1, 'questionText is required'),
  explanation: z.string().trim().optional(),
  hint: z.string().trim().optional(),
  image1: z.string().trim().url().optional(),
  image2: z.string().trim().url().optional(),
  isActive: z.boolean().optional()
});
export type CreateMcqQuestionTranslationBody = z.infer<typeof createMcqQuestionTranslationBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateMcqQuestionTranslationBodySchema = z
  .object({
    questionText: z.string().trim().min(1).optional(),
    explanation: z.string().trim().nullable().optional(),
    hint: z.string().trim().nullable().optional(),
    image1: z.string().trim().nullable().optional(),
    image2: z.string().trim().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateMcqQuestionTranslationBody = z.infer<typeof updateMcqQuestionTranslationBodySchema>;
