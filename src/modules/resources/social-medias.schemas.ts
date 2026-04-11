// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/social-medias router (phase 02).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const PLATFORM_TYPE_VALUES = [
  'social',
  'professional',
  'code',
  'video',
  'blog',
  'portfolio',
  'messaging',
  'website',
  'other'
] as const;

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is too short')
  .max(100, 'name is too long');

const codeSchema = z
  .string()
  .trim()
  .min(1, 'code is too short')
  .max(50, 'code is too long');

const baseUrlSchema = z
  .string()
  .trim()
  .max(500, 'base_url is too long')
  .optional();

const placeholderSchema = z
  .string()
  .trim()
  .max(100, 'placeholder is too long')
  .optional();

const platformTypeSchema = z.enum(PLATFORM_TYPE_VALUES);

// ─── Sort allowlist ──────────────────────────────────────────────

export const SOCIAL_MEDIA_SORT_COLUMNS = [
  'id',
  'name',
  'code',
  'platform_type',
  'display_order',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listSocialMediasQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),
  platformType: platformTypeSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: z.enum(SOCIAL_MEDIA_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListSocialMediasQuery = z.infer<typeof listSocialMediasQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────
//
// `iconUrl` is intentionally omitted — icons are only settable through
// the `POST /:id/icon` upload endpoint.

export const createSocialMediaBodySchema = z.object({
  name: nameSchema,
  code: codeSchema,
  baseUrl: baseUrlSchema,
  placeholder: placeholderSchema,
  platformType: platformTypeSchema.default('social'),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional()
});
export type CreateSocialMediaBody = z.infer<typeof createSocialMediaBodySchema>;

// ─── Update body ─────────────────────────────────────────────────
//
// `iconUrl` is intentionally omitted here as well.

export const updateSocialMediaBodySchema = z
  .object({
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    baseUrl: baseUrlSchema,
    placeholder: placeholderSchema,
    platformType: platformTypeSchema.optional(),
    displayOrder: z.number().int().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateSocialMediaBody = z.infer<typeof updateSocialMediaBodySchema>;
