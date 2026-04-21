import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { deleteBunnyFolder } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { getClientIp } from '../../utils/helpers';
import { ok, err } from '../../utils/response';

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastChanged: string;
  children?: TreeNode[];
  dbId?: number;
  type?: 'subject' | 'chapter' | 'topic' | 'sub_topic' | 'language' | 'file';
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
      .select('id, slug, updated_at')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('slug');

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
    const [subjectsRes, chaptersRes, topicsRes, subTopicsRes, translationsRes, languagesRes] = await Promise.all([
      supabase.from('subjects').select('id, slug, created_at, updated_at').is('deleted_at', null).order('slug'),
      supabase.from('chapters').select('id, slug, subject_id, created_at, updated_at').is('deleted_at', null).order('slug'),
      supabase.from('topics').select('id, slug, chapter_id, created_at, updated_at').is('deleted_at', null).order('slug'),
      supabase.from('sub_topics').select('id, slug, topic_id, created_at, updated_at').is('deleted_at', null).order('slug'),
      supabase.from('sub_topic_translations').select('id, sub_topic_id, language_id, page, created_at, updated_at').is('deleted_at', null),
      supabase.from('languages').select('id, iso_code, name').eq('is_active', true).eq('for_material', true).order('id'),
    ]);

    const subjects = subjectsRes.data || [];
    const chapters = chaptersRes.data || [];
    const topics = topicsRes.data || [];
    const subTopics = subTopicsRes.data || [];
    const translations = translationsRes.data || [];
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

          const subTopicNodes: TreeNode[] = topicSubTopics.map(subTopic => {
            const subTopicPath = `${topicPath}/${subTopic.slug}`;
            const stTranslations = translationsBySubTopic.get(subTopic.id) || [];

            // Group files by language under each sub-topic
            const langFileNodes: TreeNode[] = [];
            for (const tr of stTranslations) {
              const lang = langMap.get(tr.language_id);
              if (!lang) continue;
              totalTranslations++;
              if (tr.page) {
                // Extract filename from URL
                const urlParts = (tr.page as string).split('/');
                const fileName = urlParts[urlParts.length - 1] || `${lang.iso_code}.html`;
                totalFiles++;
                langFileNodes.push({
                  name: `${lang.iso_code}/${fileName}`,
                  path: tr.page,
                  isDirectory: false,
                  size: 0,
                  lastChanged: tr.updated_at || tr.created_at || '',
                  dbId: tr.id,
                  type: 'file',
                });
              }
            }

            totalFolders++;
            return {
              name: subTopic.slug,
              path: subTopicPath,
              isDirectory: true,
              size: 0,
              lastChanged: subTopic.updated_at || subTopic.created_at || '',
              children: langFileNodes,
              dbId: subTopic.id,
              type: 'sub_topic' as const,
            };
          });

          totalFolders++;
          return {
            name: topic.slug,
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
          name: chapter.slug,
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
        name: subject.slug,
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
        subjects: subjects.length, chapters: chapters.length, topics: topics.length, subTopics: subTopics.length },
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
