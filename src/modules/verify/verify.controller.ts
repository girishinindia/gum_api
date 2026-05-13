/**
 * Public Verification Endpoints (Phase 8.6)
 * ─────────────────────────────────────────
 * Unauthenticated routes that anyone with a certificate number can hit
 * to confirm authenticity. Rate-limited at the route layer to prevent
 * enumeration.
 *
 * GET /verify/cert/:cert_number
 *   → 200 with { valid: true, student_name, course, issued_at, … }
 *   → 404 when not found
 *   → 410 when revoked
 *
 * NO sensitive PII leaks. We expose:
 *   - student first name (or 'Student' if missing)
 *   - course name
 *   - issued date
 *   - revocation status
 * We do NOT expose: email, mobile, user_id, full address.
 */

import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

export async function verifyCertificate(req: Request, res: Response) {
  const raw = String(req.params.cert_number || '').trim();
  if (!raw || raw.length > 64) return err(res, 'Invalid certificate number', 400);

  const { data: cert } = await supabase
    .from('issued_certificates')
    .select('id, certificate_number, user_id, enrollment_id, issued_at, expires_at, revoked_at, revoke_reason, score_achieved, progress_achieved, certificate_url, png_url')
    .eq('certificate_number', raw)
    .is('deleted_at', null)
    .maybeSingle();

  if (!cert) {
    return res.status(404).json({
      success: false,
      valid: false,
      certificate_number: raw,
      error: 'Certificate not found',
    });
  }

  // Revoked / expired
  if (cert.revoked_at) {
    return res.status(410).json({
      success: true,
      valid: false,
      certificate_number: cert.certificate_number,
      revoked: true,
      revoked_at: cert.revoked_at,
      reason: cert.revoke_reason || null,
    });
  }
  if (cert.expires_at && new Date(cert.expires_at) < new Date()) {
    return res.status(410).json({
      success: true,
      valid: false,
      certificate_number: cert.certificate_number,
      expired: true,
      expires_at: cert.expires_at,
    });
  }

  // Resolve student first name + course (forgiving — fall back to placeholders)
  const [{ data: user }, enrollmentJoin] = await Promise.all([
    supabase.from('users').select('first_name, full_name').eq('id', cert.user_id).single(),
    cert.enrollment_id
      ? supabase.from('enrollments').select('item_type, item_id').eq('id', cert.enrollment_id).single()
      : Promise.resolve({ data: null as any }),
  ]);

  let courseName = 'Course';
  const en = enrollmentJoin.data;
  if (en?.item_type === 'course') {
    const { data: c } = await supabase.from('courses').select('name').eq('id', en.item_id).single();
    if (c?.name) courseName = c.name;
  } else if (en?.item_type === 'bundle') {
    const { data: b } = await supabase.from('bundles').select('name').eq('id', en.item_id).single();
    if (b?.name) courseName = b.name;
  }

  const displayName =
    (user?.first_name && user.first_name.trim()) ||
    (user?.full_name && user.full_name.split(' ')[0]) ||
    'Student';

  return ok(res, {
    valid: true,
    certificate_number: cert.certificate_number,
    student_name: displayName,
    course: courseName,
    issued_at: cert.issued_at,
    expires_at: cert.expires_at,
    score: cert.score_achieved,
    progress_pct: cert.progress_achieved,
    pdf_url: cert.certificate_url,
    png_url: cert.png_url,
  });
}
