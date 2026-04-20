import { z } from 'zod';

export const PROFICIENCY_LEVELS = ['beginner','elementary','intermediate','advanced','expert'] as const;

export const createUserSkillSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  skill_id: z.coerce.number().int().positive(),
  proficiency_level: z.enum(PROFICIENCY_LEVELS).optional().default('beginner'),
  years_of_experience: z.coerce.number().min(0).max(99).optional().nullable(),
  is_primary: z.coerce.boolean().optional().default(false),
  certificate_url: z.string().max(1000).optional().nullable(),
  endorsement_count: z.coerce.number().int().min(0).optional().default(0),
});

export const updateUserSkillSchema = createUserSkillSchema.partial().omit({ user_id: true });
