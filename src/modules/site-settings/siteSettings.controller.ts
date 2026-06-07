import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

const TABLE = 'site_section_settings';

// ── PUBLIC: section visibility map ──
// Returns { courses: true, blogs: false, ... } for the frontend.
// No auth required — the frontend fetches this on every SSR/ISR pass.
export async function listSections(_req: Request, res: Response) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('section_key, is_visible')
    .order('display_order');

  if (error) return err(res, error.message, 500);

  const map: Record<string, boolean> = {};
  for (const row of data || []) {
    map[row.section_key] = row.is_visible;
  }
  return ok(res, map);
}

// ── ADMIN: full list for the admin portal ──
// Returns all rows with every column so the admin UI can render toggle cards.
export async function listAll(_req: Request, res: Response) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('display_order');

  if (error) return err(res, error.message, 500);
  return ok(res, data);
}

// ── ADMIN: toggle a section's visibility ──
// PATCH /site-settings/:id  body: { is_visible: boolean }
export async function updateSection(req: Request, res: Response) {
  const { id } = req.params;
  const { is_visible } = req.body;

  if (typeof is_visible !== 'boolean') {
    return err(res, 'is_visible must be a boolean', 400);
  }

  const userId = (req as any).user?.id ?? null;

  const { data, error } = await supabase
    .from(TABLE)
    .update({ is_visible, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
    .select()
    .single();

  if (error) return err(res, error.message, 500);
  if (!data) return err(res, 'Section not found', 404);

  return ok(res, data);
}
