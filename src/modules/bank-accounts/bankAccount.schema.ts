import { z } from 'zod';

// Indian IFSC: 4 alpha + 0 + 6 alphanumeric
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// Indian account numbers vary by bank (6-20 digits is the broad envelope)
const ACCT_RE = /^[0-9]{6,20}$/;

export const createBankAccountSchema = z.object({
  account_holder_name: z.string().trim().min(2).max(120),
  account_number: z.string().regex(ACCT_RE, 'account_number must be 6–20 digits'),
  ifsc_code: z
    .string()
    .toUpperCase()
    .refine((v) => IFSC_RE.test(v), 'ifsc_code is invalid (expect format ABCD0XXXXXX)'),
  bank_name: z.string().max(120).optional().nullable(),
  branch_name: z.string().max(120).optional().nullable(),
  account_type: z.enum(['savings', 'current']).optional(),
  is_primary: z.boolean().optional(),
});

export const updateBankAccountSchema = z.object({
  account_holder_name: z.string().trim().min(2).max(120).optional(),
  account_number: z.string().regex(ACCT_RE).optional(),
  ifsc_code: z.string().toUpperCase().refine((v) => IFSC_RE.test(v)).optional(),
  bank_name: z.string().max(120).optional().nullable(),
  branch_name: z.string().max(120).optional().nullable(),
  account_type: z.enum(['savings', 'current']).optional(),
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
