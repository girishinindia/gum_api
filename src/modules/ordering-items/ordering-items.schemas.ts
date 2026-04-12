import { z } from 'zod';

export const createOrderingItemBodySchema = z.object({
  orderingQuestionId: z.number().int().positive(),
  correctPosition: z.number().int().min(1),
  isActive: z.boolean().optional()
});
export type CreateOrderingItemBody = z.infer<typeof createOrderingItemBodySchema>;

export const updateOrderingItemBodySchema = z
  .object({
    correctPosition: z.number().int().min(1).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateOrderingItemBody = z.infer<typeof updateOrderingItemBodySchema>;
