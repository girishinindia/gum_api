import { z } from 'zod';

/**
 * String-aware boolean coercer for multipart/form-data fields.
 *
 * Why this exists
 * ───────────────
 * `z.coerce.boolean()` uses JavaScript's `Boolean(value)` to coerce. That
 * works for actual booleans but is catastrophic for strings:
 *
 *   Boolean("true")  // true   ✓
 *   Boolean("false") // true   ✗  (any non-empty string is truthy!)
 *   Boolean("")      // false  ✓
 *
 * In our app this manifested in `multipart/form-data` requests, where
 * every value arrives as a string. A user UNchecking a "Currently
 * studying" toggle would send `is_currently_studying=false` over the
 * wire; multer surfaces it as the string `"false"`; `z.coerce.boolean()`
 * then incorrectly produces `true`. The server-side invariant guard
 * downstream (Phase 35.2) then helpfully clears the user's end_date —
 * producing the exact behaviour the user reported:
 *
 *   "I uncheck Currently Studying and set an end date → on save,
 *    end date is dropped and Currently Studying stays checked."
 *
 * Use this helper anywhere a boolean field may arrive as a string —
 * specifically every Zod schema mounted on a multipart route. JSON
 * routes can keep using `z.boolean()` (or `z.coerce.boolean()`) safely
 * because JSON preserves the native type.
 *
 * Accepted values
 *   • Native: `true`, `false`
 *   • Strings (case-insensitive): "true"/"false", "1"/"0", "yes"/"no",
 *     "on"/"off". Empty string → false.
 *   • Numbers: 1 → true, 0 → false.
 *
 * Reject anything else with a clear Zod error (rather than silently
 * coercing to true like the default does).
 */
export const multipartBool = () =>
  z.preprocess((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number')  return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes' || s === 'on')  return true;
      if (s === 'false' || s === '0' || s === 'no'  || s === 'off' || s === '') return false;
    }
    return v; // leave untouched so the inner z.boolean() emits a clear error
  }, z.boolean());
