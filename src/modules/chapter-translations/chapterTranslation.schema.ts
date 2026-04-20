import { z } from 'zod';

export const createChapterTranslationSchema = z.object({
  chapter_id: z.number().int().positive(),
  language_id: z.number().int().positive(),
  name: z.string().min(1).max(200).trim(),
  short_intro: z.string().optional(),
  long_intro: z.string().optional(),
  prerequisites: z.string().optional(),
  learning_objectives: z.string().optional(),
  image: z.string().optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateChapterTranslationSchema = createChapterTranslationSchema.partial();
