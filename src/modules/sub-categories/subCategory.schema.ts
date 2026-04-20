import { z } from 'zod';

export const createSubCategorySchema = z.object({
  category_id: z.number().int().positive(),
  name: z.string().min(1).max(200).trim(),
  code: z.string().min(1).max(100).trim(),
  slug: z.string().min(1).max(200).trim(),
  display_order: z.number().int().optional().default(0),
  is_new: z.boolean().optional().default(false),
  new_until: z.string().optional(),
  // Language-neutral SEO defaults
  og_site_name: z.string().optional(),
  og_type: z.string().optional(),
  twitter_site: z.string().optional(),
  twitter_card: z.string().optional(),
  robots_directive: z.string().optional(),
  is_active: z.boolean().optional().default(true),
});

export const updateSubCategorySchema = createSubCategorySchema.partial();
