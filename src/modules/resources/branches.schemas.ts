// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/branches router (phase 03).
//
// The DB UDFs (`udf_branches_insert`, `udf_branches_update`,
// `udf_branches_delete`, `udf_branches_restore`, `udf_get_branches`)
// already do their own validation; these schemas exist so the API
// rejects bad input loudly with 400 VALIDATION_ERROR before the
// request ever reaches PostgreSQL.
//
// `udf_get_branches` joins branches → cities → states → countries
// via `uv_branches`, so the list query string exposes filters for
// all four layers.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema,
  nameSchema as sharedNameSchema
} from '../../shared/validation/common';

// Branch codes are uppercase slug-ish identifiers like 'MUM-HQ', 'PUN-01'
// — different from phase-01 codes (lowercase slug).
const branchCodeSchema = z
  .string()
  .trim()
  .min(2, 'code must be at least 2 characters')
  .max(32, 'code must be at most 32 characters')
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    'code may contain letters, digits, dot, underscore or hyphen'
  )
  .transform((v) => v.toUpperCase());

// ─── Atoms ───────────────────────────────────────────────────────

export const BRANCH_TYPES = [
  'headquarters',
  'office',
  'campus',
  'remote',
  'warehouse',
  'other'
] as const;

const branchTypeSchema = z.enum(BRANCH_TYPES);

const addressLineSchema = z.string().trim().min(2).max(255);
const pincodeSchema = z
  .string()
  .trim()
  .min(3, 'pincode is too short')
  .max(16, 'pincode is too long');

const phoneSchema = z
  .string()
  .trim()
  .min(6, 'phone is too short')
  .max(32, 'phone is too long')
  .regex(/^[0-9+\-() ]+$/, 'phone may only contain digits, +, -, parentheses and spaces');

const emailSchema = z.string().trim().toLowerCase().email().max(255);

const urlSchema = z
  .string()
  .trim()
  .url('must be a valid URL')
  .max(512);

const timezoneSchema = z
  .string()
  .trim()
  .min(3, 'timezone is too short')
  .max(64, 'timezone is too long');

// ─── Sort allowlist ──────────────────────────────────────────────

export const BRANCH_SORT_TABLES = ['branch', 'city', 'state', 'country'] as const;

export const BRANCH_SORT_COLUMNS = [
  'id',
  'name',
  'code',
  'type',
  'iso3',          // country only
  'is_active',
  'is_deleted'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listBranchesQuerySchema = paginationSchema.extend({
  // Top-level convenience (maps to the branch layer by default).
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),

  // Layer-specific flags
  branchIsActive: queryBooleanSchema.optional(),
  branchIsDeleted: queryBooleanSchema.optional(),
  cityIsActive: queryBooleanSchema.optional(),
  stateIsActive: queryBooleanSchema.optional(),
  countryIsActive: queryBooleanSchema.optional(),

  // Location filters
  countryId: bigintIdSchema.optional(),
  stateId: bigintIdSchema.optional(),
  cityId: bigintIdSchema.optional(),

  // Branch filters
  branchType: branchTypeSchema.optional(),

  searchTerm: searchTermSchema,

  sortTable: z.enum(BRANCH_SORT_TABLES).default('branch'),
  sortColumn: z.enum(BRANCH_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createBranchBodySchema = z.object({
  countryId: bigintIdSchema,
  stateId: bigintIdSchema,
  cityId: bigintIdSchema,
  name: sharedNameSchema,
  code: branchCodeSchema.optional(),
  branchType: branchTypeSchema.optional(),
  addressLine1: addressLineSchema.optional(),
  addressLine2: addressLineSchema.optional(),
  pincode: pincodeSchema.optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  website: urlSchema.optional(),
  googleMapsUrl: urlSchema.optional(),
  timezone: timezoneSchema.optional(),
  branchManagerId: bigintIdSchema.optional(),
  isActive: z.boolean().optional()
});
export type CreateBranchBody = z.infer<typeof createBranchBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updateBranchBodySchema = z
  .object({
    countryId: bigintIdSchema.optional(),
    stateId: bigintIdSchema.optional(),
    cityId: bigintIdSchema.optional(),
    name: sharedNameSchema.optional(),
    code: branchCodeSchema.optional(),
    branchType: branchTypeSchema.optional(),
    addressLine1: addressLineSchema.optional(),
    addressLine2: addressLineSchema.optional(),
    pincode: pincodeSchema.optional(),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    website: urlSchema.optional(),
    googleMapsUrl: urlSchema.optional(),
    timezone: timezoneSchema.optional(),
    branchManagerId: bigintIdSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateBranchBody = z.infer<typeof updateBranchBodySchema>;
