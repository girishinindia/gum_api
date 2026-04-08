import { z } from 'zod';

// ─── Shared Fragments ───────────────────────────────────────

const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Password must include upper, lower, and number.');

// ─── Self Profile ───────────────────────────────────────────

export const updateMeDto = z.object({
  body: z.object({
    firstName: z.string().trim().min(2).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional()
  })
});

// ─── Admin: Create ──────────────────────────────────────────

export const createUserDto = z.object({
  body: z
    .object({
      firstName: z.string().trim().min(2).max(80),
      lastName: z.string().trim().min(1).max(80),
      email: z.string().trim().email().optional(),
      mobile: z.string().trim().min(7).max(20).optional(),
      password: passwordSchema,
      countryId: z.coerce.number().int().positive().optional(),
      roleId: z.coerce.number().int().positive().optional(),
      isActive: z.boolean().optional(),
      isEmailVerified: z.boolean().optional(),
      isMobileVerified: z.boolean().optional()
    })
    .refine((data) => data.email || data.mobile, {
      message: 'At least one login method required: email or mobile.'
    })
});

// ─── Admin: Update ──────────────────────────────────────────

export const updateUserDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  }),
  body: z.object({
    firstName: z.string().trim().min(2).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().email().optional(),
    mobile: z.string().trim().min(7).max(20).optional(),
    password: passwordSchema.optional(),
    countryId: z.coerce.number().int().positive().optional(),
    isActive: z.boolean().optional(),
    isEmailVerified: z.boolean().optional(),
    isMobileVerified: z.boolean().optional()
  })
});

// ─── Params: ID ─────────────────────────────────────────────

export const userIdParamDto = z.object({
  params: z.object({
    id: z.coerce.number().int().positive()
  })
});

// ─── Query: List ────────────────────────────────────────────

export const listUsersDto = z.object({
  query: z.object({
    isActive: z.enum(['true', 'false']).optional(),
    isDeleted: z.enum(['true', 'false']).optional(),
    isEmailVerified: z.enum(['true', 'false']).optional(),
    isMobileVerified: z.enum(['true', 'false']).optional(),
    countryId: z.coerce.number().int().positive().optional(),
    countryIso2: z.string().length(2).optional(),
    nationality: z.string().min(1).optional(),
    search: z.string().min(1).optional(),
    sortBy: z.string().min(1).optional(),
    sortDir: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  })
});
