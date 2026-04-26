import { supabase } from '../config/supabase';

/**
 * Archive YouTube URLs before permanent deletion of sub-topics.
 * Stores the CDN hierarchy slugs so URLs can be re-linked on CDN re-import.
 *
 * @param subTopicIds - IDs of sub-topics about to be permanently deleted
 * @param archivedBy  - UUID of the admin performing the deletion
 */
export async function archiveYoutubeUrls(
  subTopicIds: number[],
  archivedBy?: string | number
): Promise<number> {
  if (subTopicIds.length === 0) return 0;

  // Fetch sub-topics that have a YouTube URL, along with the full slug hierarchy
  const { data: ytSubTopics } = await supabase
    .from('sub_topics')
    .select(`
      id, slug, display_order, youtube_url, video_source,
      topics!inner(slug, chapters!inner(slug, subjects!inner(slug)))
    `)
    .in('id', subTopicIds)
    .not('youtube_url', 'is', null);

  if (!ytSubTopics || ytSubTopics.length === 0) return 0;

  const rows = ytSubTopics.map((st: any) => ({
    subject_slug: st.topics.chapters.subjects.slug,
    chapter_slug: st.topics.chapters.slug,
    topic_slug: st.topics.slug,
    sub_topic_slug: st.slug,
    sub_topic_display_order: st.display_order,
    youtube_url: st.youtube_url,
    video_source: st.video_source || 'youtube',
    archived_by: archivedBy ?? null,
  }));

  // Deduplicate: remove existing unrestored entries for the same sub-topic slugs
  // before inserting new ones, preventing duplicate archive rows
  for (const row of rows) {
    await supabase
      .from('youtube_url_archive')
      .delete()
      .eq('subject_slug', row.subject_slug)
      .eq('chapter_slug', row.chapter_slug)
      .eq('topic_slug', row.topic_slug)
      .eq('sub_topic_slug', row.sub_topic_slug)
      .is('restored_at', null);
  }

  const { error } = await supabase.from('youtube_url_archive').insert(rows);
  if (error) {
    console.error('Failed to archive YouTube URLs:', error);
    return 0;
  }

  console.log(`[YouTubeArchive] Archived ${rows.length} YouTube URL(s) before permanent delete`);
  return rows.length;
}

/**
 * Look up archived YouTube URLs for a given topic hierarchy.
 * Used during CDN import to re-link YouTube URLs to newly created sub-topics.
 *
 * @returns Array of archived entries that haven't been restored yet
 */
export async function getArchivedYoutubeUrls(
  subjectSlug: string,
  chapterSlug: string,
  topicSlug: string
): Promise<Array<{
  id: number;
  sub_topic_slug: string;
  sub_topic_display_order: number;
  youtube_url: string;
  video_source: string;
}>> {
  const { data, error } = await supabase
    .from('youtube_url_archive')
    .select('id, sub_topic_slug, sub_topic_display_order, youtube_url, video_source')
    .eq('subject_slug', subjectSlug)
    .eq('chapter_slug', chapterSlug)
    .eq('topic_slug', topicSlug)
    .is('restored_at', null);

  if (error) {
    console.error('Failed to fetch archived YouTube URLs:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark archived YouTube URLs as restored (so they won't be matched again).
 */
export async function markArchiveRestored(archiveIds: number[]): Promise<void> {
  if (archiveIds.length === 0) return;

  const { error } = await supabase
    .from('youtube_url_archive')
    .update({ restored_at: new Date().toISOString() })
    .in('id', archiveIds);

  if (error) {
    console.error('Failed to mark YouTube archive entries as restored:', error);
  }
}

/**
 * Delete ALL archive entries for a specific sub-topic (both restored and unrestored).
 * Called when a user explicitly removes a YouTube URL or changes it,
 * so that CDN re-imports won't resurrect a URL the user intentionally deleted
 * and old entries don't accumulate wasting database space.
 *
 * @param subTopicId - The sub-topic ID whose archive entries should be cleaned
 */
export async function deleteArchiveForSubTopic(subTopicId: number): Promise<void> {
  // Look up the sub-topic's full slug hierarchy
  const { data: st } = await supabase
    .from('sub_topics')
    .select(`
      slug,
      topics!inner(slug, chapters!inner(slug, subjects!inner(slug)))
    `)
    .eq('id', subTopicId)
    .single();

  if (!st) return;

  const subjectSlug = (st as any).topics.chapters.subjects.slug;
  const chapterSlug = (st as any).topics.chapters.slug;
  const topicSlug = (st as any).topics.slug;

  // Delete ALL entries (both restored and unrestored) to prevent DB bloat
  const { error, count } = await supabase
    .from('youtube_url_archive')
    .delete()
    .eq('subject_slug', subjectSlug)
    .eq('chapter_slug', chapterSlug)
    .eq('topic_slug', topicSlug)
    .eq('sub_topic_slug', st.slug);

  if (error) {
    console.error('Failed to delete archive entries for sub-topic:', error);
  } else if (count && count > 0) {
    console.log(`[YouTubeArchive] Cleaned ${count} archive entry(ies) for sub-topic "${st.slug}"`);
  }
}
