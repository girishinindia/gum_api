// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/mcq-option-translations (phase 10).
// Child table: mcq_option_translations
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

// ─── Create body ────────────────────────────────────────────────

export const createMcqOptionTranslationBodySchema = z.object({
  mcqOptionId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  optionText: z.string().trim().min(1, 'optionText is required'),
  image: z.string().trim().url().optional(),
  isActive: z.boolean().optional()
});
export type CreateMcqOptionTranslationBody = z.infer<typeof createMcqOptionTranslationBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateMcqOptionTranslationBodySchema = z
  .object({
    optionText: z.string().trim().min(1).optional(),
    image: z.string().trim().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateMcqOptionTranslationBody = z.infer<typeof updateMcqOptionTranslationBodySchema>;
