// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/bundles (phase 09).
// Parent entity with translations child. Two owner modes:
// system (no instructor_id) and instructor (requires instructor_id).
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Constants ──────────────────────────────────────────────────

export const BUNDLE_OWNERS = ['system', 'instructor'] as const;

export const BUNDLE_SORT_COLUMNS = [
  'id',
  'code',
  'slug',
  'price',
  'display_order',
  'created_at',
  'updated_at'
] as const;

export const BUNDLE_TRANS_SORT_COLUMNS = [
  'id',
  'title',
  'created_at',
  'updated_at'
] as const;

// ─── List query ─────────────────────────────────────────────────

export const listBundlesQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  languageId: z.coerce.number().int().positive().optional(),
  bundleOwner: z.enum(BUNDLE_OWNERS).optional(),
  isFeatured: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  searchTerm: searchTermSchema,
  sortTable: z.enum(['bundle', 'translation']).default('bundle'),
  sortColumn: z.string().default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListBundlesQuery = z.infer<typeof listBundlesQuerySchema>;

// ─── Create bundle body ─────────────────────────────────────────

export const createBundleBodySchema = z.object({
  bundleOwner: z.enum(BUNDLE_OWNERS).optional(),
  instructorId: z.number().int().positive().optional(),
  code: z.string().max(100).optional(),
  slug: z.string().max(200).optional(),
  price: z.number().min(0).optional(),
  originalPrice: z.number().min(0).optional(),
  discountPercentage: z.number().min(0).max(100).optional(),
  validityDays: z.number().int().min(0).optional(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  isFeatured: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});
export type CreateBundleBody = z.infer<typeof createBundleBodySchema>;

// ─── Update bundle body ─────────────────────────────────────────

export const updateBundleBodySchema = z
  .object({
    bundleOwner: z.enum(BUNDLE_OWNERS).optional(),
    instructorId: z.number().int().positive().nullable().optional(),
    code: z.string().max(100).optional(),
    slug: z.string().max(200).optional(),
    price: z.number().min(0).optional(),
    originalPrice: z.number().min(0).optional(),
    discountPercentage: z.number().min(0).max(100).optional(),
    validityDays: z.number().int().min(0).optional(),
    startsAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    isFeatured: z.boolean().optional(),
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateBundleBody = z.infer<typeof updateBundleBodySchema>;

// ─── Create translation body ────────────────────────────────────

export const createBundleTranslationBodySchema = z.object({
  bundleId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().max(50_000).optional(),
  shortDescription: z.string().max(500).optional(),
  highlights: z.array(z.string()).optional(),
  thumbnailUrl: z.string().url().max(2000).optional(),
  bannerUrl: z.string().url().max(2000).optional(),
  tags: z.array(z.string()).optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
  metaKeywords: z.string().max(500).optional(),
  canonicalUrl: z.string().url().max(2000).optional(),
  ogSiteName: z.string().max(200).optional(),
  ogTitle: z.string().max(200).optional(),
  ogDescription: z.string().max(500).optional(),
  ogType: z.string().max(50).optional(),
  ogImage: z.string().url().max(2000).optional(),
  ogUrl: z.string().url().max(2000).optional(),
  twitterSite: z.string().max(100).optional(),
  twitterTitle: z.string().max(200).optional(),
  twitterDescription: z.string().max(500).optional(),
  twitterImage: z.string().url().max(2000).optional(),
  twitterCard: z.string().max(50).optional(),
  robotsDirective: z.string().max(100).optional(),
  focusKeyword: z.string().max(200).optional(),
  structuredData: z.any().optional(),
  isActive: z.boolean().optional()
});
export type CreateBundleTranslationBody = z.infer<typeof createBundleTranslationBodySchema>;

// ─── Update translation body ────────────────────────────────────

export const updateBundleTranslationBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(50_000).optional(),
    shortDescription: z.string().max(500).optional(),
    highlights: z.array(z.string()).optional(),
    thumbnailUrl: z.string().url().max(2000).optional(),
    bannerUrl: z.string().url().max(2000).optional(),
    tags: z.array(z.string()).optional(),
    metaTitle: z.string().max(200).optional(),
    metaDescription: z.string().max(500).optional(),
    metaKeywords: z.string().max(500).optional(),
    canonicalUrl: z.string().url().max(2000).optional(),
    ogSiteName: z.string().max(200).optional(),
    ogTitle: z.string().max(200).optional(),
    ogDescription: z.string().max(500).optional(),
    ogType: z.string().max(50).optional(),
    ogImage: z.string().url().max(2000).optional(),
    ogUrl: z.string().url().max(2000).optional(),
    twitterSite: z.string().max(100).optional(),
    twitterTitle: z.string().max(200).optional(),
    twitterDescription: z.string().max(500).optional(),
    twitterImage: z.string().url().max(2000).optional(),
    twitterCard: z.string().max(50).optional(),
    robotsDirective: z.string().max(100).optional(),
    focusKeyword: z.string().max(200).optional(),
    structuredData: z.any().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateBundleTranslationBody = z.infer<typeof updateBundleTranslationBodySchema>;
