import { z } from 'zod';

export const createCategoryTranslationSchema = z.object({
  category_id: z.number().int().positive(),
  language_id: z.number().int().positive(),
  name: z.string().min(1).max(200).trim(),
  description: z.string().optional(),
  is_new_title: z.string().optional(),
  tags: z.any().optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  meta_keywords: z.string().optional(),
  canonical_url: z.string().optional(),
  og_site_name: z.string().optional(),
  og_title: z.string().optional(),
  og_description: z.string().optional(),
  og_type: z.string().optional(),
  og_image: z.string().optional(),
  og_url: z.string().optional(),
  twitter_site: z.string().optional(),
  twitter_title: z.string().optional(),
  twitter_description: z.string().optional(),
  twitter_image: z.string().optional(),
  twitter_card: z.string().optional(),
  robots_directive: z.string().optional(),
  focus_keyword: z.string().optional(),
  structured_data: z.any().optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateCategoryTranslationSchema = createCategoryTranslationSchema.partial();
