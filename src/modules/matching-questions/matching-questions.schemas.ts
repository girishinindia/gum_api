// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/matching-questions (phase 10, module 04).
// Parent table: matching_questions
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enums ──────────────────────────────────────────────────────

export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;

// ─── List query ─────────────────────────────────────────────────

export const listMatchingQuestionsQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  matchingQuestionId: z.coerce.number().int().positive().optional(),
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
export type ListMatchingQuestionsQuery = z.infer<typeof listMatchingQuestionsQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createMatchingQuestionBodySchema = z.object({
  topicId: z.number().int().positive(),
  code: z.string().trim().max(100).optional(),
  points: z.number().min(0).optional(),
  partialScoring: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
  isMandatory: z.boolean().optional(),
  isActive: z.boolean().optional()
});
export type CreateMatchingQuestionBody = z.infer<typeof createMatchingQuestionBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateMatchingQuestionBodySchema = z
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
export type UpdateMatchingQuestionBody = z.infer<typeof updateMatchingQuestionBodySchema>;
