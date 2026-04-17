import { z } from 'zod';

export const createDocumentSchema = z.object({
  document_type_id: z.number().int().positive(),
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

export const updateDocumentSchema = createDocumentSchema.partial();
