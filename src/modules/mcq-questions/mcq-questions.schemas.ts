// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/mcq-questions (phase 10, module 01).
// Parent table: mcq_questions
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enums ──────────────────────────────────────────────────────

export const MCQ_TYPES = ['single', 'multiple', 'true_false'] as const;
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;

// ─── Sort allowlist ─────────────────────────────────────────────

export const MCQ_QUESTION_SORT_COLUMNS = [
  'id',
  'topic_id',
  'code',
  'slug',
  'points',
  'display_order',
  'difficulty_level',
  'mcq_type',
  'created_at',
  'updated_at'
] as const;

// ─── List query ─────────────────────────────────────────────────

export const listMcqQuestionsQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  mcqQuestionId: z.coerce.number().int().positive().optional(),
  languageId: z.coerce.number().int().positive().optional(),
  topicId: z.coerce.number().int().positive().optional(),
  mcqType: z.enum(MCQ_TYPES).optional(),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
  isMandatory: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  filterIsActive: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortTable: z.enum(['question', 'translation']).default('translation'),
  sortColumn: z.string().default('question_text'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListMcqQuestionsQuery = z.infer<typeof listMcqQuestionsQuerySchema>;

// ─── Create body ────────────────────────────────────────────────

export const createMcqQuestionBodySchema = z.object({
  topicId: z.number().int().positive(),
  mcqType: z.enum(MCQ_TYPES).optional(),
  code: z.string().trim().max(100).optional(),
  points: z.number().min(0).optional(),
  displayOrder: z.number().int().min(0).optional(),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
  isMandatory: z.boolean().optional(),
  isActive: z.boolean().optional()
});
export type CreateMcqQuestionBody = z.infer<typeof createMcqQuestionBodySchema>;

// ─── Update body ────────────────────────────────────────────────

export const updateMcqQuestionBodySchema = z
  .object({
    topicId: z.number().int().positive().optional(),
    mcqType: z.enum(MCQ_TYPES).optional(),
    code: z.string().trim().max(100).nullable().optional(),
    points: z.number().min(0).optional(),
    displayOrder: z.number().int().min(0).optional(),
    difficultyLevel: z.enum(DIFFICULTY_LEVELS).optional(),
    isMandatory: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateMcqQuestionBody = z.infer<typeof updateMcqQuestionBodySchema>;
