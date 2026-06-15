import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Public, translation-aware content endpoints for legal policies + FAQs.
 * No auth — used by the marketing site. Base language is English (id 7); a
 * requested language_id overlays the matching translation with English fallback.
 */
const BASE_LANG = 7;

// GET /public-content/announcements?limit=
// Published, active, not-yet-expired announcements for the marketing site —
// pinned first, then newest. (June 2026: the public page used to render a
// hardcoded array; admin announcements never reached visitors.)
export async function announcementsPublic(req: Request, res: Response) {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const nowIso = new Date().toISOString();

  // Scope visibility: this public/news feed shows only 'all'-scoped announcements
  // by default, so role-targeted ones (instructors/students) don't leak to the
  // wrong audience or to anonymous visitors. Those are delivered to the right
  // users via in-app/email/push notifications (see dispatchAnnouncement). A
  // signed-in client may pass ?audience=instructors|students to also receive
  // that role's announcements on the page.
  const scopes = ['all'];
  const audience = String(req.query.audience || '').toLowerCase();
  if (audience === 'instructors' || audience === 'instructor') scopes.push('instructors');
  else if (audience === 'students' || audience === 'student') scopes.push('students');

  const { data, error: e } = await supabase
    .from('announcements')
    .select('id, title, content, announcement_type, priority, is_pinned, published_at, expires_at, target_scope')
    .eq('status', 'published')
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('target_scope', scopes)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

// GET /public-content/policy/:code?language_id=
export async function policyByCode(req: Request, res: Response) {
  const code = (req.params.code || '').toUpperCase();
  const langId = parseInt(req.query.language_id as string) || 0;

  const { data: type } = await supabase.from('policy_types')
    .select('id, code, name, slug').ilike('code', code).is('deleted_at', null).maybeSingle();
  if (!type) return ok(res, null);

  // Prefer the current published version, else the latest published.
  let { data: policy } = await supabase.from('policies').select('*')
    .eq('policy_type_id', type.id).eq('policy_status', 'published').eq('is_current', true)
    .is('deleted_at', null).order('published_at', { ascending: false }).limit(1).maybeSingle();
  if (!policy) {
    const { data: p2 } = await supabase.from('policies').select('*')
      .eq('policy_type_id', type.id).eq('policy_status', 'published')
      .is('deleted_at', null).order('published_at', { ascending: false }).limit(1).maybeSingle();
    policy = p2;
  }
  if (!policy) return ok(res, null);

  let title = policy.title;
  let content = policy.content;
  if (langId && langId !== BASE_LANG) {
    const { data: tr } = await supabase.from('policy_translations')
      .select('title, content').eq('policy_id', policy.id).eq('language_id', langId).is('deleted_at', null).maybeSingle();
    if (tr) { if (tr.title) title = tr.title; if (tr.content) content = tr.content; }
  }

  return ok(res, {
    code: type.code,
    type_name: type.name,
    slug: type.slug,
    title,
    content,
    content_format: policy.content_format || 'html',
    version: policy.version,
    effective_from: policy.effective_from,
    updated_at: policy.published_at || policy.updated_at,
    // SEO metadata set in the admin Policy editor — the legal page reads these
    // for <title>/<meta description>; previously omitted so the page fell back
    // to the default site metadata.
    meta_title: policy.meta_title || null,
    meta_description: policy.meta_description || null,
  });
}

// GET /public-content/policies  → published policy types (for index/footer)
export async function policiesIndex(_req: Request, res: Response) {
  const { data: types } = await supabase.from('policy_types')
    .select('id, code, name, slug').eq('is_active', true).is('deleted_at', null).order('display_order', { ascending: true });
  const ids = (types || []).map((t: any) => t.id);
  if (!ids.length) return ok(res, []);

  const { data: pubs } = await supabase.from('policies')
    .select('policy_type_id').eq('policy_status', 'published').is('deleted_at', null).in('policy_type_id', ids);
  const have = new Set((pubs || []).map((p: any) => p.policy_type_id));
  return ok(res, (types || []).filter((t: any) => have.has(t.id)).map((t: any) => ({ code: t.code, name: t.name, slug: t.slug })));
}

// GET /public-content/faqs?language_id=&item_type=general&item_id=
export async function faqsGrouped(req: Request, res: Response) {
  const langId = parseInt(req.query.language_id as string) || 0;
  const itemType = (req.query.item_type as string) || 'general';
  const itemId = req.query.item_id ? parseInt(req.query.item_id as string) : null;

  let q = supabase.from('faqs').select('id, question, answer, category_id, display_order')
    .eq('is_active', true).is('deleted_at', null).eq('item_type', itemType);
  if (itemId) q = q.eq('item_id', itemId);
  q = q.order('display_order', { ascending: true });

  const { data: faqs, error: e } = await q;
  if (e) return err(res, e.message, 500);
  if (!faqs || !faqs.length) return ok(res, []);

  const faqIds = faqs.map((f: any) => f.id);
  const trMap: Record<number, { question?: string; answer?: string }> = {};
  if (langId && langId !== BASE_LANG) {
    const { data: trs } = await supabase.from('faq_translations')
      .select('faq_id, question, answer').in('faq_id', faqIds).eq('language_id', langId).is('deleted_at', null);
    for (const t of (trs || []) as any[]) trMap[t.faq_id] = { question: t.question, answer: t.answer };
  }

  const catIds = [...new Set(faqs.map((f: any) => f.category_id).filter(Boolean))] as number[];
  const catName: Record<number, string> = {};
  if (catIds.length) {
    const { data: cats } = await supabase.from('faq_categories').select('id, name').in('id', catIds);
    for (const c of (cats || []) as any[]) catName[c.id] = c.name;
    if (langId && langId !== BASE_LANG) {
      const { data: ctr } = await supabase.from('faq_category_translations')
        .select('faq_category_id, name').in('faq_category_id', catIds).eq('language_id', langId).is('deleted_at', null);
      for (const c of (ctr || []) as any[]) if (c.name) catName[c.faq_category_id] = c.name;
    }
  }

  const groups: { category_id: number | null; category: string; items: any[] }[] = [];
  const idx: Record<string, number> = {};
  for (const f of faqs as any[]) {
    const key = String(f.category_id ?? 'none');
    if (!(key in idx)) {
      idx[key] = groups.length;
      groups.push({ category_id: f.category_id ?? null, category: f.category_id ? (catName[f.category_id] || 'FAQs') : 'General', items: [] });
    }
    const tr = trMap[f.id];
    groups[idx[key]].items.push({ id: f.id, question: tr?.question || f.question, answer: tr?.answer || f.answer });
  }
  return ok(res, groups);
}
