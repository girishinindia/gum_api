import { z } from "zod";
import { multipartBool } from "../../utils/zod-helpers";

export const EMPLOYMENT_TYPES = ['full_time','part_time','contract','internship','freelance','self_employed','volunteer','apprenticeship','other'] as const;
export const WORK_MODES = ['on_site','remote','hybrid'] as const;

// Dates are ISO 'YYYY-MM-DD' strings, so a plain string compare is correct.
const endOnOrAfterStart = (d: { start_date?: string | null; end_date?: string | null }) =>
  !d.start_date || !d.end_date || d.end_date >= d.start_date;
const endOnOrAfterStartOpts = { message: 'End date must be on or after the start date', path: ['end_date'] };

const userExperienceBase = z.object({
  user_id: z.coerce.number().int().positive(),
  designation_id: z.coerce.number().int().positive().optional().nullable(),
  company_name: z.string().min(1, 'Company name is required').max(500),
  job_title: z.string().min(1, 'Job title is required').max(500),
  employment_type: z.enum(EMPLOYMENT_TYPES).optional().default('full_time'),
  department: z.string().max(300).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  work_mode: z.enum(WORK_MODES).optional().default('on_site'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional().nullable(),
  is_current_job: multipartBool().optional().default(false),
  description: z.string().max(5000).optional().nullable(),
  key_achievements: z.string().max(5000).optional().nullable(),
  skills_used: z.string().max(2000).optional().nullable(),
  salary_range: z.string().max(100).optional().nullable(),
  reference_name: z.string().max(300).optional().nullable(),
  reference_phone: z.string().max(20).optional().nullable(),
  reference_email: z.string().email().optional().nullable(),
});

export const createUserExperienceSchema = userExperienceBase.refine(endOnOrAfterStart, endOnOrAfterStartOpts);

// `.refine(...)` returns a ZodEffects which has no `.partial()`, so partial off the
// base object and re-apply the same cross-field date check to the update schema.
export const updateUserExperienceSchema = userExperienceBase
  .partial()
  .omit({ user_id: true })
  .refine(endOnOrAfterStart, endOnOrAfterStartOpts);
