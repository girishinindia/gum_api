// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/specializations router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Matches CHECK constraint `chk_specializations_category` in
// phase-02/10-specializations/01_table.sql verbatim — keep them in sync.

export const SPECIALIZATION_CATEGORIES = [
  'technology',
  'data',
  'design',
  'business',
  'language',
  'science',
  'mathematics',
  'arts',
  'health',
  'exam_prep',
  'professional',
  'other'
] as const;

const categorySchema = z.enum(SPECIALIZATION_CATEGORIES);

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is too short')
  .max(128, 'name is too long');

const descriptionSchema = z.string().trim().max(2000).optional();

// ─── Sort allowlist ──────────────────────────────────────────────

export const SPECIALIZATION_SORT_COLUMNS = [
  'id',
  'name',
  'category',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listSpecializationsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  category: categorySchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SPECIALIZATION_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSpecializationsQuery = z.infer<typeof listSpecializationsQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────
//
// `iconUrl` is intentionally omitted — icons are only settable through
// the `POST /:id/icon` upload endpoint (WebP + ≤100 KB + Bunny replace).

export const createSpecializationBodySchema = z.object({
  name: nameSchema,
  category: categorySchema.default('technology'),
  description: descriptionSchema,
  isActive: z.boolean().optional()
});
export type CreateSpecializationBody = z.infer<typeof createSpecializationBodySchema>;

// ─── Update body ─────────────────────────────────────────────────
//
// `iconUrl` is intentionally omitted — icons are set by uploading a
// file under the `icon` field of this same PATCH request, or cleared
// by passing `iconAction=delete`. Empty-body rejection is enforced in
// the handler, not here, so that a multipart request with only an
// icon upload still validates.

const imageActionSchema = z.enum(['delete']).optional();

export const updateSpecializationBodySchema = z.object({
  name: nameSchema.optional(),
  category: categorySchema.optional(),
  description: descriptionSchema,
  isActive: z.boolean().optional(),
  iconAction: imageActionSchema
});
export type UpdateSpecializationBody = z.infer<typeof updateSpecializationBodySchema>;
