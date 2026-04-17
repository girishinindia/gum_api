import { z } from 'zod';

export const LEVEL_BANDS = ['intern', 'entry', 'mid', 'senior', 'lead', 'manager', 'director', 'executive'] as const;

export const createDesignationSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  code: z.string().max(50).trim().optional(),
  level: z.number().int().min(0).max(10).optional().default(1),
  level_band: z.enum(LEVEL_BANDS).optional().default('entry'),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateDesignationSchema = createDesignationSchema.partial();
