import { z } from 'zod';
import { multipartBool } from '../../utils/zod-helpers';

// Defence in depth — even if the coerceNullStrings middleware is missed on
// a future route, a "null" / "" date value would still be rejected here
// rather than reaching Postgres. ISO YYYY-MM-DD only.
const nullableIsoDate = z.preprocess(
  (v) => (v === '' || v === 'null' ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').nullable().optional(),
);

// Enum fields receive "null" the same way — coerce before the enum check
// so that "clearing" a previously-set grade_type doesn't 400 the request.
const nullableEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (v === '' || v === 'null' ? null : v),
    z.enum(values).nullable().optional(),
  );

// Dates are ISO 'YYYY-MM-DD' strings, so a plain string compare is correct.
const endOnOrAfterStart = (d: { start_date?: string | null; end_date?: string | null }) =>
  !d.start_date || !d.end_date || d.end_date >= d.start_date;
const endOnOrAfterStartOpts = { message: 'End date must be on or after the start date', path: ['end_date'] };

const userEducationBase = z.object({
  user_id: z.coerce.number().int().positive(),
  education_level_id: z.coerce.number().int().positive(),
  institution_name: z.string().min(1, 'Institution name is required').max(500),
  board_or_university: z.string().max(500).optional().nullable(),
  field_of_study: z.string().max(500).optional().nullable(),
  specialization: z.string().max(500).optional().nullable(),
  grade_or_percentage: z.string().max(100).optional().nullable(),
  grade_type: nullableEnum(['percentage', 'cgpa', 'gpa', 'grade', 'pass_fail', 'other']),
  start_date: nullableIsoDate,
  end_date: nullableIsoDate,
  // Phase 37.1 — `z.coerce.boolean()` is broken for the string "false"
  // (Boolean("false") === true). multipartBool() correctly handles both
  // native booleans and the stringified-from-multipart forms.
  is_currently_studying: multipartBool().optional().default(false),
  is_highest_qualification: multipartBool().optional().default(false),
  description: z.string().max(2000).optional().nullable(),
});

export const createUserEducationSchema = userEducationBase.refine(endOnOrAfterStart, endOnOrAfterStartOpts);

// `.refine(...)` returns a ZodEffects which has no `.partial()`, so partial off the
// base object and re-apply the same cross-field date check to the update schema.
export const updateUserEducationSchema = userEducationBase
  .partial()
  .omit({ user_id: true })
  .refine(endOnOrAfterStart, endOnOrAfterStartOpts);
