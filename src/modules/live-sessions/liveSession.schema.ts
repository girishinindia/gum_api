import { z } from 'zod';

/** Blank / null → "not provided" so optional fields don't fail validation. */
const blankToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);

/**
 * Live-session validation. The controller accepts a broad set of columns, so
 * we use `.passthrough()` to enforce ONLY the fields we care about while every
 * other field flows through untouched. The key rule: `meeting_url`, when
 * provided, must be a real URL — random text like "d7nXjhqhq" is rejected.
 */
export const liveSessionSchema = z
  .object({
    meeting_url: z.preprocess(
      blankToUndef,
      z.string().trim().url('Meeting URL must be a valid link (e.g. https://meet.google.com/…)').optional(),
    ),
  })
  .passthrough();
