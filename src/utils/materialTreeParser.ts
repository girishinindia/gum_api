/**
 * Material Tree Parser
 * Parses tab-indented text files into a subject→chapter→topic tree.
 *
 * Format:
 *   0 tabs = Subject name
 *   1 tab  = Chapter name (under the subject above)
 *   2 tabs = Topic name   (under the chapter above)
 *
 * Example:
 *   Machine Learning
 *   \tIntroduction to ML
 *   \t\tWhat is ML
 *   \t\tTypes of ML
 *   \tSupervised Learning
 *   \t\tLinear Regression
 */

export interface ParsedTopic {
  name: string;
  line: number;
}

export interface ParsedChapter {
  name: string;
  line: number;
  topics: ParsedTopic[];
}

export interface ParsedSubject {
  name: string;
  line: number;
  chapters: ParsedChapter[];
}

export interface ParseResult {
  subjects: ParsedSubject[];
  errors: string[];
}

export function parseMaterialTree(content: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const subjects: ParsedSubject[] = [];
  const errors: string[] = [];

  let currentSubject: ParsedSubject | null = null;
  let currentChapter: ParsedChapter | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNum = i + 1;

    // Skip empty lines
    if (raw.trim() === '') continue;

    // Count leading tabs
    let tabs = 0;
    let j = 0;
    while (j < raw.length && raw[j] === '\t') {
      tabs++;
      j++;
    }

    // Also support spaces: 2 or 4 spaces = 1 tab level
    if (tabs === 0 && raw[0] === ' ') {
      let spaces = 0;
      let k = 0;
      while (k < raw.length && raw[k] === ' ') {
        spaces++;
        k++;
      }
      // Detect indent size: 2 or 4 spaces per level
      if (spaces >= 8) tabs = 2;
      else if (spaces >= 4) tabs = 1;        // could be 1 tab (4-space) or 2 tabs (2-space)
      else if (spaces >= 2) tabs = 1;
      // Refine: check all lines to detect indent style
      // For simplicity, use >= thresholds
      // 8+ spaces = 2 levels, 4-7 = 1 level, 2-3 = 1 level
      j = k; // move past spaces
    }

    const name = raw.slice(j).trim();
    if (!name) continue;

    if (tabs === 0) {
      // Subject
      currentSubject = { name, line: lineNum, chapters: [] };
      currentChapter = null;
      subjects.push(currentSubject);
    } else if (tabs === 1) {
      // Chapter
      if (!currentSubject) {
        errors.push(`Line ${lineNum}: Chapter "${name}" has no parent subject`);
        continue;
      }
      currentChapter = { name, line: lineNum, topics: [] };
      currentSubject.chapters.push(currentChapter);
    } else if (tabs === 2) {
      // Topic
      if (!currentChapter) {
        errors.push(`Line ${lineNum}: Topic "${name}" has no parent chapter`);
        continue;
      }
      currentChapter.topics.push({ name, line: lineNum });
    } else {
      errors.push(`Line ${lineNum}: Too many indent levels (max 2 tabs). Got ${tabs} tabs for "${name}"`);
    }
  }

  // Validate: at least one subject
  if (subjects.length === 0 && errors.length === 0) {
    errors.push('No subjects found in file. Make sure subject names have no leading tabs.');
  }

  return { subjects, errors };
}

/**
 * Returns a summary of what the parsed tree contains.
 */
export function treeSummary(result: ParseResult): {
  totalSubjects: number;
  totalChapters: number;
  totalTopics: number;
} {
  let totalChapters = 0;
  let totalTopics = 0;
  for (const s of result.subjects) {
    totalChapters += s.chapters.length;
    for (const c of s.chapters) {
      totalTopics += c.topics.length;
    }
  }
  return {
    totalSubjects: result.subjects.length,
    totalChapters,
    totalTopics,
  };
}
