import { z } from 'zod';

export const createLanguageSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  native_name: z.string().max(200).optional(),
  iso_code: z.string().max(10).optional(),
  script: z.string().max(100).optional(),
  for_material: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateLanguageSchema = createLanguageSchema.partial();
