import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { sendNotification } from '../../services/notification.service';

/**
 * Certificate Auto-Issue Job
 * ──────────────────────────
 * Runs every hour.
 * Finds enrollments where progress_pct >= 100 (or status = 'completed')
 * and no certificate has been issued yet. Matches to a certificate_template
 * for that course and auto-creates an issued_certificate record.
 */
export async function runCertificateAutoIssue(): Promise<{ issued: number; noTemplate: number }> {
  let issued = 0;
  let noTemplate = 0;

  // Find completed COURSE enrollments without a certificate.
  // NOTE: enrollments is polymorphic — it has item_type + item_id, NOT a
  // course_id column (selecting course_id failed every hourly run, June 2026).
  const { data: eligible, error: err } = await supabase
    .from('enrollments')
    .select('id, user_id, item_type, item_id, progress_pct')
    .eq('item_type', 'course')
    .or('enrollment_status.eq.completed,progress_pct.gte.100')
    .eq('is_active', true)
    .is('certificate_issued_at', null)
    .is('deleted_at', null)
    .limit(200);

  if (err) {
    logger.error({ err: err.message }, '[Cron:CertAutoIssue] Enrollment query failed');
    return { issued: 0, noTemplate: 0 };
  }

  if (!eligible || eligible.length === 0) {
    logger.debug('[Cron:CertAutoIssue] No eligible enrollments found');
    return { issued: 0, noTemplate: 0 };
  }

  // Batch-fetch certificate templates for all distinct course ids
  // (enrollment.item_id IS the course id for item_type='course' rows)
  const courseIds = [...new Set(eligible.map((e: any) => e.item_id).filter(Boolean))];
  const { data: templates } = await supabase
    .from('certificate_templates')
    .select('id, course_id, template_type')
    .in('course_id', courseIds)
    .eq('is_active', true)
    .is('deleted_at', null);

  const templateMap = new Map<number, any>();
  for (const t of templates || []) {
    // Use the first active template per course
    if (!templateMap.has(t.course_id)) templateMap.set(t.course_id, t);
  }

  for (const enrollment of eligible) {
    const template = templateMap.get(enrollment.item_id);
    if (!template) {
      noTemplate++;
      continue;
    }

    // Check if already issued (race condition guard)
    const { data: existing } = await supabase
      .from('issued_certificates')
      .select('id')
      .eq('enrollment_id', enrollment.id)
      .eq('template_id', template.id)
      .is('deleted_at', null)
      .is('revoked_at', null)
      .maybeSingle();

    if (existing) continue;

    // Generate certificate number: GUM-YYYY-NNNNNN
    const year = new Date().getFullYear();
    const prefix = `GUM-${year}-`;
    const { data: lastCert } = await supabase
      .from('issued_certificates')
      .select('certificate_number')
      .like('certificate_number', `${prefix}%`)
      .order('certificate_number', { ascending: false })
      .limit(1);

    let seq = 1;
    if (lastCert && lastCert.length > 0) {
      const lastSeq = parseInt(lastCert[0].certificate_number.replace(prefix, ''));
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const certNumber = `${prefix}${String(seq).padStart(6, '0')}`;

    const now = new Date().toISOString();

    // Insert issued certificate
    const { data: cert, error: insertErr } = await supabase
      .from('issued_certificates')
      .insert({
        certificate_number: certNumber,
        template_id: template.id,
        user_id: enrollment.user_id,
        enrollment_id: enrollment.id,
        score_achieved: parseFloat(enrollment.progress_pct || 0),
        progress_achieved: parseFloat(enrollment.progress_pct || 0),
        issued_at: now,
        metadata: { auto_issued: true },
      })
      .select('id')
      .single();

    if (insertErr) {
      logger.error({ err: insertErr.message, enrollmentId: enrollment.id }, '[Cron:CertAutoIssue] Insert failed');
      continue;
    }

    // Update enrollment to mark certificate issued
    await supabase
      .from('enrollments')
      .update({ certificate_issued_at: now })
      .eq('id', enrollment.id);

    issued++;

    // Phase 8.7 — enqueue PDF + PNG render. Idempotent at the queue layer
    // (jobId='certificate:<id>'); slow Puppeteer boot can't stall the cron.
    try {
      const { enqueueCertificatePdf } = await import('../../services/pdfQueue.service');
      await enqueueCertificatePdf(cert!.id);
    } catch (e: any) {
      logger.warn({ err: e?.message, certId: cert?.id }, '[Cron:CertAutoIssue] Enqueue PDF failed (non-fatal)');
    }

    // Notify the student
    try {
      await sendNotification({
        userId: enrollment.user_id,
        notificationType: 'certificate_issued',
        title: 'Certificate Issued!',
        message: `Congratulations! Your certificate (${certNumber}) has been issued for completing your course.`,
        channels: ['in_app', 'email'],
        referenceType: 'issued_certificate',
        referenceId: cert.id,
      });
    } catch { /* skip */ }
  }

  logger.info({ issued, noTemplate, eligible: eligible.length }, '[Cron:CertAutoIssue] Completed');
  return { issued, noTemplate };
}
