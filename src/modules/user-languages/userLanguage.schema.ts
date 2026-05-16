import { z } from "zod";
import { multipartBool } from "../../utils/zod-helpers";

export const LANGUAGE_PROFICIENCY = ['basic','conversational','professional','fluent','native'] as const;

export const createUserLanguageSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  language_id: z.coerce.number().int().positive(),
  proficiency_level: z.enum(LANGUAGE_PROFICIENCY).optional().default('basic'),
  can_read: multipartBool().optional().default(false),
  can_write: multipartBool().optional().default(false),
  can_speak: multipartBool().optional().default(false),
  is_primary: multipartBool().optional().default(false),
  is_native: multipartBool().optional().default(false),
});

export const updateUserLanguageSchema = createUserLanguageSchema.partial().omit({ user_id: true });
