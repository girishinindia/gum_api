import { z } from 'zod';

export const createBranchDepartmentSchema = z.object({
  branch_id: z.number().int().positive(),
  department_id: z.number().int().positive(),
  local_head_user_id: z.number().int().positive().optional().nullable(),
  employee_capacity: z.number().int().nonnegative().optional().nullable(),
  floor_or_wing: z.string().max(500).optional().nullable(),
  extension_number: z.string().max(50).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateBranchDepartmentSchema = createBranchDepartmentSchema.partial();
