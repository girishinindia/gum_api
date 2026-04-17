import { z } from 'zod';

export const createDepartmentSchema = z.object({
  parent_department_id: z.number().int().nullable().optional(),
  head_user_id: z.number().int().nullable().optional(),
  name: z.string().min(1).max(200).trim(),
  code: z.string().min(1).max(50).trim(),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();
