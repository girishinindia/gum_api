/**
 * Certificate Service (Phase 8.5)
 * ───────────────────────────────
 * Renders the PDF + PNG for an `issued_certificates` row.
 *
 *   1. Resolve the issued certificate + template + user + enrollment.
 *   2. Substitute placeholders in template_html with the actual values.
 *   3. Render to PDF (A4 landscape by default; configurable per template).
 *   4. Render the same HTML to PNG for a preview thumbnail / share image.
 *   5. Upload both to Bunny CDN under /certificates/<cert_number>.{pdf,png}.
 *   6. UPDATE issued_certificates SET certificate_url (PDF) + png_url.
 *
 * Idempotent: returns existing URLs when certificate_url is already set
 * (unless `force` is passed).
 *
 * Placeholders supported in template_html:
 *   {{student_name}}     {{course_name}}      {{cert_number}}
 *   {{issued_date}}      {{score}}            {{progress_pct}}
 *   {{verify_url}}       {{logo_url}}         {{signature_url}}
 *   {{background_url}}
 *
 * For templates that lack html_template (or rows without a template_id),
 * a sensible default branded HTML is used.
 */

import { supabase } from '../config/supabase';
import { config } from '../config';
import { uploadToBunny } from '../config/bunny';
import { htmlToPdfBuffer, htmlToPngBuffer } from './pdf.service';
import { logger } from '../utils/logger';

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function substitutePlaceholders(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key) => {
    const v = vars[key];
    return v === null || v === undefined ? '' : escapeHtml(String(v));
  });
}

const DEFAULT_TEMPLATE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Certificate {{cert_number}}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; height: 100%; font-family: 'Georgia', 'Cambria', 'Times New Roman', serif; color: #0f172a; }
  .cert {
    width: 100vw; height: 100vh;
    background: linear-gradient(135deg, #f0f9ff 0%, #ffffff 50%, #ecfdf5 100%);
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    padding: 50px;
    border: 14px double #0284c7; box-sizing: border-box;
  }
  .header { font-size: 14px; letter-spacing: 4px; color: #0284c7; text-transform: uppercase; margin-bottom: 8px; }
  h1 { font-size: 56px; margin: 0 0 24px; color: #0b1220; letter-spacing: -0.5px; }
  .award { font-size: 17px; color: #475569; margin-bottom: 16px; }
  .recipient { font-size: 44px; color: #0284c7; font-style: italic; margin: 6px 0 18px; }
  .course { font-size: 22px; color: #0f172a; margin-bottom: 16px; font-weight: 600; }
  .desc { font-size: 13px; color: #64748b; max-width: 700px; line-height: 1.6; margin-bottom: 30px; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; max-width: 800px; margin-top: 40px; }
  .footer .col { text-align: center; font-size: 12px; color: #64748b; }
  .footer .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
  .footer .val   { font-size: 14px; color: #0f172a; font-weight: 600; margin-top: 2px; }
  .sig img { max-height: 50px; margin-bottom: 4px; }
  .brand { position: absolute; bottom: 18px; right: 24px; font-size: 11px; color: #94a3b8; }
  .verify { position: absolute; bottom: 18px; left: 24px; font-size: 10px; color: #94a3b8; }
</style></head>
<body><div class="cert">
  <div class="header">Certificate of Completion</div>
  <h1>This is to certify that</h1>
  <div class="award">This certificate is proudly presented to</div>
  <div class="recipient">{{student_name}}</div>
  <div class="award">for successfully completing</div>
  <div class="course">{{course_name}}</div>
  <p class="desc">Awarded by Grow Up More in recognition of the dedication and effort demonstrated in mastering the course curriculum.</p>

  <div class="footer">
    <div class="col">
      <div class="label">Issued</div>
      <div class="val">{{issued_date}}</div>
    </div>
    <div class="col">
      <div class="label">Certificate No.</div>
      <div class="val">{{cert_number}}</div>
    </div>
    <div class="col sig">
      <div class="label">Authorised</div>
      <div class="val">Grow Up More</div>
    </div>
  </div>

  <div class="brand">growupmore.com · by Genius ITens</div>
  <div class="verify">Verify: {{verify_url}}</div>
</div></body></html>`;

export interface GenerateCertificateResult {
  certificateId: number;
  certNumber: string;
  pdfUrl: string;
  pngUrl: string;
  alreadyExisted: boolean;
}

export async function generateCertificatePdf(
  issuedCertId: number,
  opts: { force?: boolean } = {},
): Promise<GenerateCertificateResult> {
  // 1. Resolve issued cert + joins
  const { data: cert, error: certErr } = await supabase
    .from('issued_certificates')
    .select('*')
    .eq('id', issuedCertId)
    .is('deleted_at', null)
    .single();
  if (certErr || !cert) throw new Error(`issued_certificate #${issuedCertId} not found`);

  // Idempotency
  if (!opts.force && cert.certificate_url && cert.png_url) {
    return {
      certificateId: cert.id,
      certNumber: cert.certificate_number,
      pdfUrl: cert.certificate_url,
      pngUrl: cert.png_url,
      alreadyExisted: true,
    };
  }

  // Template + user + enrollment (for course/bundle name)
  const [{ data: tpl }, { data: user }, { data: enrollment }] = await Promise.all([
    cert.template_id
      ? supabase.from('certificate_templates').select('*').eq('id', cert.template_id).is('deleted_at', null).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('users').select('id, full_name, first_name, last_name, email').eq('id', cert.user_id).single(),
    cert.enrollment_id
      ? supabase.from('enrollments').select('id, item_type, item_id').eq('id', cert.enrollment_id).single()
      : Promise.resolve({ data: null as any }),
  ]);

  // Resolve a friendly course / bundle / batch name from the enrollment
  let courseName = 'your course';
  if (enrollment?.item_type === 'course') {
    const { data: c } = await supabase.from('courses').select('name').eq('id', enrollment.item_id).single();
    if (c?.name) courseName = c.name;
  } else if (enrollment?.item_type === 'bundle') {
    const { data: b } = await supabase.from('bundles').select('name').eq('id', enrollment.item_id).single();
    if (b?.name) courseName = b.name;
  }

  const studentName = (user?.full_name && user.full_name.trim())
    || [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
    || user?.email
    || 'Student';

  const verifyUrl = `${config.frontendUrl.replace(/\/+$/, '')}/verify/cert/${encodeURIComponent(cert.certificate_number)}`;

  const placeholders = {
    student_name: studentName,
    course_name: courseName,
    cert_number: cert.certificate_number,
    issued_date: new Date(cert.issued_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    score: cert.score_achieved != null ? `${cert.score_achieved}%` : '',
    progress_pct: cert.progress_achieved != null ? `${cert.progress_achieved}%` : '',
    verify_url: verifyUrl,
    logo_url: tpl?.logo_url || '',
    signature_url: tpl?.signature_url || '',
    background_url: tpl?.background_image_url || '',
  };

  const templateHtml = tpl?.template_html && tpl.template_html.includes('{{') ? tpl.template_html : DEFAULT_TEMPLATE;
  const html = substitutePlaceholders(templateHtml, placeholders);

  // Determine orientation
  const isLandscape = (tpl?.orientation || 'landscape').toLowerCase() === 'landscape';

  const [pdfBuf, pngBuf] = await Promise.all([
    htmlToPdfBuffer(html, {
      format: 'A4',
      landscape: isLandscape,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    }),
    htmlToPngBuffer(html, {
      width: isLandscape ? 1754 : 1240,
      height: isLandscape ? 1240 : 1754,
      deviceScaleFactor: 2,
    }),
  ]);

  const certNo = String(cert.certificate_number).replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfPath = `certificates/${certNo}.pdf`;
  const pngPath = `certificates/${certNo}.png`;

  const [pdfUrl, pngUrl] = await Promise.all([
    uploadToBunny(pdfPath, pdfBuf),
    uploadToBunny(pngPath, pngBuf),
  ]);

  const { error: upErr } = await supabase
    .from('issued_certificates')
    .update({
      certificate_url: pdfUrl,
      png_url: pngUrl,
    })
    .eq('id', cert.id);

  if (upErr) {
    logger.error({ err: upErr.message, issuedCertId, certNo }, '[Certificate] DB update failed (assets uploaded)');
    throw new Error(`Certificate update failed: ${upErr.message}`);
  }

  logger.info({ issuedCertId, certNo, pdfUrl, pngUrl }, '[Certificate] generated');

  return {
    certificateId: cert.id,
    certNumber: cert.certificate_number,
    pdfUrl,
    pngUrl,
    alreadyExisted: false,
  };
}
