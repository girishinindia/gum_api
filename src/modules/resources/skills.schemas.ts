// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/skills router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────
//
// Matches CHECK constraint `chk_skills_category` in
// phase-02/03_skills/01_table.sql verbatim — keep them in sync.

export const SKILL_CATEGORIES = [
  'technical',
  'soft_skill',
  'tool',
  'framework',
  'language',
  'domain',
  'certification',
  'other'
] as const;

const categorySchema = z.enum(SKILL_CATEGORIES);

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is too short')
  .max(128, 'name is too long');

const descriptionSchema = z.string().trim().max(2000).optional();

// ─── Sort allowlist ──────────────────────────────────────────────

export const SKILL_SORT_COLUMNS = [
  'id',
  'name',
  'category',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listSkillsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  category: categorySchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SKILL_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSkillsQuery = z.infer<typeof listSkillsQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createSkillBodySchema = z.object({
  name: nameSchema,
  category: categorySchema.default('technical'),
  description: descriptionSchema,
  isActive: z.boolean().optional()
});
export type CreateSkillBody = z.infer<typeof createSkillBodySchema>;

// ─── Update body ─────────────────────────────────────────────────
//
// `iconUrl` is intentionally omitted — icons are set by uploading a
// file under the `icon` field of this same PATCH request, or cleared
// by passing `iconAction=delete`. Empty-body rejection is enforced in
// the handler, not here, so that a multipart request with only an
// icon upload still validates.

const imageActionSchema = z.enum(['delete']).optional();

export const updateSkillBodySchema = z.object({
  name: nameSchema.optional(),
  category: categorySchema.optional(),
  description: descriptionSchema,
  isActive: z.boolean().optional(),
  iconAction: imageActionSchema
});
export type UpdateSkillBody = z.infer<typeof updateSkillBodySchema>;
