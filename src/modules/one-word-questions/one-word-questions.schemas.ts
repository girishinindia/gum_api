// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/one-word-questions (phase 10, module 02).
// Parent table: one_word_questions
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enums ──────────────────────────────────────────────────────

export const QUESTION_TYPES = ['one_word', 'fill_in_the_blank', 'code_output'] as const;
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;

// ─── List query ─────────────────────────────────────────────────

export const listOneWordQuestionsQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  oneWordQuestionId: z.coerce.number().int().positive().optional(),
  languageId: z.coerce.number().int().positive().optional(),
  topicId: z.coerce.number().int().positive().optional(),
  questionType: z.enum(QUESTION_TYPES).optional(),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
  isMandatory: queryBooleanSchema.optional(),
  isCaseSensitive: queryBooleanSchema.optional(),
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
export type ListOneWordQuestionsQuery = z.infer<typeof listOneWordQuestionsQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createOneWordQuestionBodySchema = z.object({
  topicId: z.number().int().positive(),
  questionType: z.enum(QUESTION_TYPES).optional(),
  code: z.string().trim().max(100).optional(),
  points: z.number().min(0).optional(),
  isCaseSensitive: z.boolean().optional(),
  isTrimWhitespace: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
  isMandatory: z.boolean().optional(),
  isActive: z.boolean().optional()
});
export type CreateOneWordQuestionBody = z.infer<typeof createOneWordQuestionBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateOneWordQuestionBodySchema = z
  .object({
    topicId: z.number().int().positive().optional(),
    questionType: z.enum(QUESTION_TYPES).optional(),
    code: z.string().trim().max(100).nullable().optional(),
    points: z.number().min(0).optional(),
    isCaseSensitive: z.boolean().optional(),
    isTrimWhitespace: z.boolean().optional(),
    displayOrder: z.number().int().min(0).optional(),
    difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
    isMandatory: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateOneWordQuestionBody = z.infer<typeof updateOneWordQuestionBodySchema>;
