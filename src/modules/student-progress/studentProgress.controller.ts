import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { ok, err } from '../../utils/response';

const CACHE_TTL = 300; // 5 minutes

// ─────────────────────────────────────────────
// GET /student-progress/overview
// ─────────────────────────────────────────────
export async function getProgressOverview(req: Request, res: Response) {
  try {
    const days = parseInt(req.query.period as string) || 30;
    const cacheKey = `student_progress:overview:${days}`;

    const cached = await redis.get(cacheKey);
    if (cached) return ok(res, JSON.parse(cached), 'Progress overview (cached)');

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    const [
      enrollmentStats,
      completionStats,
      quizStats,
      videoStats,
      submissionStats,
      recentActivity,
    ] = await Promise.all([
      getEnrollmentStats(sinceISO),
      getCompletionStats(sinceISO),
      getQuizOverviewStats(sinceISO),
      getVideoOverviewStats(sinceISO),
      getSubmissionOverviewStats(sinceISO),
      getRecentActivity(),
    ]);

    const result = {
      period_days: days,
      enrollments: enrollmentStats,
      completion: completionStats,
      quizzes: quizStats,
      videos: videoStats,
      submissions: submissionStats,
      recent_activity: recentActivity,
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return ok(res, result, 'Progress overview');
  } catch (e: any) {
    console.error('[STUDENT_PROGRESS] Overview error:', e);
    return err(res, e.message || 'Failed to fetch progress overview', 500);
  }
}

// ─────────────────────────────────────────────
// GET /student-progress/students
// ─────────────────────────────────────────────
export async function getStudentsList(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string) || '';
    const sortBy = (req.query.sort_by as string) || 'full_name';
    const sortDir = (req.query.sort_dir as string) === 'desc' ? false : true;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('enrollments')
      .select(`
        user_id,
        users!enrollments_user_id_fkey(id, full_name, email, avatar_url),
        enrollment_status,
        progress_pct
      `)
      .is('deleted_at', null);

    // Get distinct students with their enrollment data
    const { data: enrollmentData, error: enrollErr } = await query;
    if (enrollErr) throw enrollErr;

    // Aggregate by user
    const studentMap = new Map<number, any>();
    for (const e of enrollmentData || []) {
      const userId = e.user_id;
      const user = (e as any).users;
      if (!user) continue;

      if (search) {
        const s = search.toLowerCase();
        if (!user.full_name?.toLowerCase().includes(s) && !user.email?.toLowerCase().includes(s)) continue;
      }

      if (!studentMap.has(userId)) {
        studentMap.set(userId, {
          user_id: userId,
          full_name: user.full_name,
          email: user.email,
          avatar_url: user.avatar_url,
          total_enrollments: 0,
          active_enrollments: 0,
          completed_enrollments: 0,
          avg_progress: 0,
          progress_sum: 0,
        });
      }
      const s = studentMap.get(userId)!;
      s.total_enrollments++;
      if (e.enrollment_status === 'active') s.active_enrollments++;
      if (e.enrollment_status === 'completed') s.completed_enrollments++;
      s.progress_sum += (e.progress_pct || 0);
    }

    // Calculate averages
    const students = Array.from(studentMap.values()).map(s => ({
      ...s,
      avg_progress: s.total_enrollments > 0 ? Math.round((s.progress_sum / s.total_enrollments) * 100) / 100 : 0,
      progress_sum: undefined,
    }));

    // Sort
    students.sort((a, b) => {
      const aVal = a[sortBy] ?? '';
      const bVal = b[sortBy] ?? '';
      if (typeof aVal === 'string') return sortDir ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir ? aVal - bVal : bVal - aVal;
    });

    const total = students.length;
    const paged = students.slice(offset, offset + limit);

    return ok(res, { data: paged, total, page, limit }, 'Students list');
  } catch (e: any) {
    console.error('[STUDENT_PROGRESS] Students list error:', e);
    return err(res, e.message || 'Failed to fetch students', 500);
  }
}

// ─────────────────────────────────────────────
// GET /student-progress/students/:userId
// ─────────────────────────────────────────────
export async function getStudentDetail(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId as string);
    if (!userId) return err(res, 'Invalid user ID', 400);

    const [userInfo, enrollments, videoHistory, quizHistory, submissions] = await Promise.all([
      // User info
      supabase.from('users').select('id, full_name, email, avatar_url').eq('id', userId).single(),
      // Enrollments with progress
      supabase.from('enrollments')
        .select('id, item_type, item_id, enrollment_status, progress_pct, enrolled_at, completed_at')
        .eq('user_id', userId).is('deleted_at', null)
        .order('enrolled_at', { ascending: false }),
      // Video watch history
      supabase.from('video_watch_history')
        .select('*')
        .eq('user_id', userId)
        .order('watched_at', { ascending: false })
        .limit(50),
      // Quiz attempts
      supabase.from('quiz_attempts')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(50),
      // Project submissions
      supabase.from('project_submissions')
        .select('*')
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(50),
    ]);

    if (userInfo.error) throw userInfo.error;

    // Calculate summary stats
    const enrollData = enrollments.data || [];
    const videoData = videoHistory.data || [];
    const quizData = quizHistory.data || [];
    const subData = submissions.data || [];

    const totalWatchTime = videoData.reduce((sum, v) => sum + (v.watch_duration_secs || 0), 0);
    const avgQuizScore = quizData.length > 0
      ? Math.round(quizData.reduce((sum, q) => sum + (q.pct_score || 0), 0) / quizData.length * 100) / 100
      : 0;

    const result = {
      user: userInfo.data,
      summary: {
        total_enrollments: enrollData.length,
        active_enrollments: enrollData.filter(e => e.enrollment_status === 'active').length,
        completed_enrollments: enrollData.filter(e => e.enrollment_status === 'completed').length,
        total_watch_hours: Math.round(totalWatchTime / 3600 * 100) / 100,
        total_quiz_attempts: quizData.length,
        avg_quiz_score: avgQuizScore,
        total_submissions: subData.length,
        videos_completed: videoData.filter(v => v.completed).length,
      },
      enrollments: enrollData,
      video_history: videoData,
      quiz_attempts: quizData,
      submissions: subData,
    };

    return ok(res, result, 'Student detail');
  } catch (e: any) {
    console.error('[STUDENT_PROGRESS] Student detail error:', e);
    return err(res, e.message || 'Failed to fetch student detail', 500);
  }
}

// ─────────────────────────────────────────────
// GET /student-progress/quiz-analytics
// ─────────────────────────────────────────────
export async function getQuizAnalytics(req: Request, res: Response) {
  try {
    const days = parseInt(req.query.period as string) || 30;
    const cacheKey = `student_progress:quiz_analytics:${days}`;

    const cached = await redis.get(cacheKey);
    if (cached) return ok(res, JSON.parse(cached), 'Quiz analytics (cached)');

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    // All quiz attempts in period
    const { data: attempts } = await supabase
      .from('quiz_attempts')
      .select('*')
      .gte('created_at', sinceISO);

    const allAttempts = attempts || [];

    // By quiz type
    const byType: Record<string, { count: number; avg_score: number; pass_count: number; total_score: number }> = {};
    for (const a of allAttempts) {
      if (!byType[a.quiz_type]) byType[a.quiz_type] = { count: 0, avg_score: 0, pass_count: 0, total_score: 0 };
      byType[a.quiz_type].count++;
      byType[a.quiz_type].total_score += (a.pct_score || 0);
      if ((a.pct_score || 0) >= 60) byType[a.quiz_type].pass_count++;
    }

    const quizTypeBreakdown = Object.entries(byType).map(([type, stats]) => ({
      quiz_type: type,
      total_attempts: stats.count,
      avg_score: stats.count > 0 ? Math.round(stats.total_score / stats.count * 100) / 100 : 0,
      pass_rate: stats.count > 0 ? Math.round(stats.pass_count / stats.count * 10000) / 100 : 0,
    }));

    // By status
    const byStatus: Record<string, number> = {};
    for (const a of allAttempts) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    }

    // Score distribution (buckets: 0-20, 20-40, 40-60, 60-80, 80-100)
    const buckets = [0, 0, 0, 0, 0];
    for (const a of allAttempts) {
      const s = a.pct_score || 0;
      if (s < 20) buckets[0]++;
      else if (s < 40) buckets[1]++;
      else if (s < 60) buckets[2]++;
      else if (s < 80) buckets[3]++;
      else buckets[4]++;
    }

    // Question type analysis from answers
    const { data: answers } = await supabase
      .from('quiz_answers')
      .select('question_type, is_correct')
      .in('attempt_id', allAttempts.map(a => a.id));

    const questionTypeStats: Record<string, { total: number; correct: number }> = {};
    for (const ans of answers || []) {
      if (!questionTypeStats[ans.question_type]) questionTypeStats[ans.question_type] = { total: 0, correct: 0 };
      questionTypeStats[ans.question_type].total++;
      if (ans.is_correct) questionTypeStats[ans.question_type].correct++;
    }

    const questionAnalysis = Object.entries(questionTypeStats).map(([type, stats]) => ({
      question_type: type,
      total_answers: stats.total,
      correct_answers: stats.correct,
      accuracy_rate: stats.total > 0 ? Math.round(stats.correct / stats.total * 10000) / 100 : 0,
    }));

    const result = {
      period_days: days,
      total_attempts: allAttempts.length,
      unique_students: new Set(allAttempts.map(a => a.user_id)).size,
      overall_avg_score: allAttempts.length > 0
        ? Math.round(allAttempts.reduce((s, a) => s + (a.pct_score || 0), 0) / allAttempts.length * 100) / 100
        : 0,
      by_quiz_type: quizTypeBreakdown,
      by_status: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      score_distribution: [
        { range: '0-20', count: buckets[0] },
        { range: '20-40', count: buckets[1] },
        { range: '40-60', count: buckets[2] },
        { range: '60-80', count: buckets[3] },
        { range: '80-100', count: buckets[4] },
      ],
      question_analysis: questionAnalysis,
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return ok(res, result, 'Quiz analytics');
  } catch (e: any) {
    console.error('[STUDENT_PROGRESS] Quiz analytics error:', e);
    return err(res, e.message || 'Failed to fetch quiz analytics', 500);
  }
}

// ─────────────────────────────────────────────
// GET /student-progress/video-history
// ─────────────────────────────────────────────
export async function getVideoWatchHistory(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const userId = req.query.user_id ? parseInt(req.query.user_id as string) : undefined;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('video_watch_history')
      .select('*, users!video_watch_history_user_id_fkey(id, full_name, email, avatar_url)', { count: 'exact' })
      .order('watched_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq('user_id', userId);

    const { data, count, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    return ok(res, { data: data || [], total: count || 0, page, limit }, 'Video watch history');
  } catch (e: any) {
    console.error('[STUDENT_PROGRESS] Video history error:', e);
    return err(res, e.message || 'Failed to fetch video history', 500);
  }
}

// ─────────────────────────────────────────────
// GET /student-progress/quiz-attempts
// ─────────────────────────────────────────────
export async function getQuizAttempts(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const userId = req.query.user_id ? parseInt(req.query.user_id as string) : undefined;
    const status = req.query.status as string;
    const quizType = req.query.quiz_type as string;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('quiz_attempts')
      .select('*, users!quiz_attempts_user_id_fkey(id, full_name, email, avatar_url)', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq('user_id', userId);
    if (status) query = query.eq('status', status);
    if (quizType) query = query.eq('quiz_type', quizType);

    const { data, count, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    return ok(res, { data: data || [], total: count || 0, page, limit }, 'Quiz attempts');
  } catch (e: any) {
    console.error('[STUDENT_PROGRESS] Quiz attempts error:', e);
    return err(res, e.message || 'Failed to fetch quiz attempts', 500);
  }
}

// ─────────────────────────────────────────────
// GET /student-progress/submissions
// ─────────────────────────────────────────────
export async function getProjectSubmissions(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const userId = req.query.user_id ? parseInt(req.query.user_id as string) : undefined;
    const status = req.query.status as string;
    const projectType = req.query.project_type as string;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('project_submissions')
      .select('*, users!project_submissions_user_id_fkey(id, full_name, email, avatar_url)', { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq('user_id', userId);
    if (status) query = query.eq('status', status);
    if (projectType) query = query.eq('project_type', projectType);

    const { data, count, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    return ok(res, { data: data || [], total: count || 0, page, limit }, 'Project submissions');
  } catch (e: any) {
    console.error('[STUDENT_PROGRESS] Submissions error:', e);
    return err(res, e.message || 'Failed to fetch submissions', 500);
  }
}


// ═══════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════

async function getEnrollmentStats(sinceISO: string) {
  const { count: totalActive } = await supabase
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_status', 'active')
    .is('deleted_at', null);

  const { count: totalCompleted } = await supabase
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_status', 'completed')
    .is('deleted_at', null);

  const { count: newEnrollments } = await supabase
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceISO)
    .is('deleted_at', null);

  const { count: uniqueStudents } = await supabase
    .from('enrollments')
    .select('user_id', { count: 'exact', head: true })
    .is('deleted_at', null);

  return {
    total_active: totalActive || 0,
    total_completed: totalCompleted || 0,
    new_in_period: newEnrollments || 0,
    unique_students: uniqueStudents || 0,
  };
}

async function getCompletionStats(sinceISO: string) {
  const { data } = await supabase
    .from('enrollments')
    .select('progress_pct, enrollment_status')
    .is('deleted_at', null);

  const all = data || [];
  const total = all.length;
  const completed = all.filter(e => e.enrollment_status === 'completed').length;
  const avgProgress = total > 0
    ? Math.round(all.reduce((s, e) => s + (e.progress_pct || 0), 0) / total * 100) / 100
    : 0;

  // Progress distribution
  const buckets = { '0-25': 0, '25-50': 0, '50-75': 0, '75-100': 0 };
  for (const e of all) {
    const p = e.progress_pct || 0;
    if (p < 25) buckets['0-25']++;
    else if (p < 50) buckets['25-50']++;
    else if (p < 75) buckets['50-75']++;
    else buckets['75-100']++;
  }

  return {
    total_enrollments: total,
    completed,
    completion_rate: total > 0 ? Math.round(completed / total * 10000) / 100 : 0,
    avg_progress: avgProgress,
    progress_distribution: Object.entries(buckets).map(([range, count]) => ({ range, count })),
  };
}

async function getQuizOverviewStats(sinceISO: string) {
  const { count: totalAttempts } = await supabase
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceISO);

  const { data: graded } = await supabase
    .from('quiz_attempts')
    .select('pct_score')
    .in('status', ['submitted', 'graded'])
    .gte('created_at', sinceISO);

  const all = graded || [];
  const avgScore = all.length > 0
    ? Math.round(all.reduce((s, q) => s + (q.pct_score || 0), 0) / all.length * 100) / 100
    : 0;
  const passCount = all.filter(q => (q.pct_score || 0) >= 60).length;

  return {
    total_attempts: totalAttempts || 0,
    avg_score: avgScore,
    pass_rate: all.length > 0 ? Math.round(passCount / all.length * 10000) / 100 : 0,
  };
}

async function getVideoOverviewStats(sinceISO: string) {
  const { data } = await supabase
    .from('video_watch_history')
    .select('watch_duration_secs, completed')
    .gte('created_at', sinceISO);

  const all = data || [];
  const totalWatchSecs = all.reduce((s, v) => s + (v.watch_duration_secs || 0), 0);
  const completedCount = all.filter(v => v.completed).length;

  return {
    total_watches: all.length,
    total_watch_hours: Math.round(totalWatchSecs / 3600 * 100) / 100,
    videos_completed: completedCount,
    completion_rate: all.length > 0 ? Math.round(completedCount / all.length * 10000) / 100 : 0,
  };
}

async function getSubmissionOverviewStats(sinceISO: string) {
  const statuses = ['submitted', 'under_review', 'revision_requested', 'graded', 'rejected'];
  const result: { status: string; count: number }[] = [];

  for (const status of statuses) {
    const { count } = await supabase
      .from('project_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
      .gte('created_at', sinceISO);
    result.push({ status, count: count || 0 });
  }

  return result;
}

async function getRecentActivity() {
  // Get last 10 activities across all tables
  const [videos, quizzes, submissions] = await Promise.all([
    supabase.from('video_watch_history')
      .select('id, user_id, content_type, completed, watched_at, users!video_watch_history_user_id_fkey(full_name)')
      .order('watched_at', { ascending: false }).limit(5),
    supabase.from('quiz_attempts')
      .select('id, user_id, quiz_type, status, pct_score, started_at, users!quiz_attempts_user_id_fkey(full_name)')
      .order('started_at', { ascending: false }).limit(5),
    supabase.from('project_submissions')
      .select('id, user_id, project_type, status, submitted_at, users!project_submissions_user_id_fkey(full_name)')
      .order('submitted_at', { ascending: false }).limit(5),
  ]);

  const activities: any[] = [];

  for (const v of videos.data || []) {
    activities.push({
      type: 'video',
      user_id: v.user_id,
      user_name: (v as any).users?.full_name,
      detail: `Watched ${v.content_type} video${v.completed ? ' (completed)' : ''}`,
      timestamp: v.watched_at,
    });
  }

  for (const q of quizzes.data || []) {
    activities.push({
      type: 'quiz',
      user_id: q.user_id,
      user_name: (q as any).users?.full_name,
      detail: `${q.quiz_type} attempt — ${q.status}${q.pct_score ? ` (${q.pct_score}%)` : ''}`,
      timestamp: q.started_at,
    });
  }

  for (const s of submissions.data || []) {
    activities.push({
      type: 'submission',
      user_id: s.user_id,
      user_name: (s as any).users?.full_name,
      detail: `${s.project_type} submission — ${s.status}`,
      timestamp: s.submitted_at,
    });
  }

  // Sort by timestamp descending, take 10
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return activities.slice(0, 10);
}
