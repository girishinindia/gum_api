import { z } from 'zod';

export const PLATFORM_TYPES = ['social', 'professional', 'code', 'video', 'blog', 'portfolio', 'messaging', 'website', 'other'] as const;

export const createSocialMediaSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  code: z.string().min(1).max(50).trim(),
  base_url: z.string().max(500).optional(),
  placeholder: z.string().max(500).optional(),
  platform_type: z.enum(PLATFORM_TYPES).optional().default('social'),
  display_order: z.number().int().optional().default(0),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateSocialMediaSchema = createSocialMediaSchema.partial();
