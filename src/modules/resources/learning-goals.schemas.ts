// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/learning-goals router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is too short')
  .max(100, 'name is too long');

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, 'description is too long')
  .optional();

// ─── Sort allowlist ──────────────────────────────────────────────

export const LEARNING_GOAL_SORT_COLUMNS = [
  'id',
  'name',
  'display_order',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listLearningGoalsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(LEARNING_GOAL_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListLearningGoalsQuery = z.infer<typeof listLearningGoalsQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────
//
// `iconUrl` is intentionally omitted — icons are only settable through
// the `POST /:id/icon` upload endpoint.

export const createLearningGoalBodySchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional()
});
export type CreateLearningGoalBody = z.infer<typeof createLearningGoalBodySchema>;

// ─── Update body ─────────────────────────────────────────────────
//
// `iconUrl` is intentionally omitted here as well.

export const updateLearningGoalBodySchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema,
    displayOrder: z.number().int().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateLearningGoalBody = z.infer<typeof updateLearningGoalBodySchema>;
