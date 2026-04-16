import { z } from 'zod';

export const createCountrySchema = z.object({
  name: z.string().min(1).max(100).trim(),
  iso2: z.string().length(2).toUpperCase(),
  iso3: z.string().length(3).toUpperCase(),
  phone_code: z.string().max(10).optional(),
  nationality: z.string().max(100).optional(),
  national_language: z.string().max(100).optional(),
  languages: z.array(z.string()).optional().default([]),
  tld: z.string().max(10).optional(),
  currency: z.string().max(5).optional(),
  currency_name: z.string().max(100).optional(),
  currency_symbol: z.string().max(5).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateCountrySchema = createCountrySchema.partial();
