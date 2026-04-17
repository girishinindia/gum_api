import { z } from 'zod';

export const BRANCH_TYPES = ['headquarters', 'office', 'campus', 'remote', 'warehouse', 'other'] as const;

export const createBranchSchema = z.object({
  country_id: z.number().int().positive().optional(),
  state_id: z.number().int().positive().optional(),
  city_id: z.number().int().positive().optional(),
  branch_manager_id: z.number().int().positive().optional(),
  name: z.string().min(1).max(255).trim(),
  code: z.string().max(50).trim().optional(),
  branch_type: z.enum(BRANCH_TYPES).optional().default('office'),
  address_line_1: z.string().max(255).optional(),
  address_line_2: z.string().max(255).optional(),
  pincode: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  google_maps_url: z.string().url().optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateBranchSchema = createBranchSchema.partial();
