import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { deleteBunnyFolder, listBunnyStorage, downloadBunnyFile, uploadRawFile } from '../../services/storage.service';
import { uploadToBunny, deleteFromBunny } from '../../config/bunny';
import { listAllStreamCollections, deleteStreamCollection } from '../../services/video.service';
import { logAdmin } from '../../services/activityLog.service';
import { getClientIp } from '../../utils/helpers';
import { ok, err } from '../../utils/response';
import { config } from '../../config';
import { buildCourseFolderName, buildCdnName } from '../../utils/courseParser';
import { fetchAll } from '../../utils/supabaseFetchAll';

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastChanged: string;
  children?: TreeNode[];
  dbId?: number;
  type?: 'subject' | 'chapter' | 'topic' | 'sub_topic' | 'language' | 'resources' | 'file';
  videoId?: string;
  videoStatus?: string;
  videoUrl?: string;
  videoSource?: string;
  youtubeUrl?: string;
  fileCount?: number;
}

/**
 * GET /material-tree?path=materials
 * Lists items at a specific path — kept for backward compat but now uses DB.
 */
export async function list(req: Request, res: Response) {
  try {
    // Return top-level subjects as folders
    const { data: subjects } = await supabase
      .from('subjects')
      .select('id, code, slug, display_order, updated_at')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('display_order');

    const nodes: TreeNode[] = (subjects || []).map(s => ({
      name: s.slug,
      path: `materials/${s.slug}`,
      isDirectory: true,
      size: 0,
      lastChanged: s.updated_at || '',
      dbId: s.id,
      type: 'subject' as const,
    }));

    return ok(res, nodes);
  } catch (e: any) {
    return err(res, e.message || 'Failed to list materials', 500);
  }
}

/**
 * GET /material-tree/full
 * Builds the full material tree from the database — instant, no Bunny API calls.
 * Hierarchy: Subject → Chapter → Topic → Sub-Topic → Language (files)
 */
export async function fullTree(req: Request, res: Response) {
  try {
    // Fetch all data in parallel — 6 fast DB queries instead of hundreds of CDN calls
    const [subjectsRes, chaptersRes, topicsRes, subTopics, translations, languagesRes] = await Promise.all([
      supabase.from('subjects').select('id, code, slug, display_order, created_at, updated_at').is('deleted_at', null).order('display_order'),
      supabase.from('chapters').select('id, slug, subject_id, display_order, created_at, updated_at').is('deleted_at', null).order('display_order'),
      supabase.from('topics').select('id, slug, chapter_id, display_order, created_at, updated_at').is('deleted_at', null).order('display_order'),
      fetchAll('sub_topics', 'id, slug, topic_id, display_order, video_id, video_status, video_url, video_source, youtube_url, created_at, updated_at', {
        filters: q => q.is('deleted_at', null),
        order: 'display_order',
      }),
      fetchAll('sub_topic_translations', 'id, sub_topic_id, language_id, page, created_at, updated_at', {
        filters: q => q.is('deleted_at', null),
      }),
      supabase.from('languages').select('id, iso_code, name').eq('is_active', true).eq('for_material', true).order('id'),
    ]);

    const subjects = subjectsRes.data || [];
    const chapters = chaptersRes.data || [];
    const topics = topicsRes.data || [];
    const languages = languagesRes.data || [];

    // Build lookup maps for fast grouping
    const langMap = new Map(languages.map(l => [l.id, l]));
    const chaptersBySubject = new Map<number, typeof chapters>();
    for (const c of chapters) {
      const arr = chaptersBySubject.get(c.subject_id) || [];
      arr.push(c);
      chaptersBySubject.set(c.subject_id, arr);
    }
    const topicsByChapter = new Map<number, typeof topics>();
    for (const t of topics) {
      const arr = topicsByChapter.get(t.chapter_id) || [];
      arr.push(t);
      topicsByChapter.set(t.chapter_id, arr);
    }
    const subTopicsByTopic = new Map<number, typeof subTopics>();
    for (const st of subTopics) {
      const arr = subTopicsByTopic.get(st.topic_id) || [];
      arr.push(st);
      subTopicsByTopic.set(st.topic_id, arr);
    }
    const translationsBySubTopic = new Map<number, typeof translations>();
    for (const tr of translations) {
      const arr = translationsBySubTopic.get(tr.sub_topic_id) || [];
      arr.push(tr);
      translationsBySubTopic.set(tr.sub_topic_id, arr);
    }

    let totalFolders = 0;
    let totalFiles = 0;
    let totalSize = 0;
    let totalTranslations = 0;

    // Helper: format display name with order number
    const displayName = (slug: string, order?: number) => order ? `${order}. ${slug}` : slug;

    // Build tree
    const tree: TreeNode[] = subjects.map(subject => {
      const subjectPath = `materials/${subject.slug}`;
      const subjectChapters = chaptersBySubject.get(subject.id) || [];

      const chapterNodes: TreeNode[] = subjectChapters.map(chapter => {
        const chapterPath = `${subjectPath}/${chapter.slug}`;
        const chapterTopics = topicsByChapter.get(chapter.id) || [];

        const topicNodes: TreeNode[] = chapterTopics.map(topic => {
          const topicPath = `${chapterPath}/${topic.slug}`;
          const topicSubTopics = subTopicsByTopic.get(topic.id) || [];

          // Build sub-topic nodes — each sub-topic gets its own language folders + resources
          const subTopicNodes: TreeNode[] = topicSubTopics.map(subTopic => {
            const subTopicPath = `${topicPath}/${subTopic.slug}`;
            const stTranslations = translationsBySubTopic.get(subTopic.id) || [];

            // Group this sub-topic's translations by language
            const langFilesMap = new Map<number, { lang: typeof languages[0]; files: { name: string; path: string; lastChanged: string; dbId: number }[] }>();
            const langHasTranslation = new Set<number>(); // track languages that have a translation record

            for (const tr of stTranslations) {
              const lang = langMap.get(tr.language_id);
              if (!lang) continue;
              totalTranslations++;
              langHasTranslation.add(lang.id);
              if (tr.page) {
                const urlParts = (tr.page as string).split('/');
                const fileName = urlParts[urlParts.length - 1] || `${subTopic.slug}.html`;
                totalFiles++;
                const entry = langFilesMap.get(lang.id) || { lang, files: [] };
                entry.files.push({
                  name: fileName,
                  path: tr.page,
                  lastChanged: tr.updated_at || tr.created_at || '',
                  dbId: tr.id,
                });
                langFilesMap.set(lang.id, entry);
              }
            }

            // Build language folder nodes for this sub-topic
            // Show ALL languages that have a translation record (even if no page file uploaded yet)
            const langFolderNodes: TreeNode[] = [];
            for (const lang of languages) {
              if (!langHasTranslation.has(lang.id)) continue; // no translation record at all
              const langPath = `${subTopicPath}/${lang.iso_code}`;
              const entry = langFilesMap.get(lang.id);
              const files = entry?.files || [];
              totalFolders++;
              langFolderNodes.push({
                name: lang.iso_code,
                path: langPath,
                isDirectory: true,
                size: 0,
                lastChanged: files[0]?.lastChanged || '',
                children: files.map(f => ({
                  name: f.name,
                  path: f.path,
                  isDirectory: false,
                  size: 0,
                  lastChanged: f.lastChanged,
                  dbId: f.dbId,
                  type: 'file' as const,
                })),
                fileCount: files.length,
                type: 'language' as const,
              });
            }

            // Resources folder for this sub-topic
            const resourcesPath = `${subTopicPath}/resources`;
            totalFolders++;
            const subTopicChildren: TreeNode[] = [
              {
                name: 'resources',
                path: resourcesPath,
                isDirectory: true,
                size: 0,
                lastChanged: subTopic.updated_at || subTopic.created_at || '',
                children: [],
                type: 'resources' as const,
              },
              ...langFolderNodes,
            ];

            totalFolders++;
            return {
              name: displayName(subTopic.slug, subTopic.display_order),
              path: subTopicPath,
              isDirectory: true,
              size: 0,
              lastChanged: subTopic.updated_at || subTopic.created_at || '',
              children: subTopicChildren,
              dbId: subTopic.id,
              type: 'sub_topic' as const,
              videoId: subTopic.video_id || undefined,
              videoStatus: subTopic.video_status || undefined,
              videoUrl: subTopic.video_url || undefined,
              videoSource: subTopic.video_source || undefined,
              youtubeUrl: subTopic.youtube_url || undefined,
            } as TreeNode;
          });

          totalFolders++;
          return {
            name: displayName(topic.slug, topic.display_order),
            path: topicPath,
            isDirectory: true,
            size: 0,
            lastChanged: topic.updated_at || topic.created_at || '',
            children: subTopicNodes,
            dbId: topic.id,
            type: 'topic' as const,
          };
        });

        totalFolders++;
        return {
          name: displayName(chapter.slug, chapter.display_order),
          path: chapterPath,
          isDirectory: true,
          size: 0,
          lastChanged: chapter.updated_at || chapter.created_at || '',
          children: topicNodes,
          dbId: chapter.id,
          type: 'chapter' as const,
        };
      });

      totalFolders++;
      return {
        name: subject.code || subject.slug,
        path: subjectPath,
        isDirectory: true,
        size: 0,
        lastChanged: subject.updated_at || subject.created_at || '',
        children: chapterNodes,
        dbId: subject.id,
        type: 'subject' as const,
      };
    });

    return ok(res, {
      tree,
      stats: { totalFolders, totalFiles, totalSize, totalTranslations,
        expectedTranslations: subTopics.length * languages.length,
        expectedFiles: subTopics.length * languages.length,
        subjects: subjects.length, chapters: chapters.length, topics: topics.length, subTopics: subTopics.length,
        materialLanguages: languages.length },
    });
  } catch (e: any) {
    console.error('Material tree error:', e);
    return err(res, e.message || 'Failed to build material tree', 500);
  }
}

/**
 * DELETE /material-tree/folder
 * Deletes a folder (and all its contents) from Bunny storage.
 * Body: { path: "materials/css3" }
 */
export async function deleteFolder(req: Request, res: Response) {
  const { path: folderPath } = req.body;
  if (!folderPath) return err(res, 'path is required', 400);

  // Safety: only allow deletion within materials/ folder
  const normalized = (folderPath as string).replace(/\/+$/, '');
  if (!normalized.startsWith('materials/')) {
    return err(res, 'Can only delete folders within materials/', 403);
  }

  try {
    await deleteBunnyFolder(normalized);

    logAdmin({
      actorId: req.user!.id,
      action: 'media_deleted',
      targetType: 'bunny_folder',
      targetId: 0,
      targetName: normalized,
      ip: getClientIp(req),
    });

    return ok(res, null, `Folder "${normalized}" deleted successfully`);
  } catch (e: any) {
    return err(res, e.message || 'Failed to delete folder', 500);
  }
}

// ─── Script 1: Fix Orphaned Sub-Topic Folders ────────────────────────────
/**
 * POST /material-tree/fix-orphaned-subtopic-folders
 *
 * Problem: Old code created CDN paths like:
 *   materials/{subject}/{chapter}/{topic}/{sub-topic-slug}/{lang}/file.html
 * Correct structure is:
 *   materials/{subject}/{chapter}/{topic}/{lang}/file.html
 *
 * This endpoint:
 * 1. Scans all topics on CDN for sub-folders that match a sub-topic slug
 * 2. Moves any files found inside those sub-topic folders up to the topic/lang/ level
 * 3. Updates sub_topic_translations.page URLs in Supabase
 * 4. Deletes the now-empty orphaned sub-topic folders
 *
 * Query params:
 *   ?dry_run=true  — preview what would change without modifying anything (default: true)
 */
export async function fixOrphanedSubtopicFolders(req: Request, res: Response) {
  const dryRun = req.query.dry_run !== 'false'; // default to dry run for safety
  const log: string[] = [];
  const moved: { from: string; to: string; dbId?: number }[] = [];
  const errors: string[] = [];

  try {
    // 1. Fetch all sub-topic slugs from DB so we can identify orphaned folders
    const { data: subTopics } = await supabase
      .from('sub_topics')
      .select('id, slug, topic_id, topics!inner(id, slug, chapter_id, chapters!inner(id, slug, subject_id, subjects!inner(id, slug)))')
      .is('deleted_at', null);

    if (!subTopics || subTopics.length === 0) {
      return ok(res, { log: ['No sub-topics found in database'], moved: [], errors: [] });
    }

    // Build a set of all sub-topic slugs for quick lookup
    const subTopicSlugSet = new Set(subTopics.map((st: any) => st.slug));

    // Build a map: "subjectSlug/chapterSlug/topicSlug/subTopicSlug" → sub-topic record
    const pathToSubTopic = new Map<string, any>();
    for (const st of subTopics) {
      const t = (st as any).topics;
      const c = t?.chapters;
      const s = c?.subjects;
      if (s?.slug && c?.slug && t?.slug && st.slug) {
        pathToSubTopic.set(`${s.slug}/${c.slug}/${t.slug}/${st.slug}`, st);
      }
    }

    // 2. Get all subjects from CDN
    let cdnSubjects: any[];
    try {
      cdnSubjects = await listBunnyStorage('materials');
    } catch {
      return err(res, 'Failed to list materials/ from CDN', 500);
    }

    // 3. Walk the CDN tree: materials/{subject}/{chapter}/{topic}/ and look for sub-topic slug folders
    for (const subjectDir of cdnSubjects) {
      if (!subjectDir.IsDirectory) continue;
      const subjectSlug = subjectDir.ObjectName.replace(/\/$/, '');

      let chapters: any[];
      try { chapters = await listBunnyStorage(`materials/${subjectSlug}`); } catch { continue; }

      for (const chapterDir of chapters) {
        if (!chapterDir.IsDirectory) continue;
        const chapterSlug = chapterDir.ObjectName.replace(/\/$/, '');

        let topics: any[];
        try { topics = await listBunnyStorage(`materials/${subjectSlug}/${chapterSlug}`); } catch { continue; }

        for (const topicDir of topics) {
          if (!topicDir.IsDirectory) continue;
          const topicSlug = topicDir.ObjectName.replace(/\/$/, '');
          const topicPath = `materials/${subjectSlug}/${chapterSlug}/${topicSlug}`;

          // List contents of this topic folder
          let topicContents: any[];
          try { topicContents = await listBunnyStorage(topicPath); } catch { continue; }

          // Check each item — if it's a directory and matches a sub-topic slug, it's orphaned
          for (const item of topicContents) {
            if (!item.IsDirectory) continue;
            const folderName = item.ObjectName.replace(/\/$/, '');

            // Skip known valid folders (language iso codes like en, gu, hi, mr, resources)
            if (['en', 'gu', 'hi', 'mr', 'resources', '.folder'].includes(folderName)) continue;

            // Check if this folder name matches any sub-topic slug
            const pathKey = `${subjectSlug}/${chapterSlug}/${topicSlug}/${folderName}`;
            const matchedSubTopic = pathToSubTopic.get(pathKey);

            if (matchedSubTopic || subTopicSlugSet.has(folderName)) {
              log.push(`Found orphaned sub-topic folder: ${topicPath}/${folderName}/`);

              // List language folders inside this sub-topic folder
              const subTopicFolderPath = `${topicPath}/${folderName}`;
              let langFolders: any[];
              try { langFolders = await listBunnyStorage(subTopicFolderPath); } catch { continue; }

              for (const langDir of langFolders) {
                if (!langDir.IsDirectory) continue;
                const langCode = langDir.ObjectName.replace(/\/$/, '');
                if (langCode === '.folder') continue;

                // List files inside the language folder
                const langPath = `${subTopicFolderPath}/${langCode}`;
                let files: any[];
                try { files = await listBunnyStorage(langPath); } catch { continue; }

                for (const file of files) {
                  if (file.IsDirectory || file.ObjectName === '.folder') continue;
                  const fileName = file.ObjectName;
                  const oldPath = `${langPath}/${fileName}`;
                  const newPath = `${topicPath}/${langCode}/${fileName}`;
                  const newCdnUrl = `${config.bunny.cdnUrl}/${newPath}`;

                  log.push(`  Move: ${oldPath} → ${newPath}`);

                  if (!dryRun) {
                    try {
                      // Download file from old location
                      const fileUrl = `${config.bunny.storageUrl}/${config.bunny.storageZone}/${oldPath}`;
                      const fileRes = await fetch(fileUrl, {
                        method: 'GET',
                        headers: { AccessKey: config.bunny.storageKey },
                      });
                      if (!fileRes.ok) {
                        errors.push(`Failed to download ${oldPath}: ${fileRes.status}`);
                        continue;
                      }
                      const buffer = Buffer.from(await fileRes.arrayBuffer());

                      // Upload to new location
                      await uploadToBunny(newPath, buffer);

                      // Delete from old location
                      await deleteFromBunny(oldPath);

                      // Update DB: find matching sub_topic_translation and update page URL
                      if (matchedSubTopic) {
                        const { data: lang } = await supabase.from('languages').select('id').eq('iso_code', langCode).single();
                        if (lang) {
                          const { data: updated } = await supabase
                            .from('sub_topic_translations')
                            .update({ page: newCdnUrl })
                            .eq('sub_topic_id', matchedSubTopic.id)
                            .eq('language_id', lang.id)
                            .is('deleted_at', null)
                            .select('id')
                            .single();
                          moved.push({ from: oldPath, to: newPath, dbId: updated?.id });
                          log.push(`  DB updated: sub_topic_translation ${updated?.id || '?'} → ${newCdnUrl}`);
                        }
                      } else {
                        moved.push({ from: oldPath, to: newPath });
                      }
                    } catch (moveErr: any) {
                      errors.push(`Failed to move ${oldPath}: ${moveErr.message}`);
                    }
                  } else {
                    moved.push({ from: oldPath, to: newPath });
                  }
                }
              }

              // Delete the orphaned sub-topic folder (if not dry run and all files moved)
              if (!dryRun) {
                try {
                  await deleteBunnyFolder(subTopicFolderPath);
                  log.push(`  Deleted orphaned folder: ${subTopicFolderPath}/`);
                } catch (delErr: any) {
                  errors.push(`Failed to delete folder ${subTopicFolderPath}: ${delErr.message}`);
                }
              }
            }
          }
        }
      }
    }

    if (moved.length === 0) {
      log.push('No orphaned sub-topic folders found — CDN is clean.');
    }

    if (!dryRun) {
      logAdmin({
        actorId: req.user!.id,
        action: 'cdn_fix_orphaned_subtopic_folders',
        targetType: 'cdn',
        targetId: 0,
        targetName: `${moved.length} files moved`,
        changes: { moved: moved.length, errors: errors.length },
        ip: getClientIp(req),
      });
    }

    return ok(res, {
      dryRun,
      summary: `${moved.length} file(s) ${dryRun ? 'would be' : ''} moved, ${errors.length} error(s)`,
      log,
      moved,
      errors,
    });
  } catch (e: any) {
    console.error('Fix orphaned sub-topic folders failed:', e);
    return err(res, e.message || 'Failed to fix orphaned sub-topic folders', 500);
  }
}

// ─── Script 2: Reconcile PascalCase ↔ Slug Folder Names ─────────────────
/**
 * POST /material-tree/reconcile-folder-names
 *
 * Problem: Old scaffoldCdn created PascalCase folders like:
 *   materials/C_Programming/01_Introduction_to_C_Programming/
 * But DB slugs are lowercase:
 *   materials/c-programming/introduction-to-c-programming/
 *
 * This endpoint:
 * 1. Lists all top-level CDN folders under materials/
 * 2. Compares each folder name against DB subject slugs
 * 3. If a CDN folder doesn't match any DB slug but a "similar" slug exists
 *    (case-insensitive, underscore↔hyphen normalization), it moves the files
 * 4. Updates any sub_topic_translations.page URLs that reference old paths
 *
 * Query params:
 *   ?dry_run=true  — preview what would change without modifying anything (default: true)
 */
export async function reconcileFolderNames(req: Request, res: Response) {
  const dryRun = req.query.dry_run !== 'false';
  const log: string[] = [];
  const renames: { oldPath: string; newPath: string; level: string }[] = [];
  const dbUpdates: { id: number; oldUrl: string; newUrl: string }[] = [];
  const errors: string[] = [];

  // Normalize a folder name for comparison: lowercase, replace underscores with hyphens, strip leading numbers
  const normalize = (name: string) => name.toLowerCase().replace(/_/g, '-').replace(/^\d+-/, '');

  try {
    // 1. Fetch full DB hierarchy
    const [subjectsRes, chaptersRes, topicsRes] = await Promise.all([
      supabase.from('subjects').select('id, slug').is('deleted_at', null),
      supabase.from('chapters').select('id, slug, subject_id').is('deleted_at', null),
      supabase.from('topics').select('id, slug, chapter_id').is('deleted_at', null),
    ]);

    const subjects = subjectsRes.data || [];
    const chapters = chaptersRes.data || [];
    const topics = topicsRes.data || [];

    // Build normalized lookup maps
    const subjectSlugMap = new Map(subjects.map(s => [normalize(s.slug), s.slug]));
    const chaptersBySubject = new Map<number, typeof chapters>();
    for (const c of chapters) {
      const arr = chaptersBySubject.get(c.subject_id) || [];
      arr.push(c);
      chaptersBySubject.set(c.subject_id, arr);
    }
    const topicsByChapter = new Map<number, typeof topics>();
    for (const t of topics) {
      const arr = topicsByChapter.get(t.chapter_id) || [];
      arr.push(t);
      topicsByChapter.set(t.chapter_id, arr);
    }

    // 2. List CDN materials/ root
    let cdnSubjects: any[];
    try { cdnSubjects = await listBunnyStorage('materials'); } catch {
      return err(res, 'Failed to list materials/ from CDN', 500);
    }

    // 3. Walk the CDN tree and find mismatched names
    for (const subjectDir of cdnSubjects) {
      if (!subjectDir.IsDirectory) continue;
      const cdnSubjectName = subjectDir.ObjectName.replace(/\/$/, '');
      if (cdnSubjectName === '.folder') continue;

      // Check if this CDN name is already a valid DB slug
      const exactSubject = subjects.find(s => s.slug === cdnSubjectName);
      if (exactSubject) {
        // Exact match — recurse into chapters
        await reconcileChapterLevel(exactSubject, cdnSubjectName);
        continue;
      }

      // Try normalized match
      const normalizedCdn = normalize(cdnSubjectName);
      const matchedSlug = subjectSlugMap.get(normalizedCdn);
      if (!matchedSlug) {
        log.push(`⚠ CDN folder "materials/${cdnSubjectName}" has no DB slug match (normalized: ${normalizedCdn})`);
        continue;
      }

      const matchedSubject = subjects.find(s => s.slug === matchedSlug)!;
      log.push(`Subject rename: materials/${cdnSubjectName}/ → materials/${matchedSlug}/`);

      // Recursively move all files from old path to new path
      await moveFolder(`materials/${cdnSubjectName}`, `materials/${matchedSlug}`);

      // Also recurse into chapter level under the NEW path
      await reconcileChapterLevel(matchedSubject, matchedSlug);
    }

    // 4. Update all sub_topic_translations.page URLs that reference old paths
    if (!dryRun && renames.length > 0) {
      // Fetch all translations with page URLs
      const { data: allTranslations } = await supabase
        .from('sub_topic_translations')
        .select('id, page')
        .not('page', 'is', null)
        .is('deleted_at', null);

      if (allTranslations) {
        for (const tr of allTranslations) {
          let updated = tr.page as string;
          for (const rename of renames) {
            const oldCdnPath = `${config.bunny.cdnUrl}/${rename.oldPath}`;
            const newCdnPath = `${config.bunny.cdnUrl}/${rename.newPath}`;
            if (updated.includes(oldCdnPath)) {
              updated = updated.replace(oldCdnPath, newCdnPath);
            }
            // Also check path fragments (without CDN prefix)
            if (updated.includes(rename.oldPath)) {
              updated = updated.replace(rename.oldPath, rename.newPath);
            }
          }
          if (updated !== tr.page) {
            const { error: updateErr } = await supabase
              .from('sub_topic_translations')
              .update({ page: updated })
              .eq('id', tr.id);
            if (!updateErr) {
              dbUpdates.push({ id: tr.id, oldUrl: tr.page, newUrl: updated });
              log.push(`DB update: translation ${tr.id} page URL updated`);
            } else {
              errors.push(`Failed to update translation ${tr.id}: ${updateErr.message}`);
            }
          }
        }
      }
    }

    if (renames.length === 0) {
      log.push('No folder name mismatches found — all CDN folders match DB slugs.');
    }

    if (!dryRun && renames.length > 0) {
      logAdmin({
        actorId: req.user!.id,
        action: 'cdn_reconcile_folder_names',
        targetType: 'cdn',
        targetId: 0,
        targetName: `${renames.length} folders reconciled`,
        changes: { renames: renames.length, dbUpdates: dbUpdates.length, errors: errors.length },
        ip: getClientIp(req),
      });
    }

    return ok(res, {
      dryRun,
      summary: `${renames.length} folder(s) ${dryRun ? 'would be' : ''} renamed, ${dbUpdates.length} DB URL(s) updated, ${errors.length} error(s)`,
      log,
      renames,
      dbUpdates,
      errors,
    });

    // ── Helper: recursively move all files from oldDir to newDir ──
    async function moveFolder(oldDir: string, newDir: string) {
      let items: any[];
      try { items = await listBunnyStorage(oldDir); } catch { return; }

      for (const item of items) {
        const name = item.ObjectName.replace(/\/$/, '');
        if (name === '.folder') continue;

        if (item.IsDirectory) {
          await moveFolder(`${oldDir}/${name}`, `${newDir}/${name}`);
        } else {
          const oldFilePath = `${oldDir}/${name}`;
          const newFilePath = `${newDir}/${name}`;
          renames.push({ oldPath: oldFilePath, newPath: newFilePath, level: 'file' });

          if (!dryRun) {
            try {
              const fileUrl = `${config.bunny.storageUrl}/${config.bunny.storageZone}/${oldFilePath}`;
              const fileRes = await fetch(fileUrl, {
                method: 'GET',
                headers: { AccessKey: config.bunny.storageKey },
              });
              if (!fileRes.ok) {
                errors.push(`Download failed: ${oldFilePath} (${fileRes.status})`);
                continue;
              }
              const buffer = Buffer.from(await fileRes.arrayBuffer());
              await uploadToBunny(newFilePath, buffer);
              await deleteFromBunny(oldFilePath);
            } catch (e: any) {
              errors.push(`Move failed: ${oldFilePath} → ${newFilePath}: ${e.message}`);
            }
          }
        }
      }

      // Delete old directory after moving all contents
      if (!dryRun) {
        try { await deleteBunnyFolder(oldDir); } catch {}
      }
    }

    // ── Helper: reconcile chapter-level folders ──
    async function reconcileChapterLevel(subject: { id: number; slug: string }, cdnSubjectName: string) {
      const subjectChapters = chaptersBySubject.get(subject.id) || [];
      if (subjectChapters.length === 0) return;

      const chapterSlugMap = new Map(subjectChapters.map(c => [normalize(c.slug), c]));

      let cdnChapters: any[];
      try { cdnChapters = await listBunnyStorage(`materials/${cdnSubjectName}`); } catch { return; }

      for (const chapterDir of cdnChapters) {
        if (!chapterDir.IsDirectory) continue;
        const cdnChapterName = chapterDir.ObjectName.replace(/\/$/, '');
        if (cdnChapterName === '.folder') continue;

        const exactChapter = subjectChapters.find(c => c.slug === cdnChapterName);
        if (exactChapter) {
          // Exact match — recurse into topics
          await reconcileTopicLevel(subject, exactChapter, cdnSubjectName, cdnChapterName);
          continue;
        }

        const normalizedCdn = normalize(cdnChapterName);
        const matchedChapter = chapterSlugMap.get(normalizedCdn);
        if (!matchedChapter) {
          log.push(`⚠ CDN folder "materials/${cdnSubjectName}/${cdnChapterName}" has no DB match`);
          continue;
        }

        log.push(`Chapter rename: materials/${cdnSubjectName}/${cdnChapterName}/ → materials/${subject.slug}/${matchedChapter.slug}/`);
        await moveFolder(`materials/${cdnSubjectName}/${cdnChapterName}`, `materials/${subject.slug}/${matchedChapter.slug}`);

        // Recurse into topics under the new path
        await reconcileTopicLevel(subject, matchedChapter, subject.slug, matchedChapter.slug);
      }
    }

    // ── Helper: reconcile topic-level folders ──
    async function reconcileTopicLevel(
      subject: { id: number; slug: string },
      chapter: { id: number; slug: string },
      cdnSubjectName: string,
      cdnChapterName: string,
    ) {
      const chapterTopics = topicsByChapter.get(chapter.id) || [];
      if (chapterTopics.length === 0) return;

      const topicSlugMap = new Map(chapterTopics.map(t => [normalize(t.slug), t]));

      let cdnTopics: any[];
      try { cdnTopics = await listBunnyStorage(`materials/${cdnSubjectName}/${cdnChapterName}`); } catch { return; }

      for (const topicDir of cdnTopics) {
        if (!topicDir.IsDirectory) continue;
        const cdnTopicName = topicDir.ObjectName.replace(/\/$/, '');
        if (cdnTopicName === '.folder') continue;

        const exactTopic = chapterTopics.find(t => t.slug === cdnTopicName);
        if (exactTopic) continue; // Exact match, nothing to do

        const normalizedCdn = normalize(cdnTopicName);
        const matchedTopic = topicSlugMap.get(normalizedCdn);
        if (!matchedTopic) {
          log.push(`⚠ CDN folder "materials/${cdnSubjectName}/${cdnChapterName}/${cdnTopicName}" has no DB match`);
          continue;
        }

        log.push(`Topic rename: …/${cdnChapterName}/${cdnTopicName}/ → …/${chapter.slug}/${matchedTopic.slug}/`);
        await moveFolder(
          `materials/${cdnSubjectName}/${cdnChapterName}/${cdnTopicName}`,
          `materials/${subject.slug}/${chapter.slug}/${matchedTopic.slug}`,
        );
      }
    }
  } catch (e: any) {
    console.error('Reconcile folder names failed:', e);
    return err(res, e.message || 'Failed to reconcile folder names', 500);
  }
}

// ─── Clean Orphaned Stream Collections ─────────────────────────────
// POST /material-tree/clean-orphaned-collections?dry_run=true
// Lists all Bunny Stream collections, compares with DB subjects/chapters/topics,
// and deletes collections that don't match any active hierarchy.
export async function cleanOrphanedCollections(req: Request, res: Response) {
  const dryRun = req.query.dry_run !== 'false'; // default true
  try {
    // 1. Fetch all Stream collections
    const allCollections = await listAllStreamCollections();
    if (!allCollections.length) {
      return ok(res, { total: 0, orphaned: 0, deleted: 0, kept: 0 }, 'No collections found');
    }

    // 2. Fetch all active subjects with their chapter/topic hierarchy
    const { data: subjects } = await supabase
      .from('subjects')
      .select('id, name, slug, chapters(id, name, slug, display_order, topics(id, name, slug, display_order))')
      .is('deleted_at', null);

    // 3. Build a set of valid collection names from DB hierarchy
    // Current format: "C_Programming/01_Introduction_to_C/01_Getting_Started" (sanitized, topic-level only)
    // Also match old formats for backward compatibility
    const validNames = new Set<string>();
    for (const subject of (subjects || [])) {
      const cdnSubject = buildCourseFolderName(subject.name || subject.slug);

      // Subject-level (old format — kept for matching)
      validNames.add(subject.name);
      validNames.add(subject.slug);
      validNames.add(cdnSubject);

      const chapters = (subject as any).chapters || [];
      for (const chapter of chapters) {
        const cdnChapter = buildCdnName(chapter.display_order ?? 0, chapter.name);

        // Chapter-level (old formats)
        validNames.add(`${subject.name} > ${chapter.name}`);
        validNames.add(`${subject.slug} > ${chapter.slug}`);

        const topics = (chapter as any).topics || [];
        for (const topic of topics) {
          const cdnTopic = buildCdnName(topic.display_order ?? 0, topic.name);

          // Topic-level — old ">" format
          validNames.add(`${subject.name} > ${chapter.name} > ${topic.name}`);
          validNames.add(`${subject.slug} > ${chapter.slug} > ${topic.slug}`);
          // Topic-level — old "/" raw name format
          validNames.add(`${subject.name}/${chapter.name}/${topic.name}`);
          validNames.add(`${subject.slug}/${chapter.slug}/${topic.slug}`);
          // Topic-level — current sanitized CDN format (matches scaffold)
          validNames.add(`${cdnSubject}/${cdnChapter}/${cdnTopic}`);
        }
      }
    }

    // 4. Also fetch all video_ids from DB to keep collections that have assigned videos
    const { data: videoSubTopics } = await supabase
      .from('sub_topics')
      .select('video_id')
      .not('video_id', 'is', null)
      .is('deleted_at', null);
    const activeVideoIds = new Set((videoSubTopics || []).map(v => v.video_id));

    // 5. Identify orphaned collections
    const orphaned: { guid: string; name: string; videoCount: number }[] = [];
    const kept: { guid: string; name: string; reason: string }[] = [];

    for (const coll of allCollections) {
      if (validNames.has(coll.name)) {
        kept.push({ guid: coll.guid, name: coll.name, reason: 'matches DB hierarchy' });
      } else if (coll.videoCount > 0) {
        // Keep collections with videos even if name doesn't match — avoid data loss
        kept.push({ guid: coll.guid, name: coll.name, reason: `has ${coll.videoCount} videos` });
      } else {
        orphaned.push({ guid: coll.guid, name: coll.name, videoCount: coll.videoCount });
      }
    }

    // 6. Delete orphaned collections (or just report in dry run)
    let deleted = 0;
    const errors: string[] = [];
    if (!dryRun) {
      for (const coll of orphaned) {
        try {
          await deleteStreamCollection(coll.guid);
          deleted++;
        } catch (e: any) {
          errors.push(`Failed to delete "${coll.name}": ${e.message}`);
        }
      }
    }

    logAdmin({
      actorId: (req as any).user?.id,
      action: 'clean_orphaned_collections',
      targetType: 'cdn_import',
      targetId: 0,
      targetName: 'Clean Orphaned Stream Collections',
      ip: getClientIp(req),
      metadata: { dryRun, total: allCollections.length, orphaned: orphaned.length, deleted, kept: kept.length },
    });

    return ok(res, {
      dry_run: dryRun,
      total_collections: allCollections.length,
      orphaned_count: orphaned.length,
      deleted_count: deleted,
      kept_count: kept.length,
      orphaned: orphaned.slice(0, 50), // limit response size
      kept: kept.slice(0, 20),
      errors,
    }, dryRun
      ? `Dry run: found ${orphaned.length} orphaned collections out of ${allCollections.length} total`
      : `Deleted ${deleted} orphaned collections out of ${orphaned.length} found`
    );
  } catch (e: any) {
    console.error('Clean orphaned collections error:', e);
    return err(res, e.message || 'Failed to clean orphaned collections', 500);
  }
}
