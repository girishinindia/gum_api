import { z } from 'zod';

export const createOrderingItemTranslationBodySchema = z.object({
  orderingItemId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  itemText: z.string().trim().min(1, 'itemText is required'),
  image: z.string().url().optional(),
  isActive: z.boolean().optional()
});
export type CreateOrderingItemTranslationBody = z.infer<typeof createOrderingItemTranslationBodySchema>;

export const updateOrderingItemTranslationBodySchema = z
  .object({
    itemText: z.string().trim().min(1).optional(),
    image: z.string().url().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateOrderingItemTranslationBody = z.infer<typeof updateOrderingItemTranslationBodySchema>;
