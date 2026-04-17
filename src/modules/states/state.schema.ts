import { z } from 'zod';

export const createStateSchema = z.object({
  country_id: z.number().int().positive(),
  name: z.string().min(1).max(200).trim(),
  state_code: z.string().max(10).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateStateSchema = createStateSchema.partial();
