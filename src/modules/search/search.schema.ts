import { z } from 'zod';

/**
 * Phase 11.5.3 — Search query schema.
 *
 * Used for both GET /search/courses and GET /search/instructors. The
 * `q` term is sanitised at the controller level before going to the RPC.
 */
export const searchQuerySchema = z.object({
  q:      z.string().trim().min(2, 'q must be at least 2 chars').max(80, 'q must be at most 80 chars'),
  limit:  z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1).max(50)).optional(),
  offset: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(0).max(1000)).optional(),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
