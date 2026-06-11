import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /dashboard/me (June 2026)
 * One round-trip powering the student dashboard:
 *   stats     — active/completed enrollments, certificates, badges
 *   continue  — up to 3 in-progress course enrollments with course info
 *   upcoming  — next live sessions for enrolled items + upcoming webinars
 */
export async function summary(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const nowIso = new Date().toISOString();

    const [enrollRes, certRes, badgeRes] = await Promise.all([
      supabase
        .from('enrollments')
        .select('id, item_type, item_id, enrollment_status, progress_pct, last_accessed_at, enrolled_at')
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('deleted_at', null),
      supabase
        .from('issued_certificates')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .is('revoked_at', null),
      supabase
        .from('user_badges')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const enrollments = (enrollRes.data || []) as any[];
    const active = enrollments.filter(e => e.enrollment_status !== 'completed');
    const completed = enrollments.filter(e => e.enrollment_status === 'completed');

    // ── Continue learning: latest 3 in-progress COURSE enrollments ──
    const courseEnrolls = active
      .filter(e => e.item_type === 'course')
      .sort((a, b) => String(b.last_accessed_at || b.enrolled_at || '').localeCompare(String(a.last_accessed_at || a.enrolled_at || '')))
      .slice(0, 3);

    let cont: any[] = [];
    if (courseEnrolls.length) {
      const ids = courseEnrolls.map(e => e.item_id);
      const { data: courses } = await supabase
        .from('courses')
        .select('id, name, slug, trailer_thumbnail_url, total_lessons')
        .in('id', ids);
      const cmap = new Map((courses || []).map((c: any) => [c.id, c]));
      cont = courseEnrolls.map(e => ({
        enrollment_id: e.id,
        progress_pct: Number(e.progress_pct) || 0,
        course: cmap.get(e.item_id) || { id: e.item_id, name: `Course #${e.item_id}` },
      }));
    }

    // ── Upcoming: sessions for enrolled items + public upcoming webinars ──
    const upcoming: any[] = [];
    if (enrollments.length) {
      const byType: Record<string, number[]> = {};
      for (const e of enrollments) (byType[e.item_type] ||= []).push(e.item_id);
      for (const [type, ids] of Object.entries(byType)) {
        const { data: sessions } = await supabase
          .from('live_sessions')
          .select('id, title, scheduled_at, duration_minutes, meeting_platform, item_type, item_id')
          .eq('item_type', type)
          .in('item_id', ids)
          .neq('session_status', 'cancelled')
          .gt('scheduled_at', nowIso)
          .is('deleted_at', null)
          .order('scheduled_at', { ascending: true })
          .limit(3);
        for (const s of sessions || []) upcoming.push({ kind: 'live_session', ...s });
      }
    }
    if (upcoming.length < 3) {
      const { data: webinars } = await supabase
        .from('webinars')
        .select('id, title, slug, scheduled_at, duration_minutes')
        .eq('is_active', true)
        .neq('webinar_status', 'cancelled')
        .neq('webinar_status', 'draft')
        .gt('scheduled_at', nowIso)
        .is('deleted_at', null)
        .order('scheduled_at', { ascending: true })
        .limit(3 - upcoming.length);
      for (const w of webinars || []) upcoming.push({ kind: 'webinar', ...w });
    }
    upcoming.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));

    return ok(res, {
      stats: {
        active_courses: active.filter(e => e.item_type === 'course').length,
        total_enrollments: enrollments.length,
        completed: completed.length,
        certificates: certRes.count || 0,
        badges: badgeRes.count || 0,
      },
      continue: cont,
      upcoming: upcoming.slice(0, 3),
    });
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
