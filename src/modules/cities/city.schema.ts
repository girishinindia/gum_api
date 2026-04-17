import { z } from 'zod';

export const createCitySchema = z.object({
  state_id: z.number().int().positive(),
  name: z.string().min(1).max(200).trim(),
  phonecode: z.string().max(20).optional(),
  timezone: z.string().max(100).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateCitySchema = createCitySchema.partial();
