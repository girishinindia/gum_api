/**
 * Parser for the course import .txt format.
 *
 * Format:
 *   === COURSE ===
 *   name: C Programming for School Students
 *   code: c-prog-school
 *   ...
 *
 *   === SUB-CATEGORIES ===
 *   Sub-Category: programming-languages | is_primary: true
 *   Sub-Category: software-engineering
 *
 *   --- MODULE: Programming Fundamentals ---
 *   Subject: C Programming
 *     Chapter: Introduction to C Programming | is_free_trial: true
 *       Topic: Getting Started with C
 *       Topic: Setting Up Development Environment
 */

// ── Types ──

export interface ParsedCourseMetadata {
  name: string;
  code: string;
  difficulty_level?: string;
  course_status?: string;
  course_language?: string;       // e.g. "Hindi" — resolved to language_id at import time
  duration_hours?: number;
  price?: number;
  original_price?: number;
  discount_percentage?: number;
  is_free?: boolean;
  is_new?: boolean;
  is_featured?: boolean;
  is_bestseller?: boolean;
  has_certificate?: boolean;
  has_placement_assistance?: boolean;
  refund_days?: number;
  total_lessons?: number;
  total_assignments?: number;
  total_projects?: number;
}

export interface ParsedSubCategory {
  code: string;
  is_primary: boolean;
}

export interface ParsedTopic {
  name: string;
}

export interface ParsedChapter {
  name: string;
  is_free_trial: boolean;
  topics: ParsedTopic[];
}

export interface ParsedSubject {
  name: string;
  chapters: ParsedChapter[];
}

export interface ParsedModule {
  name: string;
  display_order: number;
  subjects: ParsedSubject[];
}

export interface CourseImportParseResult {
  course: ParsedCourseMetadata;
  subCategories: ParsedSubCategory[];
  modules: ParsedModule[];
  errors: string[];
  summary: {
    moduleCount: number;
    subjectCount: number;
    chapterCount: number;
    topicCount: number;
    subCategoryCount: number;
  };
}

// ── Helpers ──

function parseBool(val: string): boolean {
  return val.trim().toLowerCase() === 'true';
}

function parseNum(val: string): number | undefined {
  const n = parseFloat(val.trim());
  return isNaN(n) ? undefined : n;
}

function parseInt10(val: string): number | undefined {
  const n = parseInt(val.trim(), 10);
  return isNaN(n) ? undefined : n;
}

// ── Main Parser ──

export function parseCourseImportFile(content: string): CourseImportParseResult {
  const lines = content.split('\n');
  const errors: string[] = [];

  const course: ParsedCourseMetadata = { name: '', code: '' };
  const subCategories: ParsedSubCategory[] = [];
  const modules: ParsedModule[] = [];

  let section: 'none' | 'course' | 'sub-categories' | 'module' = 'none';
  let currentModule: ParsedModule | null = null;
  let currentSubject: ParsedSubject | null = null;
  let currentChapter: ParsedChapter | null = null;
  let moduleIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const lineNum = i + 1;

    // Skip empty lines
    if (line.trim() === '') continue;

    // ── Section headers ──

    if (line.trim() === '=== COURSE ===') {
      section = 'course';
      continue;
    }

    if (line.trim() === '=== SUB-CATEGORIES ===') {
      section = 'sub-categories';
      continue;
    }

    const moduleMatch = line.trim().match(/^---\s*MODULE:\s*(.+?)\s*---$/);
    if (moduleMatch) {
      section = 'module';
      // Save previous module
      if (currentSubject && currentModule) {
        currentModule.subjects.push(currentSubject);
      }
      if (currentModule) {
        modules.push(currentModule);
      }
      moduleIndex++;
      // Parse name and optional inline flags like | display_order: 2
      const parts = moduleMatch[1].split('|').map(p => p.trim());
      const modName = parts[0];
      let displayOrder = moduleIndex; // default: auto-increment
      for (let p = 1; p < parts.length; p++) {
        const doMatch = parts[p].match(/^display_order:\s*(\d+)$/);
        if (doMatch) displayOrder = parseInt(doMatch[1], 10);
      }
      currentModule = { name: modName, display_order: displayOrder, subjects: [] };
      currentSubject = null;
      currentChapter = null;
      continue;
    }

    // ── Course metadata ──

    if (section === 'course') {
      const kvMatch = line.trim().match(/^(\w+)\s*:\s*(.*)$/);
      if (kvMatch) {
        const [, key, val] = kvMatch;
        const v = val.trim();
        switch (key) {
          case 'name': course.name = v; break;
          case 'code': course.code = v; break;
          case 'difficulty_level': course.difficulty_level = v; break;
          case 'course_status': course.course_status = v; break;
          case 'course_language': course.course_language = v; break;
          case 'duration_hours': course.duration_hours = parseNum(v); break;
          case 'price': course.price = parseNum(v); break;
          case 'original_price': course.original_price = parseNum(v); break;
          case 'discount_percentage': course.discount_percentage = parseNum(v); break;
          case 'is_free': course.is_free = parseBool(v); break;
          case 'is_new': course.is_new = parseBool(v); break;
          case 'is_featured': course.is_featured = parseBool(v); break;
          case 'is_bestseller': course.is_bestseller = parseBool(v); break;
          case 'has_certificate': course.has_certificate = parseBool(v); break;
          case 'has_placement_assistance': course.has_placement_assistance = parseBool(v); break;
          case 'refund_days': course.refund_days = parseInt10(v); break;
          case 'total_lessons': course.total_lessons = parseInt10(v); break;
          case 'total_assignments': course.total_assignments = parseInt10(v); break;
          case 'total_projects': course.total_projects = parseInt10(v); break;
          default:
            errors.push(`Line ${lineNum}: Unknown course field "${key}"`);
        }
      }
      continue;
    }

    // ── Sub-categories ──

    if (section === 'sub-categories') {
      const scMatch = line.trim().match(/^Sub-Category:\s*(.+)$/);
      if (scMatch) {
        const parts = scMatch[1].split('|').map(p => p.trim());
        const code = parts[0];
        let isPrimary = false;
        for (let p = 1; p < parts.length; p++) {
          const flagMatch = parts[p].match(/^is_primary:\s*(.+)$/);
          if (flagMatch) isPrimary = parseBool(flagMatch[1]);
        }
        subCategories.push({ code, is_primary: isPrimary });
      } else {
        errors.push(`Line ${lineNum}: Expected "Sub-Category: <code>" but got "${line.trim()}"`);
      }
      continue;
    }

    // ── Module content (Subject / Chapter / Topic) ──

    if (section === 'module' && currentModule) {
      const trimmed = line.trim();

      // Subject line
      const subjectMatch = trimmed.match(/^Subject:\s*(.+)$/);
      if (subjectMatch) {
        // Save previous subject
        if (currentChapter && currentSubject) {
          currentSubject.chapters.push(currentChapter);
          currentChapter = null;
        }
        if (currentSubject) {
          currentModule.subjects.push(currentSubject);
        }
        currentSubject = { name: subjectMatch[1].trim(), chapters: [] };
        currentChapter = null;
        continue;
      }

      // Chapter line (indented with spaces)
      const chapterMatch = trimmed.match(/^Chapter:\s*(.+)$/);
      if (chapterMatch) {
        // Save previous chapter
        if (currentChapter && currentSubject) {
          currentSubject.chapters.push(currentChapter);
        }
        const parts = chapterMatch[1].split('|').map(p => p.trim());
        const chName = parts[0];
        let isFreeTrial = false;
        for (let p = 1; p < parts.length; p++) {
          const flagMatch = parts[p].match(/^is_free_trial:\s*(.+)$/);
          if (flagMatch) isFreeTrial = parseBool(flagMatch[1]);
        }
        currentChapter = { name: chName, is_free_trial: isFreeTrial, topics: [] };
        continue;
      }

      // Topic line (indented deeper)
      const topicMatch = trimmed.match(/^Topic:\s*(.+)$/);
      if (topicMatch) {
        if (!currentChapter) {
          errors.push(`Line ${lineNum}: Topic found outside of a Chapter`);
          continue;
        }
        currentChapter.topics.push({ name: topicMatch[1].trim() });
        continue;
      }

      // Unknown line in module section
      if (trimmed.length > 0) {
        errors.push(`Line ${lineNum}: Unrecognized line in module: "${trimmed}"`);
      }
      continue;
    }
  }

  // ── Flush remaining data ──
  if (currentChapter && currentSubject) {
    currentSubject.chapters.push(currentChapter);
  }
  if (currentSubject && currentModule) {
    currentModule.subjects.push(currentSubject);
  }
  if (currentModule) {
    modules.push(currentModule);
  }

  // ── Validation ──
  if (!course.name) errors.push('Missing required field: name');
  if (!course.code) errors.push('Missing required field: code');
  if (modules.length === 0) errors.push('No modules found in the file');

  // ── Summary ──
  let subjectCount = 0, chapterCount = 0, topicCount = 0;
  for (const mod of modules) {
    subjectCount += mod.subjects.length;
    for (const sub of mod.subjects) {
      chapterCount += sub.chapters.length;
      for (const ch of sub.chapters) {
        topicCount += ch.topics.length;
      }
    }
  }

  return {
    course,
    subCategories,
    modules,
    errors,
    summary: {
      moduleCount: modules.length,
      subjectCount,
      chapterCount,
      topicCount,
      subCategoryCount: subCategories.length,
    },
  };
}
