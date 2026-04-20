import { z } from 'zod';

export const VERIFICATION_STATUSES = ['pending','under_review','verified','rejected','expired','reupload'] as const;

export const createUserDocumentSchema = z.object({
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

export const updateUserDocumentSchema = createUserDocumentSchema.partial().omit({ user_id: true });
