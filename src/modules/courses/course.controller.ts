import { Request, Response } from 'express';
import { promises as fsp } from 'fs';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { deleteImage, processAndUploadImage, uploadRawFile } from '../../services/storage.service';
import { uploadVideoToStream, uploadVideoStreamFromPath, deleteVideoFromStream, extractBunnyVideoGuid, pingBunnyStream } from '../../services/video.service';
import { signEmbedUrl } from '../../services/bunnyToken.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { applySearch, applyTranslatedSearch, SEARCH_CONFIGS } from '../../utils/search';
import { coerceIntFields, coerceNumFields } from '../../utils/coerce';

/**
 * Phase 44.10 Probe B — admin-only diagnostic that reports whether the API
 * can actually reach Bunny Stream with its configured credentials, plus the
 * configured library id and a masked key prefix. Lets us settle the "is
 * Bunny Stream configured correctly" question without reading the .env.
 * Open GET /api/v1/courses/_debug/bunny-stream in the browser (logged in)
 * and read the JSON. REMOVE after the video bug is resolved.
 */
export async function debugBunnyStream(_req: Request, res: Response) {
  const key = config.bunny.streamApiKey || '';
  const ping = await pingBunnyStream();
  return ok(res, {
    ping,
    config: {
      streamLibraryId: config.bunny.streamLibraryId || '(EMPTY)',
      streamApiKey: key ? `${key.slice(0, 4)}…${key.slice(-2)} (set, len=${key.length})` : '(EMPTY)',
      streamCdn: config.bunny.streamCdn || '(empty)',
    },
  }, 'Bunny Stream diagnostic');
}

/**
 * Phase 45.1 — signed playback URLs for a course's videos.
 *
 * The Bunny Stream library is locked with Player Token Authentication
 * (Phase 0.1), so the raw embed URL stored in courses.video_url /
 * trailer_video_url returns HTTP 403 when opened directly. This admin-only
 * endpoint extracts each video's GUID and returns a short-lived signed embed
 * URL (token + expires) that actually plays. The signing key is a server
 * secret, so this must happen on the API — the portal can't sign on its own.
 *
 * GET /courses/:id/playback  → { video, trailer } each {url, expiresAt} | null
 */
export async function coursePlayback(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: course } = await supabase
    .from('courses')
    .select('id, video_url, trailer_video_url')
    .eq('id', id)
    .single();
  if (!course) return err(res, 'Course not found', 404);

  const signOne = (url: string | null) => {
    const guid = extractBunnyVideoGuid(url);
    if (!guid) return null;
    try {
      const s = signEmbedUrl(guid);
      return { url: s.embedUrl, expiresAt: s.expiresAt };
    } catch (e: any) {
      console.error('[course.playback] sign failed:', e?.message);
      return null;
    }
  };

  return ok(res, {
    video: signOne((course as any).video_url),
    trailer: signOne((course as any).trailer_video_url),
  }, 'Signed playback URLs');
}

/**
 * Phase 6 (June 2026) — PUBLIC trailer playback for the marketing site.
 * Returns a short-lived signed embed URL for the course trailer only, and
 * only for active published courses (never leaks drafts/coming-soon media).
 *
 * GET /courses/:id/trailer-playback → { trailer: {url, expiresAt} | null }
 */
export async function courseTrailerPlayback(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return err(res, 'Invalid course id', 400);

  const { data: course } = await supabase
    .from('courses')
    .select('id, trailer_video_url, course_status, is_active')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!course || !(course as any).is_active || (course as any).course_status !== 'published') {
    return err(res, 'Course not found', 404);
  }

  const guid = extractBunnyVideoGuid((course as any).trailer_video_url);
  if (!guid) return ok(res, { trailer: null }, 'No trailer available');

  try {
    const s = signEmbedUrl(guid);
    return ok(res, { trailer: { url: s.embedUrl, expiresAt: s.expiresAt } }, 'Signed trailer URL');
  } catch (e: any) {
    console.error('[course.trailerPlayback] sign failed:', e?.message);
    return ok(res, { trailer: null }, 'No trailer available');
  }
}

/**
 * Phase 44.11 — dedicated course video upload, mirroring the WORKING
 * sub-topic pattern (memory buffer + uploadVideoToStream). The combined
 * course-save multipart used uploadVideoStreamFromPath (Readable.toWeb +
 * duplex:'half'), which silently failed on this Node build — hence
 * video_url being NULL on every course. This buffer PUT is the same call
 * sub-topics use successfully against the same Bunny Stream library.
 *
 * Generic helper shared by both the trailer and main course video routes.
 */
async function handleCourseVideoUpload(
  req: Request,
  res: Response,
  column: 'video_url' | 'trailer_video_url',
  titleSuffix: string,
) {
  const id = parseInt(req.params.id);
  const { data: course } = await supabase
    .from('courses')
    .select('id, slug, code, name, video_url, trailer_video_url')
    .eq('id', id)
    .single();
  if (!course) return err(res, 'Course not found', 404);

  if (!req.file) return err(res, 'No video file provided', 400);

  try {
    // Delete the previously-uploaded Bunny video on this column (if ours).
    const oldUrl = (course as any)[column] as string | null;
    const oldGuid = extractBunnyVideoGuid(oldUrl);
    if (oldGuid) {
      try { await deleteVideoFromStream(oldGuid); } catch {}
    }

    const slugHint = course.slug || course.code || `course-${id}`;
    const title = `${slugHint} — ${titleSuffix}`;
    // Buffer PUT — the proven path. req.file.buffer comes from memoryStorage.
    const result = await uploadVideoToStream(req.file.buffer, title);

    const { data, error: e } = await supabase
      .from('courses')
      .update({ [column]: result.embedUrl, updated_by: req.user!.id })
      .eq('id', id)
      .select()
      .single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'course_video_uploaded', targetType: 'course', targetId: id, targetName: course.code || course.slug, changes: { [column]: { old: oldUrl, new: result.embedUrl } }, ip: getClientIp(req) });
    return ok(res, data, 'Video uploaded successfully');
  } catch (e: any) {
    console.error(`[course.${column}] upload failed:`, e);
    return err(res, e.message || 'Video upload failed', 500);
  }
}

// POST /courses/:id/upload-video — main course video
export async function uploadCourseVideo(req: Request, res: Response) {
  return handleCourseVideoUpload(req, res, 'video_url', 'course');
}

// POST /courses/:id/upload-trailer-video — trailer video
export async function uploadCourseTrailerVideo(req: Request, res: Response) {
  return handleCourseVideoUpload(req, res, 'trailer_video_url', 'trailer');
}

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

/**
 * Best-effort delete of a Bunny Stream video the platform owns.
 * Returns silently for external URLs (YouTube/Vimeo) so they're untouched.
 */
async function maybeDeleteBunnyStreamVideo(url: string | null | undefined): Promise<void> {
  const guid = extractBunnyVideoGuid(url);
  if (!guid) return;
  try { await deleteVideoFromStream(guid); } catch {}
}

interface OldMedia {
  trailer_thumbnail_url?: string | null;
  brochure_url?:          string | null;
  trailer_video_url?:     string | null;
  video_url?:             string | null;
}

type MediaUploadResult = Partial<{
  trailer_thumbnail_url: string;
  brochure_url:          string;
  trailer_video_url:     string;
  video_url:             string;
}>;

/**
 * Phase 15.4 + 15.5 — Handle the four media-tab uploads (trailer thumbnail
 * image + brochure PDF + trailer video + main course video) coming in via
 * multer.fields() with disk storage. Returns the columns to merge into the
 * row. When updating, pass `old` so the previous CDN files / Bunny Stream
 * videos are purged before the new ones replace them.
 *
 * Small files (thumb/brochure) are read into a buffer; videos are streamed
 * straight from disk into Bunny Stream so multi-GB uploads never hit the
 * Node heap.
 */
async function handleCourseMediaUploads(
  req: Request,
  slugHint: string,
  old?: OldMedia,
): Promise<MediaUploadResult> {
  const files = (req.files as { [field: string]: Express.Multer.File[] } | undefined) ?? {};
  const out: MediaUploadResult = {};

  // Phase 44.10 Probe A — log exactly which media fields multer parsed, with
  // each file's size, BEFORE any branching. This is the missing ground truth:
  // it proves whether the video bytes actually reach the server in the same
  // multipart request that carries the (working) thumbnail/brochure.
  const fieldSummary: Record<string, string> = {};
  for (const k of ['trailer_thumbnail', 'brochure', 'trailer_video', 'video']) {
    const f = (files as any)[k]?.[0];
    fieldSummary[k] = f ? `1 (${(f.size / 1024 / 1024).toFixed(2)} MB, ${f.originalname})` : '0';
  }
  // eslint-disable-next-line no-console
  console.log('[course.media] received fields =', JSON.stringify(fieldSummary), '| contentType =', req.headers['content-type']?.slice(0, 60));

  const thumb = files.trailer_thumbnail?.[0];
  if (thumb) {
    if (old?.trailer_thumbnail_url) {
      try { await deleteImage(extractBunnyPath(old.trailer_thumbnail_url), old.trailer_thumbnail_url); } catch {}
    }
    const path = `courses/${slugHint}/trailer-thumb-${Date.now()}.webp`;
    const buf = await fsp.readFile(thumb.path);
    out.trailer_thumbnail_url = await processAndUploadImage(buf, path, { width: 1280, height: 720, quality: 85 });
    fsp.unlink(thumb.path).catch(() => {});
  }

  const brochure = files.brochure?.[0];
  if (brochure) {
    if (old?.brochure_url) {
      try { await deleteImage(extractBunnyPath(old.brochure_url), old.brochure_url); } catch {}
    }
    const ext = (brochure.originalname.match(/\.[^.]+$/)?.[0] ?? '.pdf').toLowerCase();
    const path = `courses/${slugHint}/brochure-${Date.now()}${ext}`;
    const buf = await fsp.readFile(brochure.path);
    out.brochure_url = await uploadRawFile(buf, path);
    fsp.unlink(brochure.path).catch(() => {});
  }

  // Phase 15.5 — Bunny Stream uploads (multi-GB safe via streaming).
  const trailerVideo = files.trailer_video?.[0];
  if (trailerVideo) {
    await maybeDeleteBunnyStreamVideo(old?.trailer_video_url);
    const title = `${slugHint} — trailer`;
    const { embedUrl } = await uploadVideoStreamFromPath(trailerVideo.path, title);
    out.trailer_video_url = embedUrl;
    // uploadVideoStreamFromPath unlinks the temp file in its `finally`.
  }

  const courseVideo = files.video?.[0];
  if (courseVideo) {
    await maybeDeleteBunnyStreamVideo(old?.video_url);
    const title = `${slugHint} — course`;
    const { embedUrl } = await uploadVideoStreamFromPath(courseVideo.path, title);
    out.video_url = embedUrl;
  }

  return out;
}

const CACHE_KEY = 'courses:all';
const clearCache = () => redis.del(CACHE_KEY);

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  for (const k of ['is_active', 'is_free', 'is_new', 'is_featured', 'is_bestseller', 'has_placement_assistance', 'has_certificate']) {
    if (typeof body[k] === 'string') body[k] = body[k] === 'true';
  }
  // Phase 44.5 — Integer fields. Use the shared coerce helper so a legit
  // `0` is preserved instead of being collapsed to null by the old
  // `parseInt(x) || null` idiom.
  coerceIntFields(body, ['max_students', 'refund_days', 'enrollment_count', 'rating_count', 'view_count', 'total_lessons', 'total_assignments', 'total_projects', 'instructor_id', 'course_language_id']);
  // Phase 44.5 — Numeric fields. Same falsy-zero bug — `price = 0` for a
  // free course used to become null and trip the NOT NULL constraint on
  // `courses.price`, which also rolled back the freshly-uploaded media URLs.
  coerceNumFields(body, ['price', 'original_price', 'discount_percentage', 'duration_hours', 'rating_average']);
  // Nullify empty strings on the remaining text fields.
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('courses').select('*', { count: 'exact' });

  if (search) q = (await applyTranslatedSearch(q, supabase, {
    search,
    base: ['code', 'slug', 'name'],
    translation: { table: 'course_translations', fk: 'course_id', cols: ['title'] },
    includeDeleted: req.query.show_deleted === 'true',
  })).query;

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters — public list defaults to active + published. Override with
  // is_active=false, course_status=<x>, course_status=all, or include_unpublished=true.
  // BUG-14 fix (June 2026): the TRASH view must never apply the public
  // active+published defaults — trashed courses are usually draft/inactive,
  // so the trash list showed empty while the count said 2.
  const showUnpublished = req.query.course_status === 'all' || req.query.include_unpublished === 'true'
    || req.query.show_deleted === 'true';
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  else if (!showUnpublished) q = q.eq('is_active', true);

  // Difficulty level — supports single value or comma-separated list
  if (req.query.difficulty_level) {
    const levels = (req.query.difficulty_level as string).split(',').filter(Boolean);
    if (levels.length === 1) q = q.eq('difficulty_level', levels[0]);
    else if (levels.length > 1) q = q.in('difficulty_level', levels);
  }
  if (req.query.course_status && req.query.course_status !== 'all') {
    q = q.eq('course_status', req.query.course_status as string);
  } else if (!showUnpublished) {
    q = q.eq('course_status', 'published');
  }
  if (req.query.is_free === 'true') q = q.eq('is_free', true);
  if (req.query.is_featured === 'true') q = q.eq('is_featured', true);

  // ── Extended filters (Phase 1 — filter page support) ──────────────
  // S9 — multi-value language filter: "1,2,3" → .in(), single value → .eq()
  if (req.query.course_language_id) {
    const langIds = (req.query.course_language_id as string).split(',').map(Number).filter(Boolean);
    if (langIds.length === 1) q = q.eq('course_language_id', langIds[0]);
    else if (langIds.length > 1) q = q.in('course_language_id', langIds);
  }
  if (req.query.instructor_id)     q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
  if (req.query.is_bestseller === 'true')    q = q.eq('is_bestseller', true);
  if (req.query.is_new === 'true')           q = q.eq('is_new', true);
  if (req.query.has_certificate === 'true')  q = q.eq('has_certificate', true);

  // Price range
  if (req.query.price_min) q = q.gte('price', parseFloat(req.query.price_min as string));
  if (req.query.price_max) q = q.lte('price', parseFloat(req.query.price_max as string));

  // Minimum rating filter
  if (req.query.rating_min) q = q.gte('rating_average', parseFloat(req.query.rating_min as string));

  // Category / sub-category filter — supports single ID or comma-separated list
  const catIds = req.query.category_id
    ? (req.query.category_id as string).split(',').map(Number).filter((n) => !isNaN(n))
    : [];
  const subCatIds = req.query.sub_category_id
    ? (req.query.sub_category_id as string).split(',').map(Number).filter((n) => !isNaN(n))
    : [];
  if (catIds.length > 0 || subCatIds.length > 0) {
    // Look up course_sub_categories to find matching course IDs
    let jq = supabase.from('course_sub_categories')
      .select('course_id, sub_categories!inner(category_id)')
      .is('deleted_at', null)
      .eq('is_active', true);
    if (subCatIds.length === 1) jq = jq.eq('sub_category_id', subCatIds[0]);
    else if (subCatIds.length > 1) jq = jq.in('sub_category_id', subCatIds);
    if (catIds.length > 0 && subCatIds.length === 0) {
      if (catIds.length === 1) jq = (jq as any).eq('sub_categories.category_id', catIds[0]);
      else jq = (jq as any).in('sub_categories.category_id', catIds);
    }
    // Raise PostgREST's default 1000-row cap so large categories aren't silently
    // truncated (which would drop courses from BOTH the results and the count).
    jq = jq.range(0, 99999);
    const { data: junctionRows } = await jq;
    const matchedCourseIds = [...new Set((junctionRows || []).map((r: any) => r.course_id))];
    if (matchedCourseIds.length === 0) {
      // No courses match this category/sub-category — return empty
      return paginated(res, [], 0, page, limit);
    }
    q = q.in('id', matchedCourseIds);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Fetch English translation titles
  const courseIds = (data || []).map((c: any) => c.id);
  const isTrash = req.query.show_deleted === 'true';
  let englishTitleMap: Record<number, string> = {};
  if (courseIds.length > 0) {
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (enLang) {
      let enQ = supabase.from('course_translations').select('course_id, title').in('course_id', courseIds).eq('language_id', enLang.id);
      if (!isTrash) enQ = enQ.is('deleted_at', null);
      const { data: enTranslations } = await enQ;
      if (enTranslations) {
        for (const t of enTranslations) englishTitleMap[t.course_id] = t.title;
      }
    }
  }

  // Fetch translated title + description + thumbnail for the requested language
  let translatedTitleMap: Record<number, string> = {};
  let translatedDescMap: Record<number, string> = {};
  let translatedThumbMap: Record<number, string> = {};
  if (req.query.language_id && courseIds.length > 0) {
    const langId = parseInt(req.query.language_id as string);
    if (langId) {
      let tQ = supabase
        .from('course_translations')
        .select('course_id, title, short_intro, web_thumbnail')
        .in('course_id', courseIds)
        .eq('language_id', langId);
      if (!isTrash) tQ = tQ.is('deleted_at', null);
      const { data: translations } = await tQ;
      if (translations) {
        for (const t of translations) {
          if (t.title) translatedTitleMap[t.course_id] = t.title;
          if (t.short_intro) translatedDescMap[t.course_id] = t.short_intro;
          if (t.web_thumbnail) translatedThumbMap[t.course_id] = t.web_thumbnail;
        }
      }
    }
  }

  // Fallback: for courses where trailer_thumbnail_url is null AND
  // the language-specific translation didn't have web_thumbnail,
  // fetch any available web_thumbnail from translations
  const missingThumbCourseIds = courseIds.filter((id: number) => {
    const course = (data || []).find((c: any) => c.id === id);
    return !translatedThumbMap[id] && !(course && course.trailer_thumbnail_url);
  });
  if (missingThumbCourseIds.length > 0) {
    let fbQ = supabase
      .from('course_translations')
      .select('course_id, web_thumbnail')
      .in('course_id', missingThumbCourseIds)
      .not('web_thumbnail', 'is', null);
    if (!isTrash) fbQ = fbQ.is('deleted_at', null);
    const { data: fbTrans } = await fbQ;
    if (fbTrans) {
      for (const t of fbTrans) {
        if (t.web_thumbnail && !translatedThumbMap[t.course_id]) {
          translatedThumbMap[t.course_id] = t.web_thumbnail;
        }
      }
    }
  }

  // Fetch instructor names
  const instructorIds = [...new Set((data || []).filter((c: any) => c.instructor_id).map((c: any) => c.instructor_id))];
  let instructorMap: Record<number, string> = {};
  if (instructorIds.length > 0) {
    const { data: instructors } = await supabase.from('users').select('id, full_name').in('id', instructorIds);
    if (instructors) {
      for (const i of instructors) instructorMap[i.id] = i.full_name;
    }
  }

  // Fetch language names
  const langIds = [...new Set((data || []).filter((c: any) => c.course_language_id).map((c: any) => c.course_language_id))];
  let langMap: Record<number, string> = {};
  if (langIds.length > 0) {
    const { data: langs } = await supabase.from('languages').select('id, name').in('id', langIds);
    if (langs) {
      for (const l of langs) langMap[l.id] = l.name;
    }
  }

  // Fetch primary category + sub-category for each course (filter page enrichment)
  let categoryMap: Record<number, { category_name: string; sub_category_name: string; category_id: number; sub_category_id: number } | null> = {};
  if (courseIds.length > 0) {
    const { data: cscRows } = await supabase
      .from('course_sub_categories')
      .select('course_id, sub_category_id, sub_categories(id, slug, category_id, categories:category_id(id, name))')
      .in('course_id', courseIds)
      .eq('is_primary', true)
      .eq('is_active', true)
      .is('deleted_at', null);
    if (cscRows) {
      // Also fetch sub-category English names from translations
      const scIds = [...new Set(cscRows.map((r: any) => r.sub_category_id))];
      let scNameMap: Record<number, string> = {};
      if (scIds.length > 0) {
        const { data: enLangRow } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
        if (enLangRow) {
          const { data: scTrans } = await supabase
            .from('sub_category_translations')
            .select('sub_category_id, name')
            .in('sub_category_id', scIds)
            .eq('language_id', enLangRow.id)
            .is('deleted_at', null);
          if (scTrans) {
            for (const t of scTrans) scNameMap[t.sub_category_id] = t.name;
          }
        }
      }
      for (const r of cscRows) {
        const sc = r.sub_categories as any;
        const cat = sc?.categories as any;
        categoryMap[r.course_id] = {
          category_id: cat?.id || sc?.category_id || 0,
          category_name: cat?.name || '',
          sub_category_id: r.sub_category_id,
          sub_category_name: scNameMap[r.sub_category_id] || sc?.slug || '',
        };
      }
    }
  }

  const enriched = (data || []).map((c: any) => ({
    ...c,
    english_title: englishTitleMap[c.id] || null,
    translated_title: translatedTitleMap[c.id] || null,
    translated_description: translatedDescMap[c.id] || null,
    translated_thumbnail: translatedThumbMap[c.id] || null,
    instructor_name: c.instructor_id ? instructorMap[c.instructor_id] || null : null,
    language_name: c.course_language_id ? langMap[c.course_language_id] || null : null,
    category_name: categoryMap[c.id]?.category_name || null,
    sub_category_name: categoryMap[c.id]?.sub_category_name || null,
    category_id: categoryMap[c.id]?.category_id || null,
    sub_category_id: categoryMap[c.id]?.sub_category_id || null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

// ── S9: GET /courses/languages — languages that have at least one published course ──
export async function courseLanguages(_req: Request, res: Response) {
  // Get distinct course_language_id values from published courses
  const { data: courses, error: e1 } = await supabase
    .from('courses')
    .select('course_language_id')
    .eq('course_status', 'published')
    .not('course_language_id', 'is', null);
  if (e1) return err(res, e1.message, 500);

  const langIds = [...new Set((courses || []).map((c: any) => c.course_language_id))];
  if (langIds.length === 0) return ok(res, []);

  const { data: langs, error: e2 } = await supabase
    .from('languages')
    .select('id, name, native_name, iso_code')
    .in('id', langIds)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (e2) return err(res, e2.message, 500);

  return ok(res, langs || []);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('courses').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Course not found', 404);

  // Live stats — the stored *_count columns on `courses` are stale/unmaintained,
  // so compute them on read (admin Course Details modal shows these).
  const courseId = data.id;
  const [enr, asm, cap] = await Promise.all([
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('item_type', 'course').eq('item_id', courseId).is('deleted_at', null),
    supabase.from('assessments').select('id', { count: 'exact', head: true }).eq('course_id', courseId).is('deleted_at', null),
    supabase.from('assesment_capstone_projects').select('id', { count: 'exact', head: true }).eq('course_id', courseId).is('deleted_at', null),
  ]);

  // Walk the curriculum tree for lesson (sub_topic) count + chapter ids (mini-projects).
  let totalLessons = 0;
  let miniCount = 0;
  const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', courseId).eq('is_active', true).is('deleted_at', null);
  const moduleIds = (modules || []).map((m: any) => m.id);
  if (moduleIds.length) {
    const { data: cms } = await supabase.from('course_module_subjects').select('id').eq('course_id', courseId).in('course_module_id', moduleIds).eq('is_active', true).is('deleted_at', null);
    const cmsIds = (cms || []).map((s: any) => s.id);
    let ccIds: number[] = [];
    let chapterIds: number[] = [];
    if (cmsIds.length) {
      const { data: cc } = await supabase.from('course_chapters').select('id, chapter_id').eq('course_id', courseId).in('course_module_subject_id', cmsIds).eq('is_active', true).is('deleted_at', null);
      ccIds = (cc || []).map((c: any) => c.id);
      chapterIds = [...new Set((cc || []).map((c: any) => c.chapter_id))];
    }
    if (ccIds.length) {
      const { data: cct } = await supabase.from('course_chapter_topics').select('topic_id').eq('course_id', courseId).in('course_chapter_id', ccIds).eq('is_active', true).is('deleted_at', null);
      const topicIds = [...new Set((cct || []).map((t: any) => t.topic_id))];
      if (topicIds.length) {
        const { count: stCount } = await supabase.from('sub_topics').select('id', { count: 'exact', head: true }).in('topic_id', topicIds).eq('is_active', true);
        totalLessons = stCount || 0;
      }
    }
    if (chapterIds.length) {
      const { count: mp } = await supabase.from('assesment_mini_projects').select('id', { count: 'exact', head: true }).in('chapter_id', chapterIds).is('deleted_at', null);
      miniCount = mp || 0;
    }
  }

  return ok(res, {
    ...data,
    enrollment_count: enr.count || 0,
    total_lessons: totalLessons,
    total_assignments: asm.count || 0,
    total_projects: (cap.count || 0) + miniCount,
  });
}

/**
 * Public detail endpoint — returns a full course by slug with:
 *   • full translation row (for requested language, fallback to English id=7)
 *   • instructor profile (name, avatar, bio)
 *   • full curriculum tree (modules → chapters → topics → sub-topics)
 *   • FAQs for this course (from polymorphic faqs table)
 *   • published reviews with reviewer info + star breakdown
 *   • course language name + native_name
 *   • category info
 *   • related courses (from future_courses JSONB or same-category fallback)
 *
 * GET /courses/by-slug/:slug?language_id=7
 */
export async function getBySlug(req: Request, res: Response) {
  const slug = req.params.slug;
  const langId = req.query.language_id ? parseInt(req.query.language_id as string) : 7;

  // 1. Fetch the course row
  const { data: course, error: e1 } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single();
  if (e1 || !course) return err(res, 'Course not found', 404);

  // 2. Fetch translation — prefer requested language, fallback to English (id=7)
  let translation: any = null;
  {
    const { data: t } = await supabase
      .from('course_translations')
      .select('*')
      .eq('course_id', course.id)
      .eq('language_id', langId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();
    translation = t;
  }
  if (!translation && langId !== 7) {
    const { data: t } = await supabase
      .from('course_translations')
      .select('*')
      .eq('course_id', course.id)
      .eq('language_id', 7)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();
    translation = t;
  }

  // 3. Fetch instructor profile
  let instructor: any = null;
  if (course.instructor_id) {
    const { data: u } = await supabase
      .from('users')
      .select('id, full_name, email, profile_image_url')
      .eq('id', course.instructor_id)
      .single();
    instructor = u;
    if (u) {
      const { data: ip } = await supabase
        .from('instructor_profiles')
        .select('designation, bio, expertise, linkedin_url, website_url, total_students, total_courses, years_experience, rating_average')
        .eq('user_id', u.id)
        .is('deleted_at', null)
        .single();
      if (ip) instructor = { ...instructor, ...ip };
    }
  }

  // 4. Fetch full curriculum tree (modules → chapters → topics → sub-topics)
  //    DB hierarchy: course_modules → course_module_subjects → course_chapters
  //    → chapters → course_chapter_topics → topics → sub_topics
  let curriculum: any[] = [];
  let curriculumCounts = { modules: 0, chapters: 0, topics: 0, subtopics: 0 };
  {
    const { data: modules } = await supabase
      .from('course_modules')
      .select('id, name, display_order')
      .eq('course_id', course.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    if (modules && modules.length > 0) {
      const moduleIds = modules.map((m: any) => m.id);

      // Module → subject junctions
      const { data: cms } = await supabase
        .from('course_module_subjects')
        .select('id, course_module_id, subject_id')
        .eq('course_id', course.id)
        .in('course_module_id', moduleIds)
        .eq('is_active', true)
        .is('deleted_at', null);
      const cmsIds = (cms || []).map((s: any) => s.id);

      // Chapter junctions (course_chapters → chapters entity)
      let courseChapters: any[] = [];
      if (cmsIds.length > 0) {
        const { data: cc } = await supabase
          .from('course_chapters')
          .select('id, course_module_subject_id, chapter_id')
          .eq('course_id', course.id)
          .in('course_module_subject_id', cmsIds)
          .eq('is_active', true)
          .is('deleted_at', null);
        courseChapters = cc || [];
      }
      const ccIds = courseChapters.map((c: any) => c.id);
      const chapterIds = [...new Set(courseChapters.map((c: any) => c.chapter_id))];

      // Fetch chapter entity data
      const chapterMap: Record<number, any> = {};
      if (chapterIds.length > 0) {
        const { data: chRows } = await supabase
          .from('chapters')
          .select('id, name, display_order')
          .in('id', chapterIds)
          .eq('is_active', true);
        if (chRows) for (const ch of chRows) chapterMap[ch.id] = ch;
      }

      // Topic junctions (course_chapter_topics → topics entity)
      let courseChapterTopics: any[] = [];
      if (ccIds.length > 0) {
        const { data: cct } = await supabase
          .from('course_chapter_topics')
          .select('id, course_chapter_id, topic_id')
          .eq('course_id', course.id)
          .in('course_chapter_id', ccIds)
          .eq('is_active', true)
          .is('deleted_at', null);
        courseChapterTopics = cct || [];
      }
      const topicIds = [...new Set(courseChapterTopics.map((t: any) => t.topic_id))];

      // Fetch topic entity data
      const topicMap: Record<number, any> = {};
      if (topicIds.length > 0) {
        const { data: tRows } = await supabase
          .from('topics')
          .select('id, name, display_order')
          .in('id', topicIds)
          .eq('is_active', true);
        if (tRows) for (const t of tRows) topicMap[t.id] = t;
      }

      // Sub-topics (direct FK on topic_id)
      const subtopicsByTopic: Record<number, any[]> = {};
      if (topicIds.length > 0) {
        const { data: stRows } = await supabase
          .from('sub_topics')
          .select('id, topic_id, name, display_order, estimated_minutes')
          .in('topic_id', topicIds)
          .eq('is_active', true)
          .order('display_order', { ascending: true });
        if (stRows) {
          for (const st of stRows) {
            if (!subtopicsByTopic[st.topic_id]) subtopicsByTopic[st.topic_id] = [];
            subtopicsByTopic[st.topic_id].push({ id: st.id, name: st.name, estimated_minutes: st.estimated_minutes });
          }
        }
      }

      // Build lookup maps for tree assembly
      const topicsByCC: Record<number, number[]> = {};
      for (const cct of courseChapterTopics) {
        if (!topicsByCC[cct.course_chapter_id]) topicsByCC[cct.course_chapter_id] = [];
        topicsByCC[cct.course_chapter_id].push(cct.topic_id);
      }
      const ccToChapterId: Record<number, number> = {};
      for (const cc of courseChapters) ccToChapterId[cc.id] = cc.chapter_id;
      const chaptersByCMS: Record<number, number[]> = {};
      for (const cc of courseChapters) {
        if (!chaptersByCMS[cc.course_module_subject_id]) chaptersByCMS[cc.course_module_subject_id] = [];
        chaptersByCMS[cc.course_module_subject_id].push(cc.id);
      }
      const cmsByModule: Record<number, number[]> = {};
      for (const s of (cms || [])) {
        if (!cmsByModule[s.course_module_id]) cmsByModule[s.course_module_id] = [];
        cmsByModule[s.course_module_id].push(s.id);
      }

      // Assemble the 4-level tree
      let totalChapters = 0, totalTopics = 0, totalSubtopics = 0;
      curriculum = modules.map((mod: any) => {
        const modCmsIds = cmsByModule[mod.id] || [];
        const modChapters: any[] = [];
        for (const cmsId of modCmsIds) {
          const ccIdsForCms = chaptersByCMS[cmsId] || [];
          for (const ccId of ccIdsForCms) {
            const chapterId = ccToChapterId[ccId];
            const chapter = chapterMap[chapterId];
            if (!chapter) continue;
            const topicIdsForCC = topicsByCC[ccId] || [];
            const chTopics = topicIdsForCC
              .map((tid: number) => {
                const topic = topicMap[tid];
                if (!topic) return null;
                const subs = subtopicsByTopic[tid] || [];
                totalSubtopics += subs.length;
                return { id: topic.id, name: topic.name, display_order: topic.display_order, subtopic_count: subs.length, sub_topics: subs };
              })
              .filter(Boolean)
              .sort((a: any, b: any) => a.display_order - b.display_order);
            totalTopics += chTopics.length;
            modChapters.push({
              id: chapter.id, name: chapter.name, display_order: chapter.display_order,
              topic_count: chTopics.length,
              subtopic_count: chTopics.reduce((s: number, t: any) => s + (t?.subtopic_count || 0), 0),
              topics: chTopics,
            });
          }
        }
        modChapters.sort((a: any, b: any) => a.display_order - b.display_order);
        totalChapters += modChapters.length;
        return {
          id: mod.id, name: mod.name, display_order: mod.display_order,
          chapter_count: modChapters.length,
          topic_count: modChapters.reduce((s: number, c: any) => s + c.topic_count, 0),
          subtopic_count: modChapters.reduce((s: number, c: any) => s + c.subtopic_count, 0),
          chapters: modChapters,
        };
      });
      curriculumCounts = { modules: modules.length, chapters: totalChapters, topics: totalTopics, subtopics: totalSubtopics };
    }
  }

  // 5. Fetch FAQs (polymorphic: item_type='course')
  const { data: faqs } = await supabase
    .from('faqs')
    .select('id, question, answer, display_order')
    .eq('item_type', 'course')
    .eq('item_id', course.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // 6. Fetch reviews + compute star breakdown
  const { data: reviewRows } = await supabase
    .from('reviews')
    .select('id, user_id, rating, title, review_text, is_verified_purchase, helpful_count, created_at')
    .eq('item_type', 'course')
    .eq('item_id', course.id)
    .eq('status', 'published')
    .eq('is_active', true)
    .is('deleted_at', null) // BUG-09 fix: trashed reviews keep status=published — they were still embedded here
    .order('created_at', { ascending: false });

  let reviews: any[] = [];
  const reviewSummary: { average: number; total: number; breakdown: Record<number, number> } = {
    average: 0, total: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  };
  if (reviewRows && reviewRows.length > 0) {
    const userIds = [...new Set(reviewRows.map((r: any) => r.user_id))];
    const reviewerMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, full_name, display_name, first_name, last_name, avatar_url').in('id', userIds);
      if (users) for (const u of users) reviewerMap[u.id] = u;
    }
    // BUG-66: registered users populate first_name/last_name (not always full_name);
    // resolve the real name consistently with /public-reviews instead of 'Anonymous'.
    const reviewerName = (u: any): string =>
      (u?.full_name && u.full_name.trim())
      || (u?.display_name && u.display_name.trim())
      || [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim()
      || 'User';
    reviews = reviewRows.map((r: any) => ({
      ...r,
      reviewer_name: reviewerName(reviewerMap[r.user_id]),
      reviewer_image: reviewerMap[r.user_id]?.avatar_url || null,
    }));
    let ratingSum = 0;
    for (const r of reviewRows) {
      ratingSum += r.rating;
      const star = Math.min(5, Math.max(1, r.rating));
      reviewSummary.breakdown[star]++;
    }
    reviewSummary.total = reviewRows.length;
    reviewSummary.average = parseFloat((ratingSum / reviewRows.length).toFixed(1));
  }

  // 7. Fetch course language name + native_name
  let languageName: string | null = null;
  let languageNativeName: string | null = null;
  if (course.course_language_id) {
    const { data: lang } = await supabase
      .from('languages')
      .select('name, native_name')
      .eq('id', course.course_language_id)
      .single();
    if (lang) {
      languageName = lang.name;
      languageNativeName = lang.native_name || null;
    }
  }

  // 8. Fetch primary category + sub-category
  let category: any = null;
  {
    const { data: cscRows } = await supabase
      .from('course_sub_categories')
      .select('sub_category_id, sub_categories(id, slug, category_id, categories:category_id(id, name))')
      .eq('course_id', course.id)
      .eq('is_primary', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1);
    if (cscRows && cscRows.length > 0) {
      const r = cscRows[0] as any;
      const sc = r.sub_categories;
      const cat = sc?.categories;
      let scName = sc?.slug || '';
      const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
      if (enLang) {
        const { data: scTrans } = await supabase
          .from('sub_category_translations')
          .select('name')
          .eq('sub_category_id', r.sub_category_id)
          .eq('language_id', enLang.id)
          .is('deleted_at', null)
          .single();
        if (scTrans?.name) scName = scTrans.name;
      }
      category = {
        category_id: cat?.id || sc?.category_id || null,
        category_name: cat?.name || null,
        sub_category_id: r.sub_category_id,
        sub_category_name: scName,
      };
    }
  }

  // 9. Fetch related courses (from future_courses JSONB or same-category fallback)
  let relatedCourses: any[] = [];
  {
    if (translation?.future_courses && Array.isArray(translation.future_courses)) {
      const names = translation.future_courses
        .map((c: any) => (typeof c === 'string' ? c : c?.label || c?.title || c?.text || ''))
        .filter(Boolean);
      if (names.length > 0) {
        const { data: related } = await supabase
          .from('courses')
          .select('id, slug, name, price, original_price, is_free, rating_average, trailer_thumbnail_url, difficulty_level')
          .in('name', names)
          .eq('is_active', true)
          .is('deleted_at', null)
          .neq('id', course.id)
          .limit(4);
        if (related && related.length > 0) relatedCourses = related;
      }
    }
    // Fallback: same sub-category courses
    if (relatedCourses.length === 0 && category?.sub_category_id) {
      const { data: sameCatJunctions } = await supabase
        .from('course_sub_categories')
        .select('course_id')
        .eq('sub_category_id', category.sub_category_id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .neq('course_id', course.id)
        .limit(4);
      if (sameCatJunctions && sameCatJunctions.length > 0) {
        const relIds = sameCatJunctions.map((r: any) => r.course_id);
        const { data: related } = await supabase
          .from('courses')
          .select('id, slug, name, price, original_price, is_free, rating_average, trailer_thumbnail_url, difficulty_level')
          .in('id', relIds)
          .eq('is_active', true)
          .is('deleted_at', null)
          .limit(4);
        if (related) relatedCourses = related;
      }
    }
    // Enrich related courses with translated title + thumbnail + description
    if (relatedCourses.length > 0) {
      const relIds = relatedCourses.map((c: any) => c.id);

      // Translation enrichment
      const { data: relTrans } = await supabase
        .from('course_translations')
        .select('course_id, title, web_thumbnail, short_intro')
        .in('course_id', relIds)
        .eq('language_id', langId)
        .eq('is_active', true)
        .is('deleted_at', null);
      const transMap: Record<number, any> = {};
      if (relTrans) for (const t of relTrans) transMap[t.course_id] = t;

      // Module count per course
      const { data: relModules } = await supabase
        .from('course_modules')
        .select('course_id, module_id')
        .in('course_id', relIds)
        .eq('is_active', true)
        .is('deleted_at', null);
      const modCountMap: Record<number, number> = {};
      if (relModules) {
        for (const m of relModules) {
          modCountMap[m.course_id] = (modCountMap[m.course_id] || 0) + 1;
        }
      }

      // Category name for related courses (same category as parent course)
      const catName = category?.category_name || '';

      relatedCourses = relatedCourses.map((c: any) => ({
        ...c,
        translated_title: transMap[c.id]?.title || null,
        translated_thumbnail: transMap[c.id]?.web_thumbnail || null,
        short_description: transMap[c.id]?.short_intro || null,
        module_count: modCountMap[c.id] || 0,
        category_name: catName,
      }));
    }
  }

  // 10. Assemble response
  return ok(res, {
    ...course,
    translation: translation || null,
    instructor: instructor || null,
    chapters: [],
    curriculum,
    curriculum_counts: curriculumCounts,
    faqs: faqs || [],
    reviews,
    review_summary: reviewSummary,
    related_courses: relatedCourses,
    language_name: languageName,
    language_native_name: languageNativeName,
    category: category || null,
  });
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (body.is_active === false && !hasPermission(req, 'course', 'activate')) {
    return err(res, 'Permission denied: course:activate required to create inactive', 403);
  }

  body.created_by = req.user!.id;

  // Auto-generate slug
  if (!body.slug && (body.code || body.name)) {
    body.slug = await generateUniqueSlug(supabase, 'courses', body.code || body.name);
  } else if (body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'courses', body.slug);
  }

  // Phase 15.4 — Media-tab uploads (thumbnail image + brochure PDF).
  // Phase 44.6 — surface upload errors as a structured response so the admin
  // sees the real Bunny error (missing key, 403 from token-locked library,
  // network failure…) instead of a generic 500 with no detail. Without this
  // wrapper the controller crashes async and the toast just says "Failed".
  let mediaUploads;
  try {
    mediaUploads = await handleCourseMediaUploads(req, body.slug || body.code || 'course');
  } catch (uploadErr: any) {
    console.error('[course.create] media upload failed:', uploadErr);
    return err(res, `Media upload failed: ${uploadErr?.message || 'unknown error'}`, 502);
  }
  Object.assign(body, mediaUploads);

  const { data, error: e } = await supabase.from('courses').insert(body).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Course code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  // Sync English translation
  if (body.name) {
    await supabase.from('course_translations').upsert({
      course_id: data.id,
      language_id: 7,
      title: body.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'course_id,language_id' });
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_created', targetType: 'course', targetId: data.id, targetName: data.code || data.slug, ip: getClientIp(req) });
  return ok(res, data, 'Course created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('courses').select('*').eq('id', id).single();
  if (!old) return err(res, 'Course not found', 404);

  const updates = parseBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'course', 'activate')) {
      return err(res, 'Permission denied: course:activate required to change active status', 403);
    }
  }

  updates.updated_by = req.user!.id;

  // Phase 15.4 + 15.5 — Media-tab uploads (delete-on-replace handled inside helper).
  // Phase 44.6 — surface upload errors as a structured response instead of
  // letting the rejection bubble up as a generic 500 with no body. Lets the
  // admin see "Bunny Stream create failed: 401 invalid AccessKey" in the
  // toast, which is the actionable signal we were missing for video uploads.
  let mediaUploads;
  try {
    mediaUploads = await handleCourseMediaUploads(
      req,
      updates.slug || old.slug || old.code || `course-${id}`,
      {
        trailer_thumbnail_url: old.trailer_thumbnail_url,
        brochure_url:          old.brochure_url,
        trailer_video_url:     old.trailer_video_url,
        video_url:             old.video_url,
      },
    );
  } catch (uploadErr: any) {
    console.error('[course.update] media upload failed:', uploadErr);
    return err(res, `Media upload failed: ${uploadErr?.message || 'unknown error'}`, 502);
  }
  Object.assign(updates, mediaUploads);

  const hasFiles = Object.keys(mediaUploads).length > 0;
  if (Object.keys(updates).filter((k) => k !== 'updated_by').length === 0 && !hasFiles) {
    return err(res, 'Nothing to update', 400);
  }

  const { data, error: e } = await supabase.from('courses').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Course code or slug already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  // Sync English translation
  if (updates.name) {
    await supabase.from('course_translations').upsert({
      course_id: id,
      language_id: 7,
      title: updates.name,
      is_active: true,
      created_by: req.user!.id,
    }, { onConflict: 'course_id,language_id' });
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_updated', targetType: 'course', targetId: id, targetName: data.code || data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'Course updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('courses').select('code, slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Course not found', 404);
  if (old.deleted_at) return err(res, 'Course is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('courses')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete: bottom-up (leaves first, then parents)
  // 1. course_chapter_topics
  await supabase.from('course_chapter_topics').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 2. course_chapters
  await supabase.from('course_chapters').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 3. course_module_subjects
  await supabase.from('course_module_subjects').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 4. course_module_translations (via module IDs)
  const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', id);
  if (modules && modules.length > 0) {
    const moduleIds = modules.map(m => m.id);
    await supabase.from('course_module_translations').update({ deleted_at: now, is_active: false }).in('course_module_id', moduleIds).is('deleted_at', null);
  }
  // 5. course_modules
  await supabase.from('course_modules').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 6. course_sub_categories
  await supabase.from('course_sub_categories').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);
  // 7. course_translations
  await supabase.from('course_translations').update({ deleted_at: now, is_active: false }).eq('course_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_soft_deleted', targetType: 'course', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Course moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('courses').select('code, slug, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Course not found', 404);
  if (!old.deleted_at) return err(res, 'Course is not in trash', 400);

  // Block restore if the course's sub-category is itself in trash — restoring a
  // course under a trashed sub-category would resurrect an orphaned link.
  const { data: scLinks } = await supabase.from('course_sub_categories').select('sub_category_id').eq('course_id', id);
  const subCategoryIds = [...new Set((scLinks || []).map((l: any) => l.sub_category_id))] as number[];
  if (subCategoryIds.length > 0) {
    const { data: trashedSubCats } = await supabase.from('sub_categories').select('id').in('id', subCategoryIds).not('deleted_at', 'is', null);
    if (trashedSubCats && trashedSubCats.length > 0) {
      return err(res, 'Cannot restore: its sub-category is in trash. Restore the sub-category first.', 400);
    }
  }

  const { data, error: e } = await supabase
    .from('courses')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore: top-down (parents first, then children)
  // 1. course_translations
  await supabase.from('course_translations').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 2. course_sub_categories
  await supabase.from('course_sub_categories').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 3. course_modules
  await supabase.from('course_modules').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 4. course_module_translations (via module IDs)
  const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', id);
  if (modules && modules.length > 0) {
    const moduleIds = modules.map(m => m.id);
    await supabase.from('course_module_translations').update({ deleted_at: null, is_active: true }).in('course_module_id', moduleIds).not('deleted_at', 'is', null);
  }
  // 5. course_module_subjects
  await supabase.from('course_module_subjects').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 6. course_chapters
  await supabase.from('course_chapters').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);
  // 7. course_chapter_topics
  await supabase.from('course_chapter_topics').update({ deleted_at: null, is_active: true }).eq('course_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'course_restored', targetType: 'course', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Course restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  try {
    const { data: old } = await supabase.from('courses').select('code, slug, trailer_thumbnail_url, brochure_url, trailer_video_url, video_url').eq('id', id).single();
    if (!old) return err(res, 'Course not found', 404);

    // Phase 15.4 — clean up the course-level CDN files (thumbnail + brochure).
    if (old.trailer_thumbnail_url) {
      try { await deleteImage(extractBunnyPath(old.trailer_thumbnail_url), old.trailer_thumbnail_url); } catch {}
    }
    if (old.brochure_url) {
      try { await deleteImage(extractBunnyPath(old.brochure_url), old.brochure_url); } catch {}
    }
    // Phase 15.5 — clean up Bunny Stream videos (only ours; external URLs left alone).
    await maybeDeleteBunnyStreamVideo(old.trailer_video_url);
    await maybeDeleteBunnyStreamVideo(old.video_url);

    // Cascade permanent delete: bottom-up to satisfy FK constraints
    // 1. Delete course_chapter_topics (leaf)
    await supabase.from('course_chapter_topics').delete().eq('course_id', id);
    // 2. Delete course_chapters
    await supabase.from('course_chapters').delete().eq('course_id', id);
    // 3. Delete course_module_subjects
    await supabase.from('course_module_subjects').delete().eq('course_id', id);

    // 4. Delete course_module_translations with CDN cleanup
    const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', id);
    if (modules && modules.length > 0) {
      const moduleIds = modules.map(m => m.id);
      const { data: modTranslations } = await supabase.from('course_module_translations').select('id, image').in('course_module_id', moduleIds);
      if (modTranslations) {
        for (const t of modTranslations) {
          if (t.image) { try { await deleteImage(extractBunnyPath(t.image), t.image); } catch {} }
        }
        await supabase.from('course_module_translations').delete().in('course_module_id', moduleIds);
      }
    }
    // 5. Delete course_modules
    await supabase.from('course_modules').delete().eq('course_id', id);
    // 6. Delete course_sub_categories
    await supabase.from('course_sub_categories').delete().eq('course_id', id);

    // 7. Delete course_translations with CDN cleanup
    const { data: translations } = await supabase.from('course_translations').select('id, web_thumbnail, web_banner, app_thumbnail, app_banner, video_thumbnail').eq('course_id', id);
    if (translations) {
      const imageFields = ['web_thumbnail', 'web_banner', 'app_thumbnail', 'app_banner', 'video_thumbnail'] as const;
      for (const t of translations) {
        for (const field of imageFields) {
          const url = (t as any)[field];
          if (url) { try { await deleteImage(extractBunnyPath(url), url); } catch {} }
        }
      }
    }
    await supabase.from('course_translations').delete().eq('course_id', id);

    // 8. Delete the course itself
    const { error: e } = await supabase.from('courses').delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'course_deleted', targetType: 'course', targetId: id, targetName: old.code || old.slug, ip: getClientIp(req) });
    return ok(res, null, 'Course permanently deleted');
  } catch (error: any) {
    return err(res, error.message || 'Failed to permanently delete course', 500);
  }
}
