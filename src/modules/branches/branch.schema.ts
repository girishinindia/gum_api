import { z } from 'zod';

export const BRANCH_TYPES = ['headquarters', 'office', 'campus', 'remote', 'warehouse', 'other'] as const;

/**
 * Admin/web forms send blank optional fields as `null` (or `''`), but Zod's
 * `.optional()` only permits `undefined` — so a branch with any blank field
 * used to 400 with "Validation failed". These helpers normalise blank/null to
 * `undefined` BEFORE validation, so blanks pass and genuinely bad values
 * (e.g. a malformed email) still fail with a clear field error. The controller
 * (parseBody) does the final '' → null coercion before insert.
 */
const blankToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);

/** Optional positive-int id; accepts number, numeric string, '' or null. */
const optionalId = z.preprocess(blankToUndef, z.coerce.number().int().positive().optional());

/** Optional trimmed string with a max length; '' / null → not set. */
const optionalText = (max: number) =>
  z.preprocess(blankToUndef, z.string().trim().max(max).optional());

export const createBranchSchema = z.object({
  country_id:        optionalId,
  state_id:          optionalId,
  city_id:           optionalId,
  branch_manager_id: optionalId,
  name:        z.string().trim().min(1).max(255),
  code:        optionalText(50),
  branch_type: z.preprocess(blankToUndef, z.enum(BRANCH_TYPES).optional().default('office')),
  address_line_1:  optionalText(255),
  address_line_2:  optionalText(255),
  pincode:         optionalText(20),
  phone:           optionalText(20),
  email:           z.preprocess(blankToUndef, z.string().trim().email().optional()),
  website:         z.preprocess(blankToUndef, z.string().trim().url().optional()),
  google_maps_url: z.preprocess(blankToUndef, z.string().trim().url().optional()),
  is_active:   z.preprocess(
    (v) => (v === '' || v === null ? undefined : typeof v === 'string' ? v === 'true' : v),
    z.boolean().optional().default(true),
  ),
  sort_order:  z.preprocess(blankToUndef, z.coerce.number().int().optional().default(0)),
});

export const updateBranchSchema = createBranchSchema.partial();
