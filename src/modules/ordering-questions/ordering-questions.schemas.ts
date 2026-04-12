// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/ordering-questions (phase 10, module 05).
// Parent table: ordering_questions
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enums ──────────────────────────────────────────────────────

export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;

// ─── List query ─────────────────────────────────────────────────

export const listOrderingQuestionsQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  orderingQuestionId: z.coerce.number().int().positive().optional(),
  languageId: z.coerce.number().int().positive().optional(),
  topicId: z.coerce.number().int().positive().optional(),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
  isMandatory: queryBooleanSchema.optional(),
  partialScoring: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  filterIsActive: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortTable: z.enum(['question', 'translation']).default('translation'),
  sortColumn: z.string().default('created_at'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('DESC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListOrderingQuestionsQuery = z.infer<typeof listOrderingQuestionsQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createOrderingQuestionBodySchema = z.object({
  topicId: z.number().int().positive(),
  code: z.string().trim().max(100).optional(),
  points: z.number().min(0).optional(),
  partialScoring: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
  isMandatory: z.boolean().optional(),
  isActive: z.boolean().optional()
});
export type CreateOrderingQuestionBody = z.infer<typeof createOrderingQuestionBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateOrderingQuestionBodySchema = z
  .object({
    topicId: z.number().int().positive().optional(),
    code: z.string().trim().max(100).nullable().optional(),
    points: z.number().min(0).optional(),
    partialScoring: z.boolean().optional(),
    displayOrder: z.number().int().min(0).optional(),
    difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
    isMandatory: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateOrderingQuestionBody = z.infer<typeof updateOrderingQuestionBodySchema>;
