import { z } from 'zod';

export const createSubjectTranslationSchema = z.object({
  subject_id: z.number().int().positive(),
  language_id: z.number().int().positive(),
  name: z.string().min(1).max(200).trim(),
  short_intro: z.string().optional(),
  long_intro: z.string().optional(),
  image: z.string().optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateSubjectTranslationSchema = createSubjectTranslationSchema.partial();
