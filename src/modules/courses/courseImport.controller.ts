import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import {
  parseCourseImportFile,
  CourseImportParseResult,
  ParsedModule,
  ParsedSubject,
  ParsedChapter,
  ParsedTopic,
} from '../../utils/courseImportParser';

// ── Clear related caches ──
async function clearCaches() {
  await Promise.all([
    redis.del('courses:all'),
    redis.del('course_modules:all'),
    redis.del('course_module_subjects:all'),
    redis.del('course_chapters:all'),
    redis.del('course_chapter_topics:all'),
    redis.del('course_sub_categories:all'),
  ]);
}

// ── Language name → id lookup ──
const LANGUAGE_MAP: Record<string, number> = {
  english: 7,
  hindi: 11,
  gujarati: 12,
  marathi: 13,
};

function resolveLanguageId(name?: string): number | null {
  if (!name) return null;
  return LANGUAGE_MAP[name.toLowerCase()] || null;
}

// ── Preview types ──

interface MappedTopic {
  name: string;
  db_id: number | null;
  db_chapter_id: number | null;
  status: 'found' | 'found_other_parent' | 'missing';
}

interface MappedChapter {
  name: string;
  is_free_trial: boolean;
  db_id: number | null;
  db_subject_id: number | null;
  status: 'found' | 'found_other_parent' | 'missing';
  topics: MappedTopic[];
}

interface MappedSubject {
  name: string;
  db_id: number | null;
  status: 'found' | 'missing';
  chapters: MappedChapter[];
}

interface MappedModule {
  name: string;
  display_order: number;
  subjects: MappedSubject[];
}

interface MappedSubCategory {
  code: string;
  is_primary: boolean;
  db_id: number | null;
  db_name: string | null;
  status: 'found' | 'missing';
}

/**
 * POST /courses/import/preview
 * Parse .txt content and return a detailed mapping preview against DB
 * so the user can verify every reference before actual import.
 */
export async function preview(req: Request, res: Response) {
  const { content } = req.body;
  if (!content || typeof content !== 'string') {
    return err(res, 'Missing "content" field (the .txt file content)', 400);
  }

  const result = parseCourseImportFile(content);

  // ── Check if course code already exists ──
  const { data: existingCourse } = await supabase
    .from('courses')
    .select('id, code, name')
    .eq('code', result.course.code)
    .is('deleted_at', null)
    .maybeSingle();

  // ── Resolve language ──
  const languageId = resolveLanguageId(result.course.course_language);

  // ── Load all master data in parallel ──
  const [subCatsRes, subjectsRes, chaptersRes, topicsRes] = await Promise.all([
    supabase.from('sub_categories').select('id, code, name').is('deleted_at', null),
    supabase.from('subjects').select('id, name, code').is('deleted_at', null),
    supabase.from('chapters').select('id, name, subject_id').is('deleted_at', null),
    supabase.from('topics').select('id, name, chapter_id').is('deleted_at', null),
  ]);

  // ── Build lookup maps (case-insensitive for names) ──
  const subCatByCode = new Map((subCatsRes.data || []).map(sc => [sc.code, sc]));

  const subjectsByName = new Map<string, any[]>();
  for (const s of subjectsRes.data || []) {
    const key = s.name?.toLowerCase().trim();
    if (!key) continue;
    if (!subjectsByName.has(key)) subjectsByName.set(key, []);
    subjectsByName.get(key)!.push(s);
  }

  const chaptersByName = new Map<string, any[]>();
  for (const c of chaptersRes.data || []) {
    const key = c.name?.toLowerCase().trim();
    if (!key) continue;
    if (!chaptersByName.has(key)) chaptersByName.set(key, []);
    chaptersByName.get(key)!.push(c);
  }

  const topicsByName = new Map<string, any[]>();
  for (const t of topicsRes.data || []) {
    const key = t.name?.toLowerCase().trim();
    if (!key) continue;
    if (!topicsByName.has(key)) topicsByName.set(key, []);
    topicsByName.get(key)!.push(t);
  }

  // ── Map sub-categories ──
  const mappedSubCategories: MappedSubCategory[] = result.subCategories.map(sc => {
    const db = subCatByCode.get(sc.code);
    return {
      code: sc.code,
      is_primary: sc.is_primary,
      db_id: db?.id ?? null,
      db_name: db?.name ?? null,
      status: db ? 'found' : 'missing',
    };
  });

  // ── Map modules → subjects → chapters → topics ──
  const mappedModules: MappedModule[] = result.modules.map(mod => {
    const mappedSubjects: MappedSubject[] = mod.subjects.map(sub => {
      const subKey = sub.name.toLowerCase().trim();
      const matchedSubjects = subjectsByName.get(subKey);
      const subjectRecord = matchedSubjects?.[0] ?? null;
      const subjectId = subjectRecord?.id ?? null;

      const mappedChapters: MappedChapter[] = sub.chapters.map(ch => {
        const chKey = ch.name.toLowerCase().trim();
        const matchedChapters = chaptersByName.get(chKey);
        let chapterRecord: any = null;
        let chStatus: MappedChapter['status'] = 'missing';

        if (matchedChapters && matchedChapters.length > 0) {
          // Prefer chapter under the correct subject
          const exactParent = subjectId
            ? matchedChapters.find(c => c.subject_id === subjectId)
            : null;
          if (exactParent) {
            chapterRecord = exactParent;
            chStatus = 'found';
          } else {
            chapterRecord = matchedChapters[0];
            chStatus = 'found_other_parent';
          }
        }

        const chapterId = chapterRecord?.id ?? null;

        const mappedTopics: MappedTopic[] = ch.topics.map(tp => {
          const tpKey = tp.name.toLowerCase().trim();
          const matchedTopics = topicsByName.get(tpKey);
          let topicRecord: any = null;
          let tpStatus: MappedTopic['status'] = 'missing';

          if (matchedTopics && matchedTopics.length > 0) {
            const exactParent = chapterId
              ? matchedTopics.find(t => t.chapter_id === chapterId)
              : null;
            if (exactParent) {
              topicRecord = exactParent;
              tpStatus = 'found';
            } else {
              topicRecord = matchedTopics[0];
              tpStatus = 'found_other_parent';
            }
          }

          return {
            name: tp.name,
            db_id: topicRecord?.id ?? null,
            db_chapter_id: topicRecord?.chapter_id ?? null,
            status: tpStatus,
          };
        });

        return {
          name: ch.name,
          is_free_trial: ch.is_free_trial,
          db_id: chapterId,
          db_subject_id: chapterRecord?.subject_id ?? null,
          status: chStatus,
          topics: mappedTopics,
        };
      });

      return {
        name: sub.name,
        db_id: subjectId,
        status: subjectRecord ? 'found' : 'missing',
        chapters: mappedChapters,
      };
    });

    return {
      name: mod.name,
      display_order: mod.display_order,
      subjects: mappedSubjects,
    };
  });

  // ── Compute stats ──
  let totalItems = 0, foundItems = 0, missingItems = 0, warningItems = 0;

  for (const sc of mappedSubCategories) {
    totalItems++;
    if (sc.status === 'found') foundItems++; else missingItems++;
  }

  for (const mod of mappedModules) {
    for (const sub of mod.subjects) {
      totalItems++;
      if (sub.status === 'found') foundItems++; else missingItems++;
      for (const ch of sub.chapters) {
        totalItems++;
        if (ch.status === 'found') foundItems++;
        else if (ch.status === 'found_other_parent') { foundItems++; warningItems++; }
        else missingItems++;
        for (const tp of ch.topics) {
          totalItems++;
          if (tp.status === 'found') foundItems++;
          else if (tp.status === 'found_other_parent') { foundItems++; warningItems++; }
          else missingItems++;
        }
      }
    }
  }

  return ok(res, {
    parsed: result,
    existingCourse: existingCourse || null,
    resolvedLanguageId: languageId,
    mapping: {
      subCategories: mappedSubCategories,
      modules: mappedModules,
    },
    stats: {
      totalItems,
      foundItems,
      missingItems,
      warningItems,
      allResolved: missingItems === 0 && result.errors.length === 0,
    },
  });
}

/**
 * POST /courses/import
 * Parse .txt content and create all records.
 */
export async function importCourse(req: Request, res: Response) {
  const { content, overwrite } = req.body;
  if (!content || typeof content !== 'string') {
    return err(res, 'Missing "content" field (the .txt file content)', 400);
  }

  const userId = req.user!.id;
  const result = parseCourseImportFile(content);

  if (result.errors.length > 0) {
    return err(res, `Parse errors: ${result.errors.join('; ')}`, 400);
  }

  if (!result.course.name || !result.course.code) {
    return err(res, 'Course name and code are required', 400);
  }

  const log: string[] = [];

  try {
    // ── 1. Check/Create Course ──

    let courseId: number;
    const { data: existingCourse } = await supabase
      .from('courses')
      .select('id')
      .eq('code', result.course.code)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingCourse) {
      if (!overwrite) {
        return err(res, `Course "${result.course.code}" already exists. Set overwrite=true to add structure to it.`, 409);
      }
      courseId = existingCourse.id;
      log.push(`Using existing course: ${result.course.code} (id=${courseId})`);
    } else {
      const courseLanguageId = resolveLanguageId(result.course.course_language);
      const slug = await generateUniqueSlug(supabase, 'courses', result.course.code || result.course.name);

      const courseBody: any = {
        name: result.course.name,
        code: result.course.code,
        slug,
        difficulty_level: result.course.difficulty_level || 'beginner',
        course_status: result.course.course_status || 'draft',
        course_language_id: courseLanguageId,
        duration_hours: result.course.duration_hours || null,
        price: result.course.price ?? 0,
        original_price: result.course.original_price || null,
        discount_percentage: result.course.discount_percentage || null,
        is_free: result.course.is_free ?? false,
        is_new: result.course.is_new ?? false,
        is_featured: result.course.is_featured ?? false,
        is_bestseller: result.course.is_bestseller ?? false,
        has_certificate: result.course.has_certificate ?? false,
        has_placement_assistance: result.course.has_placement_assistance ?? false,
        refund_days: result.course.refund_days || null,
        total_lessons: result.course.total_lessons ?? 0,
        total_assignments: result.course.total_assignments ?? 0,
        total_projects: result.course.total_projects ?? 0,
        is_active: true,
        created_by: userId,
      };

      const { data: newCourse, error: courseErr } = await supabase
        .from('courses')
        .insert(courseBody)
        .select()
        .single();

      if (courseErr) {
        return err(res, `Failed to create course: ${courseErr.message}`, 500);
      }

      courseId = newCourse.id;
      log.push(`Created course: ${result.course.name} (id=${courseId})`);

      // Sync English translation
      await supabase.from('course_translations').upsert({
        course_id: courseId,
        language_id: 7,
        title: result.course.name,
        is_active: true,
        created_by: userId,
      }, { onConflict: 'course_id,language_id' });
    }

    // ── 2. Create Sub-Category Assignments ──

    if (result.subCategories.length > 0) {
      const scCodes = result.subCategories.map(sc => sc.code);
      const { data: dbSubCats } = await supabase
        .from('sub_categories')
        .select('id, code')
        .in('code', scCodes);

      const scMap = new Map((dbSubCats || []).map(sc => [sc.code, sc.id]));

      for (let i = 0; i < result.subCategories.length; i++) {
        const sc = result.subCategories[i];
        const scId = scMap.get(sc.code);
        if (!scId) {
          log.push(`⚠ Sub-category "${sc.code}" not found in DB — skipped`);
          continue;
        }

        // Check if already assigned
        const { data: existing } = await supabase
          .from('course_sub_categories')
          .select('id')
          .eq('course_id', courseId)
          .eq('sub_category_id', scId)
          .is('deleted_at', null)
          .maybeSingle();

        if (existing) {
          log.push(`Sub-category "${sc.code}" already assigned — skipped`);
          continue;
        }

        const { error: scErr } = await supabase.from('course_sub_categories').insert({
          course_id: courseId,
          sub_category_id: scId,
          is_primary: sc.is_primary,
          display_order: i,
          sort_order: i,
          is_active: true,
          created_by: userId,
        });

        if (scErr) {
          log.push(`⚠ Failed to assign sub-category "${sc.code}": ${scErr.message}`);
        } else {
          log.push(`Assigned sub-category: ${sc.code}${sc.is_primary ? ' (primary)' : ''}`);
        }
      }
    }

    // ── 3. Load all subjects, chapters, topics for matching ──

    const { data: allSubjects } = await supabase
      .from('subjects')
      .select('id, name, code, slug')
      .is('deleted_at', null);

    const { data: allChapters } = await supabase
      .from('chapters')
      .select('id, name, slug, subject_id')
      .is('deleted_at', null);

    const { data: allTopics } = await supabase
      .from('topics')
      .select('id, name, slug, chapter_id')
      .is('deleted_at', null);

    // Build lookup maps (name → record[])
    const subjectsByName = new Map<string, any[]>();
    for (const s of allSubjects || []) {
      const key = s.name?.toLowerCase().trim();
      if (!key) continue;
      if (!subjectsByName.has(key)) subjectsByName.set(key, []);
      subjectsByName.get(key)!.push(s);
    }

    const chaptersByName = new Map<string, any[]>();
    for (const c of allChapters || []) {
      const key = c.name?.toLowerCase().trim();
      if (!key) continue;
      if (!chaptersByName.has(key)) chaptersByName.set(key, []);
      chaptersByName.get(key)!.push(c);
    }

    const topicsByName = new Map<string, any[]>();
    for (const t of allTopics || []) {
      const key = t.name?.toLowerCase().trim();
      if (!key) continue;
      if (!topicsByName.has(key)) topicsByName.set(key, []);
      topicsByName.get(key)!.push(t);
    }

    // ── 4. Process Modules ──

    for (const mod of result.modules) {
      // Create course_module
      const moduleSlug = await generateUniqueSlug(supabase, 'course_modules', mod.name);
      const { data: newModule, error: modErr } = await supabase
        .from('course_modules')
        .insert({
          course_id: courseId,
          name: mod.name,
          slug: moduleSlug,
          display_order: mod.display_order,
          is_active: true,
          created_by: userId,
        })
        .select()
        .single();

      if (modErr) {
        log.push(`⚠ Failed to create module "${mod.name}": ${modErr.message}`);
        continue;
      }

      const moduleId = newModule.id;
      log.push(`Created module: ${mod.name} (id=${moduleId})`);

      // Sync English translation for module
      await supabase.from('course_module_translations').upsert({
        course_module_id: moduleId,
        language_id: 7,
        name: mod.name,
        is_active: true,
        created_by: userId,
      }, { onConflict: 'course_module_id,language_id' });

      // ── Process subjects in this module ──
      for (const sub of mod.subjects) {
        const subKey = sub.name.toLowerCase().trim();
        const matchedSubjects = subjectsByName.get(subKey);

        if (!matchedSubjects || matchedSubjects.length === 0) {
          log.push(`⚠ Subject "${sub.name}" not found in master data — skipped`);
          continue;
        }

        const subjectId = matchedSubjects[0].id;

        // Create course_module_subjects junction
        const { data: existingCms } = await supabase
          .from('course_module_subjects')
          .select('id')
          .eq('course_id', courseId)
          .eq('course_module_id', moduleId)
          .eq('subject_id', subjectId)
          .is('deleted_at', null)
          .maybeSingle();

        let cmsId: number;

        if (existingCms) {
          cmsId = existingCms.id;
          log.push(`Subject "${sub.name}" already linked to module — reusing`);
        } else {
          const { data: newCms, error: cmsErr } = await supabase
            .from('course_module_subjects')
            .insert({
              course_id: courseId,
              course_module_id: moduleId,
              subject_id: subjectId,
              is_active: true,
              created_by: userId,
            })
            .select()
            .single();

          if (cmsErr) {
            log.push(`⚠ Failed to link subject "${sub.name}": ${cmsErr.message}`);
            continue;
          }

          cmsId = newCms.id;
          log.push(`Linked subject: ${sub.name} → module ${mod.name}`);
        }

        // ── Process chapters in this subject ──
        for (const ch of sub.chapters) {
          const chKey = ch.name.toLowerCase().trim();
          const matchedChapters = chaptersByName.get(chKey);

          // Find chapter that belongs to this subject
          let chapterId: number | null = null;
          if (matchedChapters) {
            const exact = matchedChapters.find(c => c.subject_id === subjectId);
            if (exact) {
              chapterId = exact.id;
            } else {
              // Use first match if no subject-specific match
              chapterId = matchedChapters[0].id;
            }
          }

          if (!chapterId) {
            log.push(`⚠ Chapter "${ch.name}" not found in master data — skipped`);
            continue;
          }

          // Create course_chapters junction
          const { data: existingCc } = await supabase
            .from('course_chapters')
            .select('id')
            .eq('course_id', courseId)
            .eq('course_module_subject_id', cmsId)
            .eq('chapter_id', chapterId)
            .is('deleted_at', null)
            .maybeSingle();

          let ccId: number;

          if (existingCc) {
            ccId = existingCc.id;
            log.push(`Chapter "${ch.name}" already linked — reusing`);
          } else {
            const { data: newCc, error: ccErr } = await supabase
              .from('course_chapters')
              .insert({
                course_id: courseId,
                course_module_subject_id: cmsId,
                chapter_id: chapterId,
                is_free_trial: ch.is_free_trial,
                is_active: true,
                created_by: userId,
              })
              .select()
              .single();

            if (ccErr) {
              log.push(`⚠ Failed to link chapter "${ch.name}": ${ccErr.message}`);
              continue;
            }

            ccId = newCc.id;
            log.push(`Linked chapter: ${ch.name}${ch.is_free_trial ? ' (free trial)' : ''}`);
          }

          // ── Process topics in this chapter ──
          for (const tp of ch.topics) {
            const tpKey = tp.name.toLowerCase().trim();
            const matchedTopics = topicsByName.get(tpKey);

            let topicId: number | null = null;
            if (matchedTopics) {
              const exact = matchedTopics.find(t => t.chapter_id === chapterId);
              if (exact) {
                topicId = exact.id;
              } else {
                topicId = matchedTopics[0].id;
              }
            }

            if (!topicId) {
              log.push(`⚠ Topic "${tp.name}" not found in master data — skipped`);
              continue;
            }

            // Create course_chapter_topics junction
            const { data: existingCct } = await supabase
              .from('course_chapter_topics')
              .select('id')
              .eq('course_id', courseId)
              .eq('course_chapter_id', ccId)
              .eq('topic_id', topicId)
              .is('deleted_at', null)
              .maybeSingle();

            if (existingCct) {
              log.push(`Topic "${tp.name}" already linked — skipped`);
              continue;
            }

            const { error: cctErr } = await supabase
              .from('course_chapter_topics')
              .insert({
                course_id: courseId,
                course_chapter_id: ccId,
                topic_id: topicId,
                is_active: true,
                created_by: userId,
              });

            if (cctErr) {
              log.push(`⚠ Failed to link topic "${tp.name}": ${cctErr.message}`);
            } else {
              log.push(`Linked topic: ${tp.name}`);
            }
          }
        }
      }
    }

    // ── Done ──
    await clearCaches();

    logAdmin({
      actorId: userId,
      action: 'course_imported',
      targetType: 'course',
      targetId: courseId,
      targetName: result.course.code,
      changes: { summary: result.summary },
      ip: getClientIp(req),
    });

    return ok(res, {
      courseId,
      courseCode: result.course.code,
      courseName: result.course.name,
      summary: result.summary,
      log,
    }, 'Course imported successfully', 201);

  } catch (error: any) {
    return err(res, `Import failed: ${error.message}`, 500);
  }
}
