/**
 * Announcement Service
 * ────────────────────
 * Resolves target users based on announcement scope and dispatches
 * notifications via the existing notification service.
 *
 * Target scope resolution:
 *  - all          → all users (optionally filtered by audience)
 *  - category     → users enrolled in courses under that category
 *  - sub_category → users enrolled in courses under that sub-category
 *  - course       → users enrolled in that course
 *  - batch        → users enrolled in that batch
 *  - webinar      → users enrolled in that webinar
 *  - instructors  → all instructor-type users
 *  - students     → all student-type users
 *  - custom       → target_id array stored in metadata
 */

import { supabase } from '../config/supabase';
import { sendBulkNotification } from './notification.service';

// ── Resolve target user IDs based on scope ──
export async function resolveTargetUsers(
  targetScope: string,
  targetId: number | null,
  targetAudience: string,
  metadata?: Record<string, any>,
): Promise<number[]> {
  let userIds: number[] = [];

  switch (targetScope) {
    case 'all': {
      // Get all users, filtered by audience type
      // BUG-71: column is `status` ('active'/'inactive'/'suspended'), not `is_active`.
      let query = supabase.from('users').select('id').is('deleted_at', null).eq('status', 'active');
      if (targetAudience === 'students') query = query.eq('type', 'student');
      else if (targetAudience === 'instructors') query = query.eq('type', 'instructor');
      const { data, error } = await query;
      // BUG-71: surface lookup failures instead of silently resolving to 0 recipients.
      if (error) throw new Error(`Failed to resolve 'all' audience: ${error.message}`);
      userIds = data?.map((u: any) => u.id) || [];
      break;
    }

    case 'category': {
      if (!targetId) break;
      // Find courses under this category via course_sub_categories → sub_categories → categories
      const { data: subCats } = await supabase
        .from('sub_categories')
        .select('id')
        .eq('category_id', targetId)
        .is('deleted_at', null);

      if (!subCats?.length) break;
      const subCatIds = subCats.map((sc: any) => sc.id);

      const { data: courseSubs } = await supabase
        .from('course_sub_categories')
        .select('course_id')
        .in('sub_category_id', subCatIds)
        .is('deleted_at', null);

      if (!courseSubs?.length) break;
      const courseIds = [...new Set(courseSubs.map((cs: any) => cs.course_id))];

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('user_id')
        .eq('item_type', 'course')
        .in('item_id', courseIds)
        .is('deleted_at', null);

      userIds = [...new Set(enrollments?.map((e: any) => e.user_id) || [])];

      // Filter by audience
      if (targetAudience !== 'all') {
        userIds = await filterByAudience(userIds, targetAudience);
      }
      break;
    }

    case 'sub_category': {
      if (!targetId) break;
      const { data: courseSubs } = await supabase
        .from('course_sub_categories')
        .select('course_id')
        .eq('sub_category_id', targetId)
        .is('deleted_at', null);

      if (!courseSubs?.length) break;
      const courseIds = [...new Set(courseSubs.map((cs: any) => cs.course_id))];

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('user_id')
        .eq('item_type', 'course')
        .in('item_id', courseIds)
        .is('deleted_at', null);

      userIds = [...new Set(enrollments?.map((e: any) => e.user_id) || [])];
      if (targetAudience !== 'all') userIds = await filterByAudience(userIds, targetAudience);
      break;
    }

    case 'course': {
      if (!targetId) break;
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('user_id')
        .eq('item_type', 'course')
        .eq('item_id', targetId)
        .is('deleted_at', null);

      userIds = [...new Set(enrollments?.map((e: any) => e.user_id) || [])];
      if (targetAudience !== 'all') userIds = await filterByAudience(userIds, targetAudience);
      break;
    }

    case 'batch': {
      if (!targetId) break;
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('user_id')
        .eq('item_type', 'batch')
        .eq('item_id', targetId)
        .is('deleted_at', null);

      userIds = [...new Set(enrollments?.map((e: any) => e.user_id) || [])];
      if (targetAudience !== 'all') userIds = await filterByAudience(userIds, targetAudience);
      break;
    }

    case 'webinar': {
      if (!targetId) break;
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('user_id')
        .eq('item_type', 'webinar')
        .eq('item_id', targetId)
        .is('deleted_at', null);

      userIds = [...new Set(enrollments?.map((e: any) => e.user_id) || [])];
      if (targetAudience !== 'all') userIds = await filterByAudience(userIds, targetAudience);
      break;
    }

    case 'instructors': {
      // BUG-71: use `status='active'` (real column) + surface lookup errors.
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('type', 'instructor')
        .is('deleted_at', null)
        .eq('status', 'active');
      if (error) throw new Error(`Failed to resolve instructors audience: ${error.message}`);
      userIds = data?.map((u: any) => u.id) || [];
      break;
    }

    case 'students': {
      // BUG-71: use `status='active'` (real column) + surface lookup errors.
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('type', 'student')
        .is('deleted_at', null)
        .eq('status', 'active');
      if (error) throw new Error(`Failed to resolve students audience: ${error.message}`);
      userIds = data?.map((u: any) => u.id) || [];
      break;
    }

    case 'custom': {
      // Custom user IDs from metadata
      userIds = metadata?.user_ids || [];
      break;
    }
  }

  return userIds;
}

// ── Filter user IDs by audience type ──
async function filterByAudience(userIds: number[], audience: string): Promise<number[]> {
  if (!userIds.length) return [];
  const type = audience === 'students' ? 'student' : audience === 'instructors' ? 'instructor' : null;
  if (!type) return userIds;

  const { data } = await supabase
    .from('users')
    .select('id')
    .in('id', userIds)
    .eq('type', type)
    .is('deleted_at', null);

  return data?.map((u: any) => u.id) || [];
}

// ── Dispatch announcement to resolved users ──
export async function dispatchAnnouncement(announcementId: number): Promise<{ sent: number; error?: string }> {
  // Get the announcement
  const { data: announcement, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('id', announcementId)
    .single();

  if (error || !announcement) {
    return { sent: 0, error: 'Announcement not found' };
  }

  if (announcement.status !== 'draft' && announcement.status !== 'published') {
    return { sent: 0, error: `Cannot dispatch announcement with status: ${announcement.status}` };
  }

  // Resolve target users
  const userIds = await resolveTargetUsers(
    announcement.target_scope,
    announcement.target_id,
    announcement.target_audience,
    announcement.metadata,
  );

  if (!userIds.length) {
    return { sent: 0, error: 'No target users found for this scope' };
  }

  // Dispatch via notification service
  const channels = announcement.channels || ['in_app'];
  const totalSent = await sendBulkNotification({
    userIds,
    notificationType: 'announcement',
    title: announcement.title,
    message: announcement.content,
    channels,
    referenceType: 'announcement',
    referenceId: announcementId,
    metadata: {
      announcement_type: announcement.announcement_type,
      target_scope: announcement.target_scope,
      is_pinned: announcement.is_pinned,
    },
    createdBy: announcement.published_by || announcement.created_by,
  });

  // Update announcement status + sent_count
  await supabase
    .from('announcements')
    .update({
      status: 'published',
      sent_count: totalSent,
      published_at: new Date().toISOString(),
    })
    .eq('id', announcementId);

  return { sent: totalSent };
}

// ── Get read stats for an announcement ──
export async function getReadStats(announcementId: number): Promise<{ total_sent: number; total_read: number; total_dismissed: number }> {
  const { data: announcement } = await supabase
    .from('announcements')
    .select('sent_count')
    .eq('id', announcementId)
    .single();

  const { count: readCount } = await supabase
    .from('announcement_reads')
    .select('id', { count: 'exact', head: true })
    .eq('announcement_id', announcementId);

  const { count: dismissedCount } = await supabase
    .from('announcement_reads')
    .select('id', { count: 'exact', head: true })
    .eq('announcement_id', announcementId)
    .eq('is_dismissed', true);

  return {
    total_sent: announcement?.sent_count || 0,
    total_read: readCount || 0,
    total_dismissed: dismissedCount || 0,
  };
}
