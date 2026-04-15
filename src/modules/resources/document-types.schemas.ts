// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/document-types router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is too short')
  .max(128, 'name is too long');

const descriptionSchema = z.string().trim().max(2000).optional();

// ─── Sort allowlist ──────────────────────────────────────────────

export const DOCUMENT_TYPE_SORT_COLUMNS = [
  'id',
  'name',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listDocumentTypesQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(DOCUMENT_TYPE_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListDocumentTypesQuery = z.infer<typeof listDocumentTypesQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createDocumentTypeBodySchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  isActive: z.boolean().optional()
});
export type CreateDocumentTypeBody = z.infer<typeof createDocumentTypeBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updateDocumentTypeBodySchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema,
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateDocumentTypeBody = z.infer<typeof updateDocumentTypeBodySchema>;
