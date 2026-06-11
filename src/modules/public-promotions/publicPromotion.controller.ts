import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /public-promotions/course/:courseId
 * Returns the best currently-active instructor promotion for a course (if any),
 * with the computed promo price. Public — used to show promo pricing on the
 * course detail page.
 */
export async function activeForCourse(req: Request, res: Response) {
  const courseId = parseInt(req.params.courseId);
  if (!courseId) return err(res, 'courseId is required', 400);

  const { data: course } = await supabase.from('courses').select('id, price, is_free').eq('id', courseId).maybeSingle();
  if (!course || course.is_free) return ok(res, null);
  const price = Number(course.price || 0);
  if (price <= 0) return ok(res, null);

  const { data: links } = await supabase.from('instructor_promotion_courses')
    .select('promotion_id').eq('course_id', courseId).eq('is_active', true).is('deleted_at', null);
  const promoIds = [...new Set((links || []).map((l: any) => Number(l.promotion_id)))];
  if (!promoIds.length) return ok(res, null);

  const { data: promos } = await supabase.from('instructor_promotions').select('*')
    .in('id', promoIds).eq('is_active', true).is('deleted_at', null);

  const now = new Date().toISOString();
  const valid = (promos || []).filter((p: any) => {
    if (p.promotion_status && !['active', 'approved', 'running'].includes(String(p.promotion_status))) return false;
    if (p.requires_approval && !p.approved_at) return false;
    if (p.valid_from && p.valid_from > now) return false;
    if (p.valid_until && p.valid_until < now) return false;
    if (p.usage_limit && (p.used_count || 0) >= p.usage_limit) return false;
    return true;
  });
  if (!valid.length) return ok(res, null);

  const discountFor = (p: any): number => {
    let d = p.discount_type === 'percentage' ? price * (Number(p.discount_value) / 100) : Number(p.discount_value);
    // max_discount_amount caps BOTH types (keep in sync with checkout applyPromo)
    if (p.max_discount_amount && d > Number(p.max_discount_amount)) d = Number(p.max_discount_amount);
    return Math.min(d, price);
  };

  let best = valid[0];
  let bestD = discountFor(valid[0]);
  for (const p of valid) { const d = discountFor(p); if (d > bestD) { best = p; bestD = d; } }

  return ok(res, {
    promotion_id: best.id,
    promotion_name: best.promotion_name,
    promo_code: best.promo_code,
    discount_type: best.discount_type,
    discount_value: best.discount_value,
    valid_until: best.valid_until,
    original_price: price,
    discount_amount: Math.round(bestD * 100) / 100,
    promo_price: Math.max(Math.round((price - bestD) * 100) / 100, 0),
  });
}
