/**
 * Tiered Revenue Sharing (June 2026)
 * ──────────────────────────────────
 * The instructor/system split is resolved from `revenue_share_tiers` by the
 * instructor's DISTINCT PAID STUDENT count for that content type.
 *
 * Default slabs (seeded globally, overridable per content type and/or per
 * instructor — most specific scope wins):
 *
 *   Students            Instructor   System
 *   0–100                 60%          40%
 *   101–500               70%          30%
 *   501–5000              75%          25%
 *   5001+                 80%          20%
 *
 * Discount protection (enforced in checkout + the earning engine):
 *   • An INSTRUCTOR promo cannot exceed the instructor's share of the amount,
 *     and the SYSTEM still earns its full share of the undiscounted amount.
 *   • A SYSTEM coupon on instructor content cannot exceed the system's share,
 *     and the INSTRUCTOR still earns their full share of the undiscounted
 *     amount.
 */

import { supabase } from '../config/supabase';

export type PayableItemType = 'course' | 'bundle' | 'batch' | 'webinar';

const ITEM_TABLE: Record<PayableItemType, string> = {
  course: 'courses',
  bundle: 'bundles',
  batch: 'course_batches',
  webinar: 'webinars',
};

export interface Slab { min_students: number; max_students: number | null; instructor_share_pct: number }

export const DEFAULT_SLABS: Slab[] = [
  { min_students: 0,    max_students: 100,  instructor_share_pct: 60 },
  { min_students: 101,  max_students: 500,  instructor_share_pct: 70 },
  { min_students: 501,  max_students: 5000, instructor_share_pct: 75 },
  { min_students: 5001, max_students: null, instructor_share_pct: 80 },
];

export interface ResolvedShare {
  instructorSharePct: number;
  systemSharePct: number;
  students: number;
  scope: 'instructor+type' | 'instructor' | 'type' | 'global' | 'hardcoded';
  slab: Slab;
  slabs: Slab[];
}

/** Distinct paid students of `instructorId` for one content type. */
export async function countDistinctStudents(
  instructorId: number,
  itemType: PayableItemType,
): Promise<number> {
  const table = ITEM_TABLE[itemType];
  const { data: items } = await supabase
    .from(table)
    .select('id')
    .eq('instructor_id', instructorId)
    .is('deleted_at', null);
  const itemIds = (items || []).map((i: any) => i.id);
  if (!itemIds.length) return 0;

  const { data: enrolls } = await supabase
    .from('enrollments')
    .select('user_id')
    .eq('item_type', itemType)
    .in('item_id', itemIds)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(50000);

  return new Set((enrolls || []).map((e: any) => e.user_id)).size;
}

function pickSlab(slabs: Slab[], students: number): Slab {
  return (
    slabs.find(s => students >= s.min_students && (s.max_students == null || students <= s.max_students)) ||
    slabs[slabs.length - 1] ||
    DEFAULT_SLABS[0]
  );
}

/**
 * Resolve the share % for one (instructor, content type). Scope precedence:
 * (instructor+type) → (instructor) → (type) → global → hardcoded defaults.
 * NOTE: this REPLACES the legacy instructor_profiles.revenue_share_percentage.
 */
export async function resolveShare(
  instructorId: number,
  itemType: PayableItemType,
): Promise<ResolvedShare> {
  const students = await countDistinctStudents(instructorId, itemType);

  const { data: rows } = await supabase
    .from('revenue_share_tiers')
    .select('instructor_id, item_type, min_students, max_students, instructor_share_pct')
    .eq('is_active', true)
    .is('deleted_at', null)
    .or(`instructor_id.eq.${instructorId},instructor_id.is.null`)
    .or(`item_type.eq.${itemType},item_type.is.null`);

  const tiers = (rows || []) as any[];
  const scopes: { name: ResolvedShare['scope']; match: (t: any) => boolean }[] = [
    { name: 'instructor+type', match: t => t.instructor_id === instructorId && t.item_type === itemType },
    { name: 'instructor',      match: t => t.instructor_id === instructorId && t.item_type == null },
    { name: 'type',            match: t => t.instructor_id == null && t.item_type === itemType },
    { name: 'global',          match: t => t.instructor_id == null && t.item_type == null },
  ];

  for (const s of scopes) {
    const scoped = tiers
      .filter(s.match)
      .map(t => ({ min_students: t.min_students, max_students: t.max_students, instructor_share_pct: Number(t.instructor_share_pct) }))
      .sort((a, b) => a.min_students - b.min_students);
    if (scoped.length) {
      const slab = pickSlab(scoped, students);
      return {
        instructorSharePct: slab.instructor_share_pct,
        systemSharePct: Math.round((100 - slab.instructor_share_pct) * 100) / 100,
        students,
        scope: s.name,
        slab,
        slabs: scoped,
      };
    }
  }

  const slab = pickSlab(DEFAULT_SLABS, students);
  return {
    instructorSharePct: slab.instructor_share_pct,
    systemSharePct: 100 - slab.instructor_share_pct,
    students,
    scope: 'hardcoded',
    slab,
    slabs: DEFAULT_SLABS,
  };
}

/** Instructor for an order item (mirrors the earning service's lookup). */
export async function instructorForItem(itemType: string, itemId: number): Promise<number | null> {
  const table = ITEM_TABLE[itemType as PayableItemType];
  if (!table) return null;
  const { data } = await supabase.from(table).select('instructor_id').eq('id', itemId).maybeSingle();
  return data?.instructor_id || null;
}

/**
 * The most the SYSTEM may discount on this cart: Σ system-share of each
 * instructor-owned item's gross. ("System cannot give discount more than
 * their share amount" — coupons are capped to this.)
 */
export async function maxSystemDiscountForItems(
  orderItems: { item_type: string; item_id: number; original_price: number | string; quantity?: number | null }[],
): Promise<number> {
  let max = 0;
  const shareCache = new Map<string, number>(); // `${instructorId}:${type}` -> system pct
  for (const oi of orderItems) {
    const gross = (Number(oi.original_price) || 0) * (Number(oi.quantity) || 1);
    if (gross <= 0) continue;
    const instructorId = await instructorForItem(oi.item_type, oi.item_id);
    if (!instructorId) { max += gross; continue; } // system-owned content: system may discount fully
    const key = `${instructorId}:${oi.item_type}`;
    let systemPct = shareCache.get(key);
    if (systemPct === undefined) {
      const r = await resolveShare(instructorId, oi.item_type as PayableItemType);
      systemPct = r.systemSharePct;
      shareCache.set(key, systemPct);
    }
    max += gross * (systemPct / 100);
  }
  return Math.round(max * 100) / 100;
}
