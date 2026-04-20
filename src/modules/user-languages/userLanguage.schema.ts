import { z } from 'zod';

export const LANGUAGE_PROFICIENCY = ['basic','conversational','professional','fluent','native'] as const;

export const createUserLanguageSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  language_id: z.coerce.number().int().positive(),
  proficiency_level: z.enum(LANGUAGE_PROFICIENCY).optional().default('basic'),
  can_read: z.coerce.boolean().optional().default(false),
  can_write: z.coerce.boolean().optional().default(false),
  can_speak: z.coerce.boolean().optional().default(false),
  is_primary: z.coerce.boolean().optional().default(false),
  is_native: z.coerce.boolean().optional().default(false),
});

export const updateUserLanguageSchema = createUserLanguageSchema.partial().omit({ user_id: true });
