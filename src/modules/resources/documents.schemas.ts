// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/documents router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const idSchema = z.coerce.number().int().positive();
const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is too short')
  .max(128, 'name is too long');
const descriptionSchema = z.string().trim().max(2000).optional();

// ─── Sort allowlist ──────────────────────────────────────────────

export const DOCUMENT_SORT_COLUMNS = [
  'id',
  'name',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

export const DOCUMENT_SORT_TABLES = ['document', 'document_type'] as const;

// ─── List query ──────────────────────────────────────────────────

export const listDocumentsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  documentTypeId: idSchema.optional(),
  documentTypeIsActive: queryBooleanSchema.optional(),
  documentTypeIsDeleted: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortTable: z.enum(DOCUMENT_SORT_TABLES).default('document'),
  sortColumn: z.enum(DOCUMENT_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createDocumentBodySchema = z.object({
  documentTypeId: idSchema,
  name: nameSchema,
  description: descriptionSchema,
  isActive: z.boolean().optional()
});
export type CreateDocumentBody = z.infer<typeof createDocumentBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updateDocumentBodySchema = z
  .object({
    documentTypeId: idSchema.optional(),
    name: nameSchema.optional(),
    description: descriptionSchema,
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateDocumentBody = z.infer<typeof updateDocumentBodySchema>;
