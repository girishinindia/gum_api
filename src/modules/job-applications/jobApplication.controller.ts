import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { uploadRawFile } from '../../services/storage.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'job_applications';
const FK_SELECT = '*, job_positions(title, slug)';

// ── POST /job-applications  (PUBLIC) — submit a career application ──
export async function apply(req: Request, res: Response) {
  const b: any = req.body || {};
  const fullName   = String(b.full_name || '').trim();
  const email      = String(b.email || '').trim();
  const phone      = String(b.phone || '').trim();
  const experience = String(b.experience_years || '').trim();

  if (!fullName || !email || !phone || !experience) {
    return err(res, 'Please fill all required fields (name, email, phone, experience).', 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err(res, 'Please enter a valid email address.', 400);
  }
  if (!req.file) {
    return err(res, 'Please upload your résumé.', 400);
  }

  // Upload résumé to Bunny CDN (raw, non-image file).
  let resumeUrl: string;
  try {
    const safe = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'applicant';
    const ext = (req.file.originalname.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
    const path = `resumes/${new Date().getFullYear()}/${safe}-${Date.now()}.${ext}`;
    resumeUrl = await uploadRawFile(req.file.buffer, path);
  } catch {
    return err(res, 'Failed to upload résumé. Please try again.', 500);
  }

  let positionId: number | null = b.position_id ? parseInt(b.position_id) : null;
  if (positionId != null && isNaN(positionId)) positionId = null;

  const row = {
    position_id:          positionId,
    position_title:       String(b.position_title || '').trim() || 'General Application',
    full_name:            fullName,
    email,
    phone,
    current_location:     String(b.current_location || '').trim() || null,
    experience_years:     experience || null,
    current_ctc:          String(b.current_ctc || '').trim() || null,
    expected_ctc:         String(b.expected_ctc || '').trim() || null,
    notice_period:        String(b.notice_period || '').trim() || null,
    portfolio_url:        String(b.portfolio_url || '').trim() || null,
    linkedin_url:         String(b.linkedin_url || '').trim() || null,
    cover_letter:         String(b.cover_letter || '').trim() || null,
    resume_url:           resumeUrl,
    resume_original_name: req.file.originalname,
    status:               'new',
    ip_address:           getClientIp(req),
  };

  const { data, error: e } = await supabase.from(TABLE).insert(row).select('id').single();
  if (e) return err(res, e.message, 500);
  return ok(res, { id: data.id }, 'Application submitted successfully!', 201);
}

// ── GET /job-applications  (admin) ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });
  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) {
    const t = String(search).replace(/[%_\\(),]/g, '');
    if (t) q = q.or(`full_name.ilike.%${t}%,email.ilike.%${t}%,position_title.ilike.%${t}%`);
  }
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);

  if (req.query.status) q = q.eq('status', req.query.status as string);
  if (req.query.position_id) q = q.eq('position_id', parseInt(req.query.position_id as string));

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /job-applications/:id  (admin) ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Application not found', 404);
  return ok(res, data);
}

// ── PATCH /job-applications/:id  (admin) — status + admin notes only ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Application not found', 404);

  const updates: any = {};
  if (typeof req.body.status === 'string') updates.status = req.body.status;
  if ('admin_notes' in req.body) updates.admin_notes = req.body.admin_notes || null;
  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Application updated');
}

// ── DELETE /job-applications/:id  (admin, soft delete) ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Application not found', 404);
  if (old.deleted_at) return err(res, 'Application is already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Application moved to trash');
}

// ── PATCH /job-applications/:id/restore  (admin) ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Application not found', 404);
  if (!old.deleted_at) return err(res, 'Application is not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Application restored');
}
