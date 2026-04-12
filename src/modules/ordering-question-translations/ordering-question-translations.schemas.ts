// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/ordering-question-translations
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

// ─── Create body ────────────────────────────────────────────────

export const createOrderingQuestionTranslationBodySchema = z.object({
  orderingQuestionId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  questionText: z.string().trim().min(1),
  explanation: z.string().trim().optional(),
  hint: z.string().trim().optional(),
  image1: z.string().url().optional(),
  image2: z.string().url().optional(),
  isActive: z.boolean().optional()
});
export type CreateOrderingQuestionTranslationBody = z.infer<typeof createOrderingQuestionTranslationBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateOrderingQuestionTranslationBodySchema = z
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
export type UpdateOrderingQuestionTranslationBody = z.infer<typeof updateOrderingQuestionTranslationBodySchema>;
