import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

const TABLE = 'about_page';
const FIELDS = [
  'hero_eyebrow', 'hero_title', 'hero_subtitle', 'stats',
  'story_eyebrow', 'story_heading', 'story_body',
  'values_eyebrow', 'values_heading', 'values',
  'mission_title', 'mission_body', 'vision_title', 'vision_body',
  'cta_heading', 'cta_subtitle',
];

// ── GET /about-page  (PUBLIC) — single editable About record ──
export async function get(_req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', 1).maybeSingle();
  if (e) return err(res, e.message, 500);
  return ok(res, data || null);
}

// ── PUT /about-page  (admin) — upsert the single row ──
export async function update(req: Request, res: Response) {
  const body: any = req.body || {};
  const row: any = { id: 1, updated_by: req.user!.id };
  for (const k of FIELDS) if (k in body) row[k] = body[k];

  // stats / values must be JSON arrays
  if ('stats' in row && !Array.isArray(row.stats)) row.stats = [];
  if ('values' in row && !Array.isArray(row.values)) row.values = [];

  const { data, error: e } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' }).select('*').single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'About page updated');
}
