/**
 * Phase 44.5 — Shared body-coercion helpers.
 *
 * These replace the copy-pasted `parseFloat(body[k]) || null` idiom that
 * lives in dozens of controllers' `parseBody()` functions. That idiom has a
 * subtle falsy-zero bug:
 *
 *     parseFloat("0") = 0          // a perfectly valid number
 *     0 || null       = null       // …but JS treats 0 as falsy
 *
 * Result: any legitimate zero submitted from a multipart/form-data request
 * (price for a free course, display_order = 0, discount = 0, refund_days = 0,
 * a count column…) gets silently nulled before the INSERT/UPDATE. For
 * nullable columns the symptom is hidden (zero becomes null and life goes
 * on); for NOT NULL columns like `courses.price` it surfaces as a 500:
 *
 *     null value in column "price" of relation "courses"
 *     violates not-null constraint
 *
 * The trigger for finding this: editing a free course and uploading a new
 * trailer thumbnail / brochure / video — Bunny actually succeeded, but the
 * DB write that should have persisted the new URLs failed because price
 * came in as "0" and got nulled.
 *
 * These helpers use `Number.isFinite()` so 0 is preserved and only truly
 * invalid input (empty string, non-numeric strings, null, undefined, NaN)
 * collapses to null.
 */

/** Coerce a multipart string (or anything) to a finite number, else null. */
export function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return null;
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce to a finite integer (base-10), else null. Preserves 0. */
export function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return null;
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce common boolean shapes from a multipart form. */
export function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    return t === 'true' || t === '1' || t === 'yes' || t === 'on';
  }
  return false;
}

/**
 * Apply `toIntOrNull` to every listed key on `body` in place, but only when
 * the value is currently a string (mirroring the original guard so already-
 * coerced numbers from JSON requests are left untouched).
 */
export function coerceIntFields(body: any, keys: readonly string[]): void {
  for (const k of keys) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
}

/** Apply `toNumOrNull` to every listed key on `body` in place (string-only). */
export function coerceNumFields(body: any, keys: readonly string[]): void {
  for (const k of keys) {
    if (typeof body[k] === 'string') body[k] = toNumOrNull(body[k]);
  }
}

/** Apply `toBool` to every listed key on `body` in place (string-only). */
export function coerceBoolFields(body: any, keys: readonly string[]): void {
  for (const k of keys) {
    if (typeof body[k] === 'string') body[k] = toBool(body[k]);
  }
}
