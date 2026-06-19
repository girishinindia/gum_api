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

/** Optional pincode — digits only, 4–10 chars (PIN / ZIP). */
const optionalPincode = z.preprocess(
  blankToUndef,
  z.string().trim().regex(/^[0-9]{4,10}$/, 'Enter a valid PIN/ZIP code (4–10 digits)').optional(),
);

/** Optional phone — exactly 10 digits. */
const optionalPhone = z.preprocess(
  blankToUndef,
  z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number').optional(),
);

/**
 * Optional URL — accepts a scheme-less host (e.g. `growupmore.com`) by
 * prepending `https://` BEFORE validation, so a missing protocol no longer
 * 400s. Genuinely malformed URLs still fail with a clear error.
 */
const optionalHttpUrl = z.preprocess(
  (v) => {
    const s = v === '' || v === null ? undefined : v;
    if (typeof s !== 'string') return s;
    const t = s.trim();
    if (!t) return undefined;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  },
  z.string().url('Enter a valid URL').optional(),
);

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
  pincode:         optionalPincode,
  phone:           optionalPhone,
  email:           z.preprocess(blankToUndef, z.string().trim().email('Enter a valid email').optional()),
  website:         optionalHttpUrl,
  google_maps_url: optionalHttpUrl,
  is_active:   z.preprocess(
    (v) => (v === '' || v === null ? undefined : typeof v === 'string' ? v === 'true' : v),
    z.boolean().optional().default(true),
  ),
  sort_order:  z.preprocess(blankToUndef, z.coerce.number().int().optional().default(0)),
});

export const updateBranchSchema = createBranchSchema.partial();
