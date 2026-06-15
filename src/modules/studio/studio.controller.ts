import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err, paginated } from '../../utils/response';
import { processAndUploadImage } from '../../services/storage.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Instructor Studio (June 2026) — self-service content management for the
 * gum_web instructor workspace.
 *
 * WHY THIS EXISTS: the admin module endpoints are permission-guarded but
 * OWNERSHIP-BLIND (anyone with webinar:update could edit anyone's webinar).
 * Every operation here is hard-scoped to req.user.id via the owner column —
 * an instructor can only ever see/create/update/trash THEIR OWN content.
 * (Instructor courses use the separate authoring module, which already
 * self-scopes; this covers the other content types.)
 *
 * Config-driven: one handler set serves all types listed in TYPES.
 */

interface TypeConfig {
  table: string;
  ownerCol: string;                       // column holding the instructor's user id
  audit?: boolean;                        // table has created_by/updated_by columns
  fixed?: Record<string, any>;            // forced values on create (e.g. owner kind)
  allowed: string[];                      // client-writable columns
  required: string[];                     // must be present on create
  intCols?: string[];
  numCols?: string[];
  zeroCols?: string[];                     // NOT-NULL numeric cols → coerce null/blank to 0 (never null)
  freeCol?: string;                        // boolean "is free" flag → forces zeroCols to 0 when true
  boolCols?: string[];
  jsonCols?: string[];
  select?: string;                        // list select (default *)
  defaultSort?: string;
}

const TYPES: Record<string, TypeConfig> = {
  webinars: {
    table: 'webinars', ownerCol: 'instructor_id', audit: true,
    fixed: { webinar_owner: 'instructor' },
    allowed: ['title', 'course_id', 'is_free', 'price', 'scheduled_at', 'duration_minutes', 'max_attendees', 'meeting_platform', 'meeting_url', 'meeting_id', 'meeting_password', 'recording_url', 'webinar_status', 'display_order', 'is_active'],
    required: ['title'],
    intCols: ['course_id', 'duration_minutes', 'max_attendees', 'display_order'],
    numCols: ['price'], zeroCols: ['price'], freeCol: 'is_free', boolCols: ['is_free', 'is_active'],
    defaultSort: 'scheduled_at',
  },
  sessions: {
    table: 'live_sessions', ownerCol: 'instructor_id',
    allowed: ['title', 'description', 'item_type', 'item_id', 'session_status', 'scheduled_at', 'duration_minutes', 'meeting_platform', 'meeting_url', 'meeting_id', 'meeting_password', 'max_attendees', 'is_recurring', 'recurrence_rule', 'is_active'],
    required: ['title', 'scheduled_at', 'item_type', 'item_id'],
    intCols: ['item_id', 'duration_minutes', 'max_attendees'],
    boolCols: ['is_recurring', 'is_active'],
    defaultSort: 'scheduled_at',
  },
  batches: {
    table: 'course_batches', ownerCol: 'instructor_id', audit: true,
    fixed: { batch_owner: 'instructor' },
    allowed: ['title', 'course_id', 'batch_status', 'max_students', 'price', 'is_free', 'includes_course_access', 'start_date', 'end_date', 'meeting_platform', 'meeting_link', 'schedule', 'display_order', 'is_active'],
    required: ['title', 'course_id'],
    intCols: ['course_id', 'max_students', 'display_order'],
    numCols: ['price'], zeroCols: ['price'], freeCol: 'is_free', boolCols: ['is_free', 'includes_course_access', 'is_active'],
    defaultSort: 'start_date',
  },
  blog: {
    table: 'blog_posts', ownerCol: 'author_id',
    fixed: { author_type: 'instructor' },
    allowed: ['title', 'slug', 'excerpt', 'content', 'featured_image_url', 'category_id', 'status', 'published_at', 'tags', 'meta_title', 'meta_description', 'is_featured', 'is_active'],
    required: ['title', 'content'],
    intCols: ['category_id'], boolCols: ['is_featured', 'is_active'], jsonCols: ['tags'],
    defaultSort: 'created_at',
  },
  podcasts: {
    table: 'podcasts', ownerCol: 'posted_by',
    // Instructor podcasts go through the existing verify flow: created as
    // draft; status/verification stays admin-side.
    fixed: { poster_type: 'instructor', status: 'draft' },
    allowed: ['title', 'description', 'short_summary', 'youtube_url', 'thumbnail_url', 'duration_seconds', 'category_id', 'sub_category_id', 'tags', 'is_active'],
    required: ['title'],
    intCols: ['duration_seconds', 'category_id', 'sub_category_id'],
    boolCols: ['is_active'], jsonCols: ['tags'],
    defaultSort: 'created_at',
  },
  faqs: {
    table: 'faqs', ownerCol: 'author_id',
    fixed: { author_type: 'instructor' },
    allowed: ['item_type', 'item_id', 'category_id', 'question', 'answer', 'display_order', 'is_featured', 'is_active'],
    required: ['question', 'answer'],
    intCols: ['item_id', 'category_id', 'display_order'],
    boolCols: ['is_featured', 'is_active'],
    defaultSort: 'display_order',
  },
  promotions: {
    table: 'instructor_promotions', ownerCol: 'instructor_id', audit: true,
    // Instructor-created promos require admin approval before they apply
    // anywhere (public banner + checkout both check approved_at).
    fixed: { requires_approval: true, promotion_status: 'active' },
    allowed: ['promotion_name', 'promo_code', 'discount_type', 'discount_value', 'max_discount_amount', 'valid_from', 'valid_until', 'usage_limit', 'is_active'],
    required: ['promotion_name', 'promo_code', 'discount_type', 'discount_value', 'valid_from', 'valid_until'],
    numCols: ['discount_value', 'max_discount_amount'],
    intCols: ['usage_limit'], boolCols: ['is_active'],
    defaultSort: 'created_at',
  },
};

function cfgFor(req: Request): TypeConfig | null {
  return TYPES[String(req.params.type)] || null;
}

function sanitize(cfg: TypeConfig, raw: any): any {
  const b: any = {};
  for (const k of cfg.allowed) if (raw[k] !== undefined) b[k] = raw[k];
  for (const k of cfg.intCols || []) if (typeof b[k] === 'string') b[k] = b[k] === '' ? null : parseInt(b[k]) || null;
  for (const k of cfg.numCols || []) if (typeof b[k] === 'string') { const n = Number(b[k]); b[k] = (b[k] === '' || isNaN(n)) ? null : n; }
  for (const k of cfg.boolCols || []) if (typeof b[k] === 'string') b[k] = b[k] === 'true';
  for (const k of cfg.jsonCols || []) if (typeof b[k] === 'string') { try { b[k] = JSON.parse(b[k]); } catch { b[k] = null; } }
  for (const k of Object.keys(b)) if (b[k] === '') b[k] = null;
  return b;
}

/** Row must exist, be live, and belong to the caller. */
async function ownRow(cfg: TypeConfig, id: number, userId: number) {
  const { data } = await supabase.from(cfg.table).select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!data) return { error: 'Not found', status: 404 as const };
  if (Number((data as any)[cfg.ownerCol]) !== userId) return { error: 'Not found', status: 404 as const }; // never reveal others' content
  return { row: data };
}

// ── GET /studio/:type ──
export async function list(req: Request, res: Response) {
  const cfg = cfgFor(req);
  if (!cfg) return err(res, 'Unknown content type', 404);
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = (page - 1) * limit;

    const { data, count, error: e } = await supabase
      .from(cfg.table)
      .select(cfg.select || '*', { count: 'exact' })
      .eq(cfg.ownerCol, req.user!.id)
      .is('deleted_at', null)
      .order(cfg.defaultSort || 'created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── POST /studio/:type ──
export async function create(req: Request, res: Response) {
  const cfg = cfgFor(req);
  if (!cfg) return err(res, 'Unknown content type', 404);
  try {
    const body = sanitize(cfg, req.body || {});
    // NOT-NULL numeric cols (e.g. webinar/batch price): a free item or a blank
    // field must become 0, never null (the DB column rejects null).
    if (cfg.freeCol && body[cfg.freeCol] === true) for (const k of cfg.zeroCols || []) body[k] = 0;
    for (const k of cfg.zeroCols || []) if (body[k] === null || body[k] === undefined) body[k] = 0;
    for (const k of cfg.required) {
      if (body[k] === undefined || body[k] === null) return err(res, `${k} is required`, 400);
    }

    // Batch guard: the parent course must belong to this instructor.
    if (cfg.table === 'course_batches' && body.course_id) {
      const { data: course } = await supabase.from('courses').select('id, instructor_id').eq('id', body.course_id).maybeSingle();
      if (!course || Number(course.instructor_id) !== req.user!.id) return err(res, 'You can only create batches for your own courses', 400);
    }
    if (cfg.table === 'instructor_promotions' && body.promo_code) body.promo_code = String(body.promo_code).toLowerCase();
    if (cfg.table === 'faqs' && !body.item_type) body.item_type = 'general';

    const insert: any = {
      ...body,
      ...(cfg.fixed || {}),
      [cfg.ownerCol]: req.user!.id,
    };
    if (cfg.audit) insert.created_by = req.user!.id; // only tables that have the column
    const { data, error: e } = await supabase.from(cfg.table).insert(insert).select('*').single();
    if (e) return err(res, e.message, 500);
    return ok(res, data, 'Created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── PATCH /studio/:type/:id ──
export async function update(req: Request, res: Response) {
  const cfg = cfgFor(req);
  if (!cfg) return err(res, 'Unknown content type', 404);
  try {
    const id = parseInt(req.params.id);
    const own = await ownRow(cfg, id, req.user!.id);
    if ('error' in own) return err(res, own.error, own.status);

    const updates = sanitize(cfg, req.body || {});
    // Same NOT-NULL price guard as create — only touch keys actually present.
    if (cfg.freeCol && updates[cfg.freeCol] === true) for (const k of cfg.zeroCols || []) updates[k] = 0;
    for (const k of cfg.zeroCols || []) if (k in updates && updates[k] === null) updates[k] = 0;
    if (cfg.table === 'course_batches' && updates.course_id) {
      const { data: course } = await supabase.from('courses').select('id, instructor_id').eq('id', updates.course_id).maybeSingle();
      if (!course || Number(course.instructor_id) !== req.user!.id) return err(res, 'You can only attach your own courses', 400);
    }
    if (cfg.table === 'instructor_promotions' && updates.promo_code) updates.promo_code = String(updates.promo_code).toLowerCase();
    if (cfg.audit) (updates as any).updated_by = req.user!.id;
    (updates as any).updated_at = new Date().toISOString();

    const { data, error: e } = await supabase.from(cfg.table).update(updates).eq('id', id).select('*').single();
    if (e) return err(res, e.message, 500);
    return ok(res, data, 'Updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── DELETE /studio/:type/:id (soft) ──
export async function softDelete(req: Request, res: Response) {
  const cfg = cfgFor(req);
  if (!cfg) return err(res, 'Unknown content type', 404);
  try {
    const id = parseInt(req.params.id);
    const own = await ownRow(cfg, id, req.user!.id);
    if ('error' in own) return err(res, own.error, own.status);

    const patch: any = { deleted_at: new Date().toISOString(), is_active: false };
    if (cfg.audit) patch.updated_by = req.user!.id;
    const { data, error: e } = await supabase
      .from(cfg.table)
      .update(patch)
      .eq('id', id).select('id').single();
    if (e) return err(res, e.message, 500);
    return ok(res, data, 'Moved to trash');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── GET/POST /studio/promotions/:id/courses — manage the promo↔course links ──
export async function promotionCourses(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const own = await ownRow(TYPES.promotions, id, req.user!.id);
    if ('error' in own) return err(res, own.error, own.status);

    if (req.method === 'GET') {
      const { data } = await supabase.from('instructor_promotion_courses')
        .select('course_id').eq('promotion_id', id).eq('is_active', true).is('deleted_at', null);
      return ok(res, (data || []).map((r: any) => r.course_id));
    }

    // POST { course_ids: number[] } — replace links; every course must be the caller's
    const ids = Array.isArray(req.body?.course_ids) ? req.body.course_ids.map((n: any) => parseInt(n)).filter(Boolean) : [];
    if (ids.length) {
      const { data: courses } = await supabase.from('courses').select('id, instructor_id').in('id', ids);
      const bad = (courses || []).filter((c: any) => Number(c.instructor_id) !== req.user!.id);
      if (bad.length || (courses || []).length !== ids.length) return err(res, 'Promotions can only target your own courses', 400);
    }

    await supabase.from('instructor_promotion_courses')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('promotion_id', id).is('deleted_at', null);
    if (ids.length) {
      const rows = ids.map((course_id: number) => ({ promotion_id: id, course_id, is_active: true }));
      const { error: e } = await supabase.from('instructor_promotion_courses').insert(rows);
      if (e) return err(res, e.message, 500);
    }
    return ok(res, ids, 'Courses updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── GET /studio/my-courses — the caller's PUBLISHED canonical courses
//    (for batch/promotion pickers; read-only, own courses only) ──
export async function myCourses(req: Request, res: Response) {
  try {
    const { data, error: e } = await supabase
      .from('courses')
      .select('id, name, slug, price, course_status, is_active')
      .eq('instructor_id', req.user!.id)
      .is('deleted_at', null)
      .order('name');
    if (e) return err(res, e.message, 500);
    return ok(res, data || []);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── POST /studio/upload-image — upload an image to the CDN and return its URL.
//    Lets studio forms (e.g. podcast thumbnail) attach an image before the row
//    exists, instead of forcing the instructor to paste an external link. ──
export async function uploadImage(req: Request, res: Response) {
  try {
    const file = (req as any).file;
    if (!file) return err(res, 'Image file is required', 400);
    const safe = String(file.originalname || 'image').toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(0, 48);
    const path = `studio/${req.user!.id}/${Date.now()}-${safe}`;
    const url = await processAndUploadImage(file.buffer, path, { width: 1280, quality: 82 });
    return ok(res, { url }, 'Uploaded');
  } catch (e: any) {
    return err(res, e.message || 'Upload failed', 500);
  }
}
