import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { uploadRawFile, deleteImage } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'issued_certificates:all';
const clearCache = () => redis.del(CACHE_KEY);

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

/**
 * Generate a unique certificate number: GUM-{YEAR}-{ZERO_PADDED_SEQ}
 */
async function generateCertificateNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `GUM-${year}-`;

  // Get the highest certificate number for this year
  const { data } = await supabase
    .from('issued_certificates')
    .select('certificate_number')
    .like('certificate_number', `${prefix}%`)
    .order('certificate_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const last = data[0].certificate_number;
    const lastSeq = parseInt(last.replace(prefix, ''));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(6, '0')}`;
}

/**
 * Build the certificate HTML by replacing template placeholders with actual data.
 * Placeholders: {{student_name}}, {{course_name}}, {{certificate_number}},
 * {{issue_date}}, {{score}}, {{progress}}, {{template_type}}
 */
function renderCertificateHtml(templateHtml: string, data: Record<string, string>): string {
  let html = templateHtml;
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return html;
}

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'issued_at' });

  let q = supabase.from('issued_certificates').select('*', { count: 'exact' });

  if (search) q = q.or(`certificate_number.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.template_id) q = q.eq('template_id', parseInt(req.query.template_id as string));
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  if (req.query.revoked === 'true') q = q.not('revoked_at', 'is', null);
  else if (req.query.revoked === 'false') q = q.is('revoked_at', null);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Enrich with user name, template name, course name
  const userIds = [...new Set((data || []).map((c: any) => c.user_id).filter(Boolean))];
  const templateIds = [...new Set((data || []).map((c: any) => c.template_id).filter(Boolean))];

  let userMap: Record<number, string> = {};
  let templateMap: Record<number, { name: string; course_id: number | null }> = {};
  let courseMap: Record<number, string> = {};

  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, first_name, last_name, email').in('id', userIds);
    if (users) for (const u of users) userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  }

  if (templateIds.length > 0) {
    const { data: templates } = await supabase.from('certificate_templates').select('id, name, course_id').in('id', templateIds);
    if (templates) {
      const courseIds = [...new Set(templates.map((t: any) => t.course_id).filter(Boolean))];
      if (courseIds.length > 0) {
        const { data: courses } = await supabase.from('courses').select('id, name').in('id', courseIds);
        if (courses) for (const c of courses) courseMap[c.id] = c.name;
      }
      for (const t of templates) templateMap[t.id] = { name: t.name, course_id: t.course_id };
    }
  }

  const enriched = (data || []).map((c: any) => ({
    ...c,
    user_name: userMap[c.user_id] || null,
    template_name: templateMap[c.template_id]?.name || null,
    course_name: templateMap[c.template_id]?.course_id ? courseMap[templateMap[c.template_id].course_id!] || null : null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

// ── GET BY ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('issued_certificates').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Issued certificate not found', 404);
  return ok(res, data);
}

// ── VERIFY (public) ──
export async function verify(req: Request, res: Response) {
  const certNumber = req.params.certificateNumber;
  const { data, error: e } = await supabase
    .from('issued_certificates')
    .select('id, certificate_number, certificate_url, issued_at, expires_at, revoked_at, score_achieved, progress_achieved, template_id, user_id')
    .eq('certificate_number', certNumber)
    .is('deleted_at', null)
    .single();

  if (e || !data) return err(res, 'Certificate not found', 404);

  // Enrich with user and template info
  const { data: user } = await supabase.from('users').select('first_name, last_name').eq('id', data.user_id).single();
  const { data: template } = await supabase.from('certificate_templates').select('name, course_id').eq('id', data.template_id).single();

  let courseName: string | null = null;
  if (template?.course_id) {
    const { data: course } = await supabase.from('courses').select('name').eq('id', template.course_id).single();
    courseName = course?.name || null;
  }

  const isValid = !data.revoked_at && (!data.expires_at || new Date(data.expires_at) > new Date());

  return ok(res, {
    certificate_number: data.certificate_number,
    status: data.revoked_at ? 'revoked' : (data.expires_at && new Date(data.expires_at) <= new Date()) ? 'expired' : 'valid',
    is_valid: isValid,
    student_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : null,
    course_name: courseName,
    template_name: template?.name || null,
    issued_at: data.issued_at,
    expires_at: data.expires_at,
    revoked_at: data.revoked_at,
    certificate_url: data.certificate_url,
    score_achieved: data.score_achieved,
    progress_achieved: data.progress_achieved,
  });
}

// ── ISSUE CERTIFICATE ──
export async function issue(req: Request, res: Response) {
  const { template_id, user_id, enrollment_id, expires_at, metadata } = req.body;

  if (!template_id || !user_id || !enrollment_id) {
    return err(res, 'template_id, user_id, and enrollment_id are required', 400);
  }

  // Validate template exists and is active
  const { data: template } = await supabase.from('certificate_templates').select('*').eq('id', template_id).eq('is_active', true).is('deleted_at', null).single();
  if (!template) return err(res, 'Certificate template not found or inactive', 404);

  // Validate enrollment exists
  const { data: enrollment } = await supabase.from('enrollments').select('*').eq('id', enrollment_id).eq('user_id', user_id).single();
  if (!enrollment) return err(res, 'Enrollment not found for this user', 404);

  // Check if certificate already issued for this enrollment+template
  const { data: existing } = await supabase
    .from('issued_certificates')
    .select('id')
    .eq('template_id', template_id)
    .eq('enrollment_id', enrollment_id)
    .is('deleted_at', null)
    .is('revoked_at', null)
    .limit(1);
  if (existing && existing.length > 0) {
    return err(res, 'Certificate already issued for this enrollment', 409);
  }

  // Get user info for certificate rendering
  const { data: user } = await supabase.from('users').select('first_name, last_name').eq('id', user_id).single();
  const studentName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Student';

  // Get course name
  let courseName = 'Course';
  if (template.course_id) {
    const { data: course } = await supabase.from('courses').select('name').eq('id', template.course_id).single();
    if (course) courseName = course.name;
  }

  const certNumber = await generateCertificateNumber();
  const scoreAchieved = enrollment.progress_pct ?? 0;
  const progressAchieved = enrollment.progress_pct ?? 0;

  // Render and upload certificate HTML
  let certificateUrl: string | null = null;
  if (template.template_html) {
    let templateHtml = template.template_html;

    // If template_html is a CDN URL, it's stored on Bunny — use it as-is as a reference
    // The actual rendering happens client-side; we store the template reference
    // For now, generate a rendered HTML and upload it
    if (!templateHtml.startsWith('http')) {
      const rendered = renderCertificateHtml(templateHtml, {
        student_name: studentName,
        course_name: courseName,
        certificate_number: certNumber,
        issue_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        score: String(scoreAchieved),
        progress: String(progressAchieved),
        template_type: template.template_type,
      });

      const path = `certificates/issued/${certNumber}.html`;
      certificateUrl = await uploadRawFile(Buffer.from(rendered, 'utf-8'), path);
    } else {
      // Template is on CDN — store a reference to the rendered version
      certificateUrl = templateHtml; // Will be replaced with per-certificate render
    }
  }

  const { data: cert, error: e } = await supabase.from('issued_certificates').insert({
    template_id,
    user_id,
    enrollment_id,
    certificate_number: certNumber,
    certificate_url: certificateUrl,
    issued_at: new Date().toISOString(),
    expires_at: expires_at || null,
    score_achieved: scoreAchieved,
    progress_achieved: progressAchieved,
    metadata: metadata || {},
    is_active: true,
    created_by: req.user!.id,
  }).select().single();

  if (e) return err(res, e.message, 500);

  // Update enrollment with certificate info
  await supabase.from('enrollments').update({
    certificate_url: certificateUrl,
    certificate_issued_at: cert.issued_at,
  }).eq('id', enrollment_id);

  // Increment student_profiles.certificates_earned
  const { data: sp } = await supabase.from('student_profiles').select('certificates_earned').eq('user_id', user_id).single();
  if (sp) {
    await supabase.from('student_profiles').update({ certificates_earned: (sp.certificates_earned || 0) + 1 }).eq('user_id', user_id);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'certificate_issued', targetType: 'issued_certificate', targetId: cert.id, targetName: certNumber, ip: getClientIp(req), metadata: { user_id, template_id, enrollment_id } });
  return ok(res, cert, 'Certificate issued successfully', 201);
}

// ── BULK ISSUE ──
export async function bulkIssue(req: Request, res: Response) {
  const { template_id, enrollment_ids, expires_at } = req.body;

  if (!template_id || !enrollment_ids || !Array.isArray(enrollment_ids) || enrollment_ids.length === 0) {
    return err(res, 'template_id and enrollment_ids array are required', 400);
  }

  if (enrollment_ids.length > 100) {
    return err(res, 'Maximum 100 certificates can be issued at once', 400);
  }

  // Validate template
  const { data: template } = await supabase.from('certificate_templates').select('*').eq('id', template_id).eq('is_active', true).is('deleted_at', null).single();
  if (!template) return err(res, 'Certificate template not found or inactive', 404);

  // Fetch enrollments
  const { data: enrollments } = await supabase.from('enrollments').select('id, user_id, progress_pct').in('id', enrollment_ids);
  if (!enrollments || enrollments.length === 0) return err(res, 'No valid enrollments found', 404);

  // Get course name
  let courseName = 'Course';
  if (template.course_id) {
    const { data: course } = await supabase.from('courses').select('name').eq('id', template.course_id).single();
    if (course) courseName = course.name;
  }

  // Check for already-issued certificates
  const { data: existingCerts } = await supabase
    .from('issued_certificates')
    .select('enrollment_id')
    .eq('template_id', template_id)
    .in('enrollment_id', enrollment_ids)
    .is('deleted_at', null)
    .is('revoked_at', null);
  const alreadyIssued = new Set((existingCerts || []).map((c: any) => c.enrollment_id));

  // Get user info
  const userIds = [...new Set(enrollments.map((e: any) => e.user_id))];
  const { data: users } = await supabase.from('users').select('id, first_name, last_name').in('id', userIds);
  const userMap: Record<number, string> = {};
  if (users) for (const u of users) userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Student';

  const issued: any[] = [];
  const skipped: number[] = [];

  for (const enrollment of enrollments) {
    if (alreadyIssued.has(enrollment.id)) {
      skipped.push(enrollment.id);
      continue;
    }

    const certNumber = await generateCertificateNumber();
    const studentName = userMap[enrollment.user_id] || 'Student';

    let certificateUrl: string | null = null;
    if (template.template_html && !template.template_html.startsWith('http')) {
      const rendered = renderCertificateHtml(template.template_html, {
        student_name: studentName,
        course_name: courseName,
        certificate_number: certNumber,
        issue_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        score: String(enrollment.progress_pct ?? 0),
        progress: String(enrollment.progress_pct ?? 0),
        template_type: template.template_type,
      });
      const path = `certificates/issued/${certNumber}.html`;
      certificateUrl = await uploadRawFile(Buffer.from(rendered, 'utf-8'), path);
    }

    const { data: cert, error: e } = await supabase.from('issued_certificates').insert({
      template_id,
      user_id: enrollment.user_id,
      enrollment_id: enrollment.id,
      certificate_number: certNumber,
      certificate_url: certificateUrl,
      issued_at: new Date().toISOString(),
      expires_at: expires_at || null,
      score_achieved: enrollment.progress_pct ?? 0,
      progress_achieved: enrollment.progress_pct ?? 0,
      metadata: {},
      is_active: true,
      created_by: req.user!.id,
    }).select().single();

    if (!e && cert) {
      issued.push(cert);

      // Update enrollment
      await supabase.from('enrollments').update({
        certificate_url: certificateUrl,
        certificate_issued_at: cert.issued_at,
      }).eq('id', enrollment.id);

      // Increment student counter
      supabase.from('student_profiles').select('certificates_earned').eq('user_id', enrollment.user_id).single().then(({ data: sp }) => {
        if (sp) supabase.from('student_profiles').update({ certificates_earned: (sp.certificates_earned || 0) + 1 }).eq('user_id', enrollment.user_id);
      });
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'certificate_bulk_issued', targetType: 'issued_certificate', targetId: template_id, targetName: template.name, ip: getClientIp(req), metadata: { issued_count: issued.length, skipped_count: skipped.length } });

  return ok(res, { issued, skipped, issued_count: issued.length, skipped_count: skipped.length }, `${issued.length} certificate(s) issued, ${skipped.length} skipped (already issued)`);
}

// ── REVOKE ──
export async function revoke(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { revoke_reason } = req.body;

  const { data: cert } = await supabase.from('issued_certificates').select('*').eq('id', id).single();
  if (!cert) return err(res, 'Certificate not found', 404);
  if (cert.revoked_at) return err(res, 'Certificate is already revoked', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from('issued_certificates').update({
    revoked_at: now,
    revoke_reason: revoke_reason || null,
    is_active: false,
    updated_at: now,
  }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Clear certificate from enrollment
  await supabase.from('enrollments').update({
    certificate_url: null,
    certificate_issued_at: null,
  }).eq('id', cert.enrollment_id);

  // Decrement student counter
  supabase.from('student_profiles').select('certificates_earned').eq('user_id', cert.user_id).single().then(({ data: sp }) => {
    if (sp && sp.certificates_earned > 0) {
      supabase.from('student_profiles').update({ certificates_earned: sp.certificates_earned - 1 }).eq('user_id', cert.user_id);
    }
  });

  // Delete certificate file from CDN
  if (cert.certificate_url) {
    try { await deleteImage(extractBunnyPath(cert.certificate_url), cert.certificate_url); } catch {}
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'certificate_revoked', targetType: 'issued_certificate', targetId: id, targetName: cert.certificate_number, ip: getClientIp(req), metadata: { revoke_reason } });
  return ok(res, data, 'Certificate revoked');
}

// ── SOFT DELETE ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('issued_certificates').select('certificate_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Certificate not found', 404);
  if (old.deleted_at) return err(res, 'Certificate is already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from('issued_certificates')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'certificate_revoked', targetType: 'issued_certificate', targetId: id, targetName: old.certificate_number, ip: getClientIp(req) });
  return ok(res, data, 'Certificate moved to trash');
}

// ── RESTORE ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('issued_certificates').select('certificate_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Certificate not found', 404);
  if (!old.deleted_at) return err(res, 'Certificate is not in trash', 400);

  const { data, error: e } = await supabase
    .from('issued_certificates')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  return ok(res, data, 'Certificate restored');
}

// ── PERMANENT DELETE ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('issued_certificates').select('*').eq('id', id).single();
  if (!old) return err(res, 'Certificate not found', 404);

  if (old.certificate_url) {
    try { await deleteImage(extractBunnyPath(old.certificate_url), old.certificate_url); } catch {}
  }

  const { error: e } = await supabase.from('issued_certificates').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'certificate_revoked', targetType: 'issued_certificate', targetId: id, targetName: old.certificate_number, ip: getClientIp(req) });
  return ok(res, null, 'Certificate permanently deleted');
}
