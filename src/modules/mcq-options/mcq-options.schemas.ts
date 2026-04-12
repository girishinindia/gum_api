// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/mcq-options (phase 10).
// Child table: mcq_options
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

// ─── Create body ────────────────────────────────────────────────

export const createMcqOptionBodySchema = z.object({
  mcqQuestionId: z.number().int().positive(),
  isCorrect: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});
export type CreateMcqOptionBody = z.infer<typeof createMcqOptionBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateMcqOptionBodySchema = z
  .object({
    isCorrect: z.boolean().optional(),
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateMcqOptionBody = z.infer<typeof updateMcqOptionBodySchema>;
