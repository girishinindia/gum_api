/**
 * Material Matcher Service
 * Checks whether subjects, chapters, topics, or sub-topics already exist in the database.
 * Used by the import-material-tree feature to skip existing items.
 */

import { supabase } from '../config/supabase';
import { toSlug } from '../utils/helpers';

export interface MatchResult {
  found: boolean;
  id?: number;
  slug?: string;
}

/**
 * Try to match a subject by code (case-insensitive) or slug.
 */
export async function matchSubject(name: string): Promise<MatchResult> {
  const slug = toSlug(name);

  // Try matching by code (case-insensitive)
  const { data: byCode } = await supabase
    .from('subjects')
    .select('id, slug, code')
    .ilike('code', name.trim())
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (byCode) return { found: true, id: byCode.id, slug: byCode.slug };

  // Try matching by slug
  const { data: bySlug } = await supabase
    .from('subjects')
    .select('id, slug, code')
    .eq('slug', slug)
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (bySlug) return { found: true, id: bySlug.id, slug: bySlug.slug };

  return { found: false };
}

/**
 * Try to match a chapter by slug within a parent subject.
 */
export async function matchChapter(name: string, subjectId: number): Promise<MatchResult> {
  const slug = toSlug(name);

  const { data } = await supabase
    .from('chapters')
    .select('id, slug')
    .eq('subject_id', subjectId)
    .eq('slug', slug)
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (data) return { found: true, id: data.id, slug: data.slug };

  // Also try matching by name similarity (slug of the name)
  // Fetch all chapters for this subject and compare slugs
  const { data: allChapters } = await supabase
    .from('chapters')
    .select('id, slug')
    .eq('subject_id', subjectId)
    .is('deleted_at', null);

  if (allChapters) {
    for (const ch of allChapters) {
      if (ch.slug === slug || ch.slug === name.trim().toLowerCase()) {
        return { found: true, id: ch.id, slug: ch.slug };
      }
    }
  }

  return { found: false };
}

/**
 * Try to match a topic by slug within a parent chapter.
 */
export async function matchTopic(name: string, chapterId: number): Promise<MatchResult> {
  const slug = toSlug(name);

  const { data } = await supabase
    .from('topics')
    .select('id, slug')
    .eq('chapter_id', chapterId)
    .eq('slug', slug)
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (data) return { found: true, id: data.id, slug: data.slug };

  // Also try name-based match
  const { data: allTopics } = await supabase
    .from('topics')
    .select('id, slug')
    .eq('chapter_id', chapterId)
    .is('deleted_at', null);

  if (allTopics) {
    for (const t of allTopics) {
      if (t.slug === slug || t.slug === name.trim().toLowerCase()) {
        return { found: true, id: t.id, slug: t.slug };
      }
    }
  }

  return { found: false };
}

/**
 * Try to match a sub-topic by slug within a parent topic.
 */
export async function matchSubTopic(name: string, topicId: number): Promise<MatchResult> {
  const slug = toSlug(name);

  const { data } = await supabase
    .from('sub_topics')
    .select('id, slug')
    .eq('topic_id', topicId)
    .eq('slug', slug)
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (data) return { found: true, id: data.id, slug: data.slug };

  // Also try name-based match
  const { data: allSubTopics } = await supabase
    .from('sub_topics')
    .select('id, slug')
    .eq('topic_id', topicId)
    .is('deleted_at', null);

  if (allSubTopics) {
    for (const st of allSubTopics) {
      if (st.slug === slug || st.slug === name.trim().toLowerCase()) {
        return { found: true, id: st.id, slug: st.slug };
      }
    }
  }

  return { found: false };
}
