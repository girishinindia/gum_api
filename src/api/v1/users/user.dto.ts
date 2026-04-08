import { z } from 'zod';

export const updateMeDto = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80).optional()
  })
});
