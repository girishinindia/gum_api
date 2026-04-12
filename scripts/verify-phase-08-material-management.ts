/* eslint-disable no-console */
/**
 * Stage 8 — Phase-08 Material Management, live end-to-end verification.
 *
 * Tests all 4 hierarchical tables (subjects, chapters, topics, sub-topics)
 * and their translations through the complete lifecycle:
 *
 *   • Subjects → Chapters → Topics → Sub-Topics
 *   • Each with English + Hindi translations
 *   • Soft delete + restore with cascading effects
 *   • Translation-level delete/restore
 *
 * Coverage (matches the explicit ask for phase 08):
 *   § 1 — Subjects (base)        — create, list, get, update
 *   § 2 — Subject Translations    — create, get, update, cascade delete/restore
 *   § 3 — Chapters               — create under subject, with translation
 *   § 4 — Topics                 — create under chapter, with translation
 *   § 5 — Sub-Topics             — create under topic, with page_url translation
 *   § 6 — Soft Delete + Restore  — subjects cascade, get with deleted, list excludes
 *   § 7 — Translation Delete     — single translation delete/restore
 *   § 8 — Cleanup                — reverse-order hard delete
 *
 * Nothing is mocked — the script talks to the real database via services.
 * Bypasses global rate limiting via SKIP_GLOBAL_RATE_LIMIT env var.
 *
 * Targets ~50-60 assertions across all sections.
 */

process.env.SKIP_GLOBAL_RATE_LIMIT = '1';

import * as subjectsService from '../src/modules/subjects/subjects.service';
import * as chaptersService from '../src/modules/chapters/chapters.service';
import * as topicsService from '../src/modules/topics/topics.service';
import * as subTopicsService from '../src/modules/sub-topics/sub-topics.service';
import { getPool, closePool } from '../src/database/pg-pool';

// ─────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────

type Check = { section: string; name: string; ok: boolean; detail: string };
const results: Check[] = [];

const record = (section: string, name: string, ok: boolean, detail: string): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(60)} ${detail}`);
};

const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;

// IDs captured during creation
let subjectId: number | null = null;
let subjectTranslationIdEn: number | null = null;
let subjectTranslationIdHi: number | null = null;

let chapterId: number | null = null;
let chapterTranslationId: number | null = null;

let topicId: number | null = null;
let topicTranslationId: number | null = null;

let subTopicId: number | null = null;
let subTopicTranslationId: number | null = null;

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Stage 8 · Phase-08 Material Management verify (live) ━━');
  console.log(`  run id: ${RUN_ID}`);

  try {
    // ─── 1. Subjects (base) + first translation ─────────
    header('1. Subjects (base) — create + English translation');
    {
      // 1.a Create subject
      const createRes = await subjectsService.createSubject(
        {
          code: `SUBJ-VERIFY-${RUN_ID}`,
          difficultyLevel: 'beginner',
          estimatedHours: 100.0,
          displayOrder: 1,
          isActive: true
        },
        null
      );
      record(
        '1',
        'createSubject with code, difficulty, hours',
        typeof createRes.id === 'number' && createRes.id > 0,
        `id=${createRes.id}`
      );
      subjectId = createRes.id;

      // 1.b Create English translation (needed for list/get through translations view)
      const createEnRes = await subjectsService.createSubjectTranslation(
        subjectId,
        {
          languageId: 1,
          name: `Test Subject EN ${RUN_ID}`,
          shortIntro: 'English intro',
          metaTitle: 'English Meta Title'
        },
        null
      );
      record(
        '1',
        'createSubjectTranslation (English, lang_id=1)',
        typeof createEnRes.id === 'number' && createEnRes.id > 0,
        `id=${createEnRes.id}`
      );
      subjectTranslationIdEn = createEnRes.id;

      // 1.c List subjects (via translations view — requires at least one translation)
      const listRes = await subjectsService.listSubjects({
        pageIndex: 1,
        pageSize: 100,
        sortColumn: 'id',
        sortDirection: 'DESC'
      });
      record(
        '1',
        'listSubjects returns rows + meta',
        Array.isArray(listRes.rows) && typeof listRes.meta?.totalCount === 'number',
        `rows=${listRes.rows.length} total=${listRes.meta?.totalCount}`
      );

      // 1.d Get subject by ID (returns SubjectDto mapped from translations view)
      const getRes = await subjectsService.getSubjectById(subjectId!);
      record(
        '1',
        'getSubjectById returns correct record',
        getRes != null && getRes.difficultyLevel === 'beginner',
        `code=${getRes?.code} difficulty=${getRes?.difficultyLevel}`
      );

      // 1.e Update difficulty
      await subjectsService.updateSubject(
        subjectId!,
        {
          difficultyLevel: 'advanced'
        },
        null
      );
      const afterUpdate = await subjectsService.getSubjectById(subjectId!);
      record(
        '1',
        'updateSubject: difficulty beginner → advanced',
        afterUpdate?.difficultyLevel === 'advanced',
        `difficulty=${afterUpdate?.difficultyLevel}`
      );
    }

    // ─── 2. Subject Translations — Hindi + list + update ─
    header('2. Subject Translations — Hindi, list, update');
    {
      if (!subjectId) {
        record('2', 'subject translations skipped', false, 'subjectId missing');
      } else {
        // 2.a Get English translation
        const getEnRes = await subjectsService.getSubjectTranslationById(
          subjectTranslationIdEn!
        );
        record(
          '2',
          'getSubjectTranslationById returns all fields',
          getEnRes != null &&
            getEnRes.languageId === 1 &&
            getEnRes.name === `Test Subject EN ${RUN_ID}` &&
            getEnRes.shortIntro === 'English intro',
          `name=${getEnRes?.name} lang=${getEnRes?.languageId}`
        );

        // 2.b Create Hindi translation
        const createHiRes = await subjectsService.createSubjectTranslation(
          subjectId,
          {
            languageId: 23,
            name: `Test Subject HI ${RUN_ID}`,
            shortIntro: 'Hindi intro',
            metaTitle: 'Hindi Meta Title'
          },
          null
        );
        record(
          '2',
          'createSubjectTranslation (Hindi, lang_id=23)',
          typeof createHiRes.id === 'number' && createHiRes.id > 0,
          `id=${createHiRes.id}`
        );
        subjectTranslationIdHi = createHiRes.id;

        // 2.c List subject translations
        const listTransRes = await subjectsService.listSubjectTranslations(subjectId, {
          pageIndex: 1,
          pageSize: 100,
          sortColumn: 'id',
          sortDirection: 'ASC'
        });
        record(
          '2',
          'listSubjectTranslations for subject',
          (listTransRes.rows ?? []).length >= 2,
          `rows=${listTransRes.rows.length}`
        );

        // 2.d Update English translation (change name, clear metaTitle)
        await subjectsService.updateSubjectTranslation(
          subjectTranslationIdEn!,
          {
            name: `Updated Subject EN ${RUN_ID}`,
            metaTitle: '' // Will convert to null
          },
          null
        );
        const afterUpdate = await subjectsService.getSubjectTranslationById(
          subjectTranslationIdEn!
        );
        record(
          '2',
          'updateSubjectTranslation: name + metaTitle clear',
          afterUpdate?.name === `Updated Subject EN ${RUN_ID}` &&
            afterUpdate?.metaTitle === null,
          `name=${afterUpdate?.name} metaTitle=${afterUpdate?.metaTitle}`
        );
      }
    }

    // ─── 3. Chapters ────────────────────────────────────
    header('3. Chapters — create under subject, with translation');
    {
      if (!subjectId) {
        record('3', 'chapters skipped', false, 'subjectId missing');
      } else {
        // 3.a Create chapter under subject
        const createChRes = await chaptersService.createChapter(
          {
            subjectId,
            difficultyLevel: 'intermediate',
            estimatedMinutes: 120,
            displayOrder: 1,
            translation: {
              languageId: 1,
              name: `Chapter EN ${RUN_ID}`,
              shortIntro: 'Chapter intro'
            }
          },
          null
        );
        record(
          '3',
          'createChapter under subject with English translation',
          typeof createChRes.id === 'number' &&
            createChRes.id > 0 &&
            typeof createChRes.translationId === 'number',
          `id=${createChRes.id} tranId=${createChRes.translationId}`
        );
        chapterId = createChRes.id;
        chapterTranslationId = createChRes.translationId ?? null;

        // 3.b Get chapter
        const getChRes = await chaptersService.getChapterById(chapterId!);
        record(
          '3',
          'getChapterById returns correct subject_id',
          getChRes != null && getChRes.subjectId === subjectId,
          `subjectId=${getChRes?.subjectId}`
        );

        // 3.c Get translation
        if (chapterTranslationId) {
          const getTransRes = await chaptersService.getChapterTranslationById(
            chapterTranslationId
          );
          record(
            '3',
            'getChapterTranslationById returns fields',
            getTransRes != null && getTransRes.name === `Chapter EN ${RUN_ID}`,
            `name=${getTransRes?.name} chapterId=${getTransRes?.chapterId}`
          );
        }
      }
    }

    // ─── 4. Topics ──────────────────────────────────────
    header('4. Topics — create under chapter, with translation');
    {
      if (!chapterId) {
        record('4', 'topics skipped', false, 'chapterId missing');
      } else {
        // 4.a Create topic under chapter
        const createTRes = await topicsService.createTopic(
          {
            chapterId,
            difficultyLevel: 'intermediate',
            estimatedMinutes: 45,
            displayOrder: 1,
            translation: {
              languageId: 1,
              name: `Topic EN ${RUN_ID}`,
              shortIntro: 'Topic intro'
            }
          },
          null
        );
        record(
          '4',
          'createTopic under chapter with English translation',
          typeof createTRes.id === 'number' && createTRes.id > 0,
          `id=${createTRes.id}`
        );
        topicId = createTRes.id;
        topicTranslationId = createTRes.translationId ?? null;

        // 4.b Get topic
        const getTRes = await topicsService.getTopicById(topicId!);
        record(
          '4',
          'getTopicById returns correct chapter_id',
          getTRes != null && getTRes.chapterId === chapterId,
          `chapterId=${getTRes?.chapterId}`
        );

        // 4.c Get translation
        if (topicTranslationId) {
          const getTransRes = await topicsService.getTopicTranslationById(
            topicTranslationId
          );
          record(
            '4',
            'getTopicTranslationById returns fields',
            getTransRes != null && getTransRes.name === `Topic EN ${RUN_ID}`,
            `name=${getTransRes?.name}`
          );
        }
      }
    }

    // ─── 5. Sub-Topics ──────────────────────────────────
    header('5. Sub-Topics — create under topic, with page_url translation');
    {
      if (!topicId) {
        record('5', 'sub-topics skipped', false, 'topicId missing');
      } else {
        // 5.a Create sub-topic under topic (with page_url)
        const createSTRes = await subTopicsService.createSubTopic(
          {
            topicId,
            slug: `subtopic-verify-${RUN_ID}`,
            difficultyLevel: 'beginner',
            estimatedMinutes: 30,
            displayOrder: 1,
            translation: {
              languageId: 1,
              name: `SubTopic EN ${RUN_ID}`,
              shortIntro: 'Subtopic intro',
              pageUrl: `https://example.com/subtopic/${RUN_ID}`
            }
          },
          null
        );
        record(
          '5',
          'createSubTopic with page_url translation field',
          typeof createSTRes.id === 'number' && createSTRes.id > 0,
          `id=${createSTRes.id}`
        );
        subTopicId = createSTRes.id;
        subTopicTranslationId = createSTRes.translationId ?? null;

        // 5.b Get sub-topic
        const getSTRes = await subTopicsService.getSubTopicById(subTopicId!);
        record(
          '5',
          'getSubTopicById returns correct topic_id',
          getSTRes != null && getSTRes.topicId === topicId,
          `topicId=${getSTRes?.topicId}`
        );

        // 5.c Get translation with page_url
        if (subTopicTranslationId) {
          const getTransRes = await subTopicsService.getSubTopicTranslationById(
            subTopicTranslationId
          );
          record(
            '5',
            'getSubTopicTranslationById includes page_url',
            getTransRes != null &&
              getTransRes.name === `SubTopic EN ${RUN_ID}` &&
              getTransRes.pageUrl === `https://example.com/subtopic/${RUN_ID}`,
            `name=${getTransRes?.name} url=${getTransRes?.pageUrl}`
          );
        }
      }
    }

    // ─── 6. Soft Delete + Restore (subjects) ─────────────
    header('6. Soft Delete + Restore — subjects & cascade');
    {
      if (!subjectId) {
        record('6', 'soft delete tests skipped', false, 'subjectId missing');
      } else {
        // 6.a Soft delete subject
        await subjectsService.deleteSubject(subjectId);
        record('6', 'deleteSubject (soft)', true, `id=${subjectId}`);

        // 6.b Get by id with deleted flag (Phase-02 contract: udf skips is_deleted filter)
        const getDeleted = await subjectsService.getSubjectById(subjectId);
        record(
          '6',
          'getSubjectById returns deleted row (Phase-02 contract)',
          getDeleted != null && getDeleted.isDeleted === true,
          `isDeleted=${getDeleted?.isDeleted}`
        );

        // 6.c List should NOT include deleted
        const listAfterDelete = await subjectsService.listSubjects({
          pageIndex: 1,
          pageSize: 100,
          sortColumn: 'id',
          sortDirection: 'DESC'
        });
        const stillInList = (listAfterDelete.rows ?? []).find((r) => r.id === subjectId);
        record(
          '6',
          'list excludes soft-deleted subject',
          stillInList == null,
          stillInList ? 'still visible' : 'correctly hidden'
        );

        // 6.d Restore subject with translations
        await subjectsService.restoreSubject(subjectId);
        record('6', 'restoreSubject (with translations)', true, `id=${subjectId}`);

        // 6.e Verify subject restored (isDeleted = false)
        const afterRestore = await subjectsService.getSubjectById(subjectId);
        record(
          '6',
          'subject isDeleted=false after restore',
          afterRestore != null && afterRestore.isDeleted === false,
          `isDeleted=${afterRestore?.isDeleted}`
        );

        // 6.f Verify translations restored
        if (subjectTranslationIdEn) {
          const transRestored = await subjectsService.getSubjectTranslationById(
            subjectTranslationIdEn
          );
          record(
            '6',
            'English translation restored (isDeleted=false)',
            transRestored != null && transRestored.isDeleted === false,
            `isDeleted=${transRestored?.isDeleted}`
          );
        }
      }
    }

    // ─── 7. Translation Delete + Restore ─────────────────
    header('7. Translation Delete + Restore');
    {
      if (!subjectTranslationIdHi) {
        record('7', 'translation delete tests skipped', false, 'transIdHi missing');
      } else {
        // 7.a Delete Hindi translation
        await subjectsService.deleteSubjectTranslation(subjectTranslationIdHi);
        record('7', 'deleteSubjectTranslation (Hindi)', true, `id=${subjectTranslationIdHi}`);

        // 7.b Get returns deleted (Phase-02 contract)
        const getDeleted = await subjectsService.getSubjectTranslationById(
          subjectTranslationIdHi
        );
        record(
          '7',
          'getSubjectTranslationById returns deleted=true',
          getDeleted != null && getDeleted.isDeleted === true,
          `isDeleted=${getDeleted?.isDeleted}`
        );

        // 7.c Restore translation
        await subjectsService.restoreSubjectTranslation(subjectTranslationIdHi);
        record('7', 'restoreSubjectTranslation (Hindi)', true, `id=${subjectTranslationIdHi}`);

        // 7.d Verify restored
        const afterRestore = await subjectsService.getSubjectTranslationById(
          subjectTranslationIdHi
        );
        record(
          '7',
          'translation isDeleted=false after restore',
          afterRestore != null && afterRestore.isDeleted === false,
          `isDeleted=${afterRestore?.isDeleted}`
        );
      }
    }

    // ─── 8. Cleanup ─────────────────────────────────────
    header('8. Cleanup — reverse-order hard delete');
    {
      try {
        // Delete translations first, then parent rows in reverse hierarchy order
        if (subTopicId) {
          await getPool().query('DELETE FROM sub_topic_translations WHERE sub_topic_id = $1', [subTopicId]);
          await getPool().query('DELETE FROM sub_topics WHERE id = $1', [subTopicId]);
          record('8', 'sub_topics hard-deleted', true, `id=${subTopicId}`);
        }

        if (topicId) {
          await getPool().query('DELETE FROM topic_translations WHERE topic_id = $1', [topicId]);
          await getPool().query('DELETE FROM topics WHERE id = $1', [topicId]);
          record('8', 'topics hard-deleted', true, `id=${topicId}`);
        }

        if (chapterId) {
          await getPool().query('DELETE FROM chapter_translations WHERE chapter_id = $1', [chapterId]);
          await getPool().query('DELETE FROM chapters WHERE id = $1', [chapterId]);
          record('8', 'chapters hard-deleted', true, `id=${chapterId}`);
        }

        if (subjectId) {
          await getPool().query('DELETE FROM subject_translations WHERE subject_id = $1', [subjectId]);
          await getPool().query('DELETE FROM subjects WHERE id = $1', [subjectId]);
          record('8', 'subjects hard-deleted', true, `id=${subjectId}`);
        }
      } catch (err) {
        record('8', 'cleanup failed', false, (err as Error).message);
      }
    }
  } finally {
    await closePool();
  }

  // ─── Summary ──────────────────────────────────────────
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  console.log(`\n━━ Summary ━━`);
  console.log(`  passed: ${passed}/${total}`);
  if (failed > 0) {
    console.log(`\n  Failures:`);
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`    - [${r.section}] ${r.name} — ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('  Stage 8 verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
