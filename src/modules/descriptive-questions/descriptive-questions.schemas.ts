// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/descriptive-questions (phase 10, module 03).
// Parent table: descriptive_questions
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enums ──────────────────────────────────────────────────────

export const ANSWER_TYPES = ['short_answer', 'long_answer'] as const;
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;

// ─── List query ─────────────────────────────────────────────────

export const listDescriptiveQuestionsQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  descriptiveQuestionId: z.coerce.number().int().positive().optional(),
  languageId: z.coerce.number().int().positive().optional(),
  topicId: z.coerce.number().int().positive().optional(),
  answerType: z.enum(ANSWER_TYPES).optional(),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
  isMandatory: queryBooleanSchema.optional(),
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
export type ListDescriptiveQuestionsQuery = z.infer<typeof listDescriptiveQuestionsQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createDescriptiveQuestionBodySchema = z.object({
  topicId: z.number().int().positive(),
  answerType: z.enum(ANSWER_TYPES).optional(),
  code: z.string().trim().max(100).optional(),
  points: z.number().min(0).optional(),
  minWords: z.number().int().min(0).nullable().optional(),
  maxWords: z.number().int().min(0).nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
  isMandatory: z.boolean().optional(),
  isActive: z.boolean().optional()
});
export type CreateDescriptiveQuestionBody = z.infer<typeof createDescriptiveQuestionBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateDescriptiveQuestionBodySchema = z
  .object({
    topicId: z.number().int().positive().optional(),
    answerType: z.enum(ANSWER_TYPES).optional(),
    code: z.string().trim().max(100).nullable().optional(),
    points: z.number().min(0).optional(),
    minWords: z.number().int().min(-1).nullable().optional(),
    maxWords: z.number().int().min(-1).nullable().optional(),
    displayOrder: z.number().int().min(0).optional(),
    difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
    isMandatory: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateDescriptiveQuestionBody = z.infer<typeof updateDescriptiveQuestionBodySchema>;
