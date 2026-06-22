import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

const TABLE = 'home_page';
const ARRAY_FIELDS = ['hero_stats', 'stats_tiles', 'hiw_steps', 'features'];
const FIELDS = [
  'hero_title', 'hero_highlight', 'hero_subtitle',
  'hero_primary_label', 'hero_primary_href', 'hero_secondary_label', 'hero_secondary_href',
  'hero_stats', 'stats_tiles',
  'hiw_eyebrow', 'hiw_heading', 'hiw_subtitle', 'hiw_steps',
  'feat_eyebrow', 'feat_heading', 'feat_subtitle', 'features',
  'nl_eyebrow', 'nl_heading', 'nl_subtitle', 'nl_whatsapp_url', 'nl_telegram_url',
  'app_eyebrow', 'app_heading', 'app_subtitle', 'app_playstore_url', 'app_appstore_url',
  'cta_heading', 'cta_subtitle', 'cta_primary_label', 'cta_primary_href', 'cta_secondary_label', 'cta_secondary_href',
];

// ── GET /home-page  (PUBLIC) ──
export async function get(_req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', 1).maybeSingle();
  if (e) return err(res, e.message, 500);
  return ok(res, data || null);
}

// ── PUT /home-page  (admin) — upsert the single row ──
export async function update(req: Request, res: Response) {
  const body: any = req.body || {};
  const row: any = { id: 1, updated_by: req.user!.id };
  for (const k of FIELDS) if (k in body) row[k] = body[k];
  for (const k of ARRAY_FIELDS) if (k in row && !Array.isArray(row[k])) row[k] = [];

  const { data, error: e } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' }).select('*').single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Homepage updated');
}
