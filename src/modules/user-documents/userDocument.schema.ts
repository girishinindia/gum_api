import { z } from 'zod';

export const VERIFICATION_STATUSES = ['pending','under_review','verified','rejected','expired','reupload'] as const;

// Dates are ISO 'YYYY-MM-DD' strings, so a plain string compare is correct.
const expiryOnOrAfterIssue = (d: { issue_date?: string | null; expiry_date?: string | null }) =>
  !d.issue_date || !d.expiry_date || d.expiry_date >= d.issue_date;
const expiryOnOrAfterIssueOpts = { message: 'Expiry date must be on or after the issue date', path: ['expiry_date'] };

const userDocumentBase = z.object({
  user_id: z.coerce.number().int().positive(),
  document_type_id: z.coerce.number().int().positive(),
  document_id: z.coerce.number().int().positive().optional().nullable(),
  document_number: z.string().max(200).optional().nullable(),
  file: z.string().max(1000).optional().nullable(),
  issue_date: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  verification_status: z.enum(VERIFICATION_STATUSES).optional().default('pending'),
  rejection_reason: z.string().max(2000).optional().nullable(),
  admin_notes: z.string().max(2000).optional().nullable(),
});

export const createUserDocumentSchema = userDocumentBase.refine(expiryOnOrAfterIssue, expiryOnOrAfterIssueOpts);

// `.refine(...)` returns a ZodEffects which has no `.partial()`, so partial off the
// base object and re-apply the same cross-field date check to the update schema.
export const updateUserDocumentSchema = userDocumentBase
  .partial()
  .omit({ user_id: true })
  .refine(expiryOnOrAfterIssue, expiryOnOrAfterIssueOpts);
