import { supabase } from '../config/supabase';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface EnrichRow { item_type: string; item_id: number | null; [k: string]: any }

/**
 * Attach an `item` summary (title, slug, price, thumbnail, is_free) to
 * wishlist / enrollment / cart rows keyed by (item_type, item_id).
 * Batched: one query per content type.
 */
export async function attachItems<T extends EnrichRow>(rows: T[]): Promise<(T & { item: any })[]> {
  if (!rows.length) return rows as (T & { item: any })[];

  const byType: Record<string, number[]> = {};
  for (const r of rows) {
    if (r.item_id == null) continue;
    (byType[r.item_type] ??= []).push(Number(r.item_id));
  }

  const map: Record<string, any> = {};

  if (byType.course?.length) {
    const { data } = await supabase.from('courses')
      .select('id, name, slug, price, original_price, is_free, difficulty_level, trailer_thumbnail_url')
      .in('id', byType.course);
    for (const c of data || []) map[`course:${c.id}`] = { id: c.id, type: 'course', title: c.name, slug: c.slug, price: c.price, original_price: c.original_price, is_free: c.is_free, level: c.difficulty_level, thumbnail_url: c.trailer_thumbnail_url };
    const { data: tr } = await supabase.from('course_translations').select('course_id, short_intro, web_thumbnail').in('course_id', byType.course).eq('language_id', 7);
    for (const t of (tr || []) as any[]) { const m = map[`course:${t.course_id}`]; if (m) { m.short_description = t.short_intro; if (!m.thumbnail_url && t.web_thumbnail) m.thumbnail_url = t.web_thumbnail; } } // BUG-26: cart thumbnails
  }
  if (byType.bundle?.length) {
    const { data } = await supabase.from('bundles')
      .select('id, name, slug, price, original_price')
      .in('id', byType.bundle);
    for (const b of data || []) map[`bundle:${b.id}`] = { id: b.id, type: 'bundle', title: b.name, slug: b.slug, price: b.price, original_price: b.original_price, is_free: false };
    const { data: tr } = await supabase.from('bundle_translations').select('bundle_id, short_description').in('bundle_id', byType.bundle).eq('language_id', 7);
    for (const t of (tr || []) as any[]) { const m = map[`bundle:${t.bundle_id}`]; if (m) m.short_description = t.short_description; }
  }
  if (byType.batch?.length) {
    const { data } = await supabase.from('course_batches')
      .select('id, title, slug, price, is_free, courses(name, slug, trailer_thumbnail_url)')
      .in('id', byType.batch);
    for (const b of (data || []) as any[]) map[`batch:${b.id}`] = { id: b.id, type: 'batch', title: b.title || b.courses?.name, slug: b.slug, course_slug: b.courses?.slug, price: b.price, is_free: b.is_free, thumbnail_url: b.courses?.trailer_thumbnail_url };
  }
  if (byType.webinar?.length) {
    // BUG-01 fix (June 2026): price/original_price were never selected here, so
    // every webinar in the cart displayed ₹0 while checkout charged correctly.
    const { data } = await supabase.from('webinars')
      .select('id, title, slug, price, original_price, is_free, scheduled_at, thumbnail_url')
      .in('id', byType.webinar);
    for (const w of (data || []) as any[]) map[`webinar:${w.id}`] = { id: w.id, type: 'webinar', title: w.title, slug: w.slug, price: w.price, original_price: w.original_price, is_free: w.is_free, scheduled_at: w.scheduled_at, thumbnail_url: w.thumbnail_url };
    const { data: tr } = await supabase.from('webinar_translations').select('webinar_id, short_description').in('webinar_id', byType.webinar).eq('language_id', 7);
    for (const t of (tr || []) as any[]) { const m = map[`webinar:${t.webinar_id}`]; if (m) m.short_description = t.short_description; }
  }

  return rows.map((r) => ({ ...r, item: map[`${r.item_type}:${r.item_id}`] ?? null }));
}

/** True when the (item_type, item_id) is free (is_free flag or price ≤ 0). */
export async function isItemFree(itemType: string, itemId: number): Promise<boolean> {
  const table: Record<string, string> = { course: 'courses', bundle: 'bundles', batch: 'course_batches', webinar: 'webinars' };
  const t = table[itemType];
  if (!t) return false;
  const hasFreeCol = itemType !== 'bundle';
  const { data } = await supabase.from(t).select(hasFreeCol ? 'price, is_free' : 'price').eq('id', itemId).maybeSingle();
  if (!data) return false;
  const d = data as any;
  return (hasFreeCol && !!d.is_free) || Number(d.price ?? 0) <= 0;
}
