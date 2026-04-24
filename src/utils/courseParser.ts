/**
 * Course Structure Parser
 *
 * Parses tab-indented .txt files into a 4-level course hierarchy:
 *   Course Name (line 1, no tabs — or derived from filename)
 *   \t1. Chapter Name
 *   \t\t1. Topic Name
 *   \t\t\t1. Sub-Topic Name
 *
 * Also provides sanitize/normalize utilities for matching
 * .txt names to CDN folder/file names.
 *
 * CDN naming convention:
 *   Folder/file: {NN}_{Sanitized_Name}
 *   Sanitize: spaces→_, &→and, remove (),'  etc.
 *   Order number: 2-digit zero-padded
 */

// ─── Types ─────────────────────────────────────────────

export interface ParsedSubTopic {
  order: number;
  name: string;
  line: number;
}

export interface ParsedTopic {
  order: number;
  name: string;
  line: number;
  subTopics: ParsedSubTopic[];
}

export interface ParsedChapter {
  order: number;
  name: string;
  line: number;
  topics: ParsedTopic[];
}

export interface ParsedCourse {
  name: string;
  line: number;
  chapters: ParsedChapter[];
}

export interface CourseParseResult {
  course: ParsedCourse | null;
  errors: string[];
}

// ─── Parser ────────────────────────────────────────────

/**
 * Parse a course .txt file content into a structured tree.
 *
 * The first non-empty line at indent level 0 is the course name.
 * Subsequent lines at 1/2/3 tab levels are chapters/topics/sub-topics.
 * Each line is expected to have a number prefix like "1. Name".
 */
export function parseCourseStructure(content: string): CourseParseResult {
  const lines = content.split(/\r?\n/);
  const errors: string[] = [];

  let course: ParsedCourse | null = null;
  let currentChapter: ParsedChapter | null = null;
  let currentTopic: ParsedTopic | null = null;

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

    // Also support spaces: detect indent by counting leading spaces
    if (tabs === 0 && raw[0] === ' ') {
      let spaces = 0;
      let k = 0;
      while (k < raw.length && raw[k] === ' ') {
        spaces++;
        k++;
      }
      // Heuristic: 4 spaces per level (or 2 per level for compacted files)
      // Check if file uses 4-space or 2-space indent by looking at minimum indent
      if (spaces >= 12) tabs = 3;
      else if (spaces >= 8) tabs = 2;
      else if (spaces >= 4) tabs = 1;
      else if (spaces >= 2) tabs = 1;
      j = k;
    }

    const text = raw.slice(j).trim();
    if (!text) continue;

    // Extract order number and name from "N. Name" format
    const { order, name } = extractOrderAndName(text);

    if (tabs === 0) {
      // Course name (first line at level 0)
      if (!course) {
        course = { name: text, line: lineNum, chapters: [] };
      } else {
        errors.push(`Line ${lineNum}: Multiple course names found ("${text}"). Only one course per file is supported.`);
      }
      currentChapter = null;
      currentTopic = null;
    } else if (tabs === 1) {
      // Chapter
      if (!course) {
        errors.push(`Line ${lineNum}: Chapter "${name}" has no parent course`);
        continue;
      }
      currentChapter = { order, name, line: lineNum, topics: [] };
      currentTopic = null;
      course.chapters.push(currentChapter);
    } else if (tabs === 2) {
      // Topic
      if (!currentChapter) {
        errors.push(`Line ${lineNum}: Topic "${name}" has no parent chapter`);
        continue;
      }
      currentTopic = { order, name, line: lineNum, subTopics: [] };
      currentChapter.topics.push(currentTopic);
    } else if (tabs === 3) {
      // Sub-Topic
      if (!currentTopic) {
        errors.push(`Line ${lineNum}: Sub-topic "${name}" has no parent topic`);
        continue;
      }
      currentTopic.subTopics.push({ order, name, line: lineNum });
    } else {
      errors.push(`Line ${lineNum}: Too many indent levels (max 3 tabs). Got ${tabs} tabs for "${text}"`);
    }
  }

  if (!course && errors.length === 0) {
    errors.push('No course name found. First non-empty line should be the course name with no tabs.');
  }

  return { course, errors };
}

/**
 * Extract order number and name from a line like "1. Getting Started with HTML".
 * Returns { order: 1, name: "Getting Started with HTML" }.
 * If no number prefix, order defaults to 0.
 */
export function extractOrderAndName(text: string): { order: number; name: string } {
  const match = text.match(/^(\d+)\.\s+(.+)$/);
  if (match) {
    return { order: parseInt(match[1], 10), name: match[2].trim() };
  }
  return { order: 0, name: text.trim() };
}

// ─── Sanitize / Naming Utilities ───────────────────────

/**
 * CDN Naming Convention — Complete Rules
 * ════════════════════════════════════════
 *
 * Every name (course, chapter, topic, sub-topic) is sanitised before
 * becoming a CDN folder name, HTML file name, video file name, database
 * slug, or Bunny Stream collection name.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 1 — MULTI-CHAR SEQUENCES (processed first, order matters)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Sequence     │ Replaced with     │ Example
 *   ─────────────┼───────────────────┼──────────────────────────────────
 *   ->           │ "to"              │ "Input -> Output" → "Input_to_Output"
 *   =>           │ "to"              │ "Map => Result"   → "Map_to_Result"
 *   <-           │ "from"            │ "Data <- Source"  → "Data_from_Source"
 *   <=           │ "lte"             │ "x <= 10"         → "x_lte_10"
 *   >=           │ "gte"             │ "x >= 5"          → "x_gte_5"
 *   !=           │ "neq"             │ "a != b"          → "a_neq_b"
 *   ==           │ "eq"              │ "a == b"          → "a_eq_b"
 *   &&           │ "and"             │ "A && B"          → "A_and_B"
 *   ||           │ "or"              │ "A || B"          → "A_or_B"
 *   ...          │ ""  (removed)     │ "Wait..."         → "Wait"
 *   --           │ "_"               │ "well--known"     → "well_known"
 *   ::           │ "_"               │ "std::vector"     → "std_vector"
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 2 — SINGLE-CHAR REPLACEMENTS (meaningful → word)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Char │ Replaced with │ Example
 *   ─────┼───────────────┼──────────────────────────────────────────────
 *   &    │ "and"         │ "HTML4 & HTML5"         → "HTML4_and_HTML5"
 *   +    │ "plus"        │ "C++ Programming"       → "Cplusplus_Programming"
 *   #    │ "sharp"       │ "C# Basics"             → "Csharp_Basics"
 *   @    │ "at"          │ "Email @ Work"          → "Email_at_Work"
 *   %    │ "pct"         │ "50% Done"              → "50pct_Done"
 *   $    │ "dollar"      │ "Price $10"             → "Price_dollar10"
 *   =    │ "eq"          │ "A = B"                 → "A_eq_B"
 *   ~    │ "tilde"       │ "Approx ~5"             → "Approx_tilde5"
 *   ^    │ "caret"       │ "2^10 Power"            → "2caret10_Power"
 *   |    │ "pipe"        │ "A | B"                 → "A_pipe_B"
 *   >    │ "gt"          │ "x > 0"                 → "x_gt_0"
 *   <    │ "lt"          │ "x < 10"                → "x_lt_10"
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 3 — CHARACTERS REMOVED ENTIRELY
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Brackets/Parens:  ( ) [ ] { }
 *   Quotes:           ' " `  (single, double, backtick)
 *   Punctuation:      , . : ; ! ?
 *   Filesystem-unsafe: / \  (slash, backslash)
 *   Other:            *  (asterisk — wildcard conflict)
 *
 *   "Understanding (HTML4 vs HTML5)"  → "Understanding_HTML4_vs_HTML5"
 *   "What's New?"                     → "Whats_New"
 *   "Node.js"                         → "Nodejs"
 *   "TCP/IP"                          → "TCPIP"
 *   "file.html"                       → "filehtml"  (but .html extension is added separately)
 *   "Hello, World!"                   → "Hello_World"
 *   "`code` blocks"                   → "code_blocks"
 *   "*.txt pattern"                   → "txt_pattern"
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 4 — SPACING / SEPARATOR HANDLING
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Character(s)            │ Becomes
 *   ────────────────────────┼─────────
 *   space ( )               │ _
 *   hyphen/dash (-)         │ _
 *   en-dash (–)             │ _
 *   em-dash (—)             │ _
 *   tab (\t)                │ _
 *   multiple ___ in a row   │ collapsed to single _
 *   leading _ or trailing _ │ trimmed
 *
 *   "Node.js - Getting Started"    → "Nodejs_Getting_Started"
 *   "Well — Known  Pattern"        → "Well_Known_Pattern"
 *   "  extra   spaces  "           → "extra_spaces"
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 5 — UNICODE / NON-ASCII HANDLING
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Accented Latin:  Stripped to ASCII base letter
 *     "Résumé"        → "Resume"
 *     "café"          → "cafe"
 *     "naïve"         → "naive"
 *     "über"          → "uber"
 *     "señor"         → "senor"
 *     "São Paulo"     → "Sao_Paulo"
 *
 *   Non-Latin scripts (Hindi, Chinese, Arabic, etc.):
 *     Kept as-is — Bunny CDN supports UTF-8 folder names
 *     "हिंदी Basics"  → "हिंदी_Basics"
 *
 *   Smart quotes / fancy punctuation (from Word/Google Docs):
 *     " " (curly double quotes)  → removed
 *     ' ' (curly single quotes)  → removed
 *     …   (ellipsis)             → removed
 *     –   (en-dash)              → _ (space)
 *     —   (em-dash)              → _ (space)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 6 — PROGRAMMING / TECHNICAL PATTERNS
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Input                              │ Output
 *   ────────────────────────────────────┼──────────────────────────────
 *   "C++ Programming"                  │ "Cplusplus_Programming"
 *   "C# Basics"                        │ "Csharp_Basics"
 *   "F# Functional"                    │ "Fsharp_Functional"
 *   "Objective-C"                      │ "Objective_C"
 *   "ASP.NET Core"                     │ "ASPNET_Core"
 *   "Node.js"                          │ "Nodejs"
 *   "Vue.js 3"                         │ "Vuejs_3"
 *   "React.js vs Angular"              │ "Reactjs_vs_Angular"
 *   ".NET Framework"                   │ "NET_Framework"
 *   "System.IO.File"                   │ "SystemIOFile"
 *   "TCP/IP & HTTP"                    │ "TCPIP_and_HTTP"
 *   "REST API (v2)"                    │ "REST_API_v2"
 *   "async/await"                      │ "asyncawait"
 *   "try-catch-finally"                │ "try_catch_finally"
 *   "std::cout"                        │ "std_cout"
 *   "Array<String>"                    │ "Array_lt_String_gt"
 *   "HashMap<K, V>"                    │ "HashMap_lt_K_V_gt"
 *   "List[int]"                        │ "List_int"
 *   "dict{key: val}"                   │ "dict_key_val"
 *   "fn(x) -> y"                       │ "fn_x_to_y"
 *   "a == b && c != d"                 │ "a_eq_b_and_c_neq_d"
 *   "x >= 5 || x <= 0"                │ "x_gte_5_or_x_lte_0"
 *   "O(n²) Complexity"                 │ "O_n2_Complexity"
 *   "100% Complete"                    │ "100pct_Complete"
 *   "$variable"                        │ "dollarvariable"
 *   "@decorator"                       │ "atdecorator"
 *   "#include <stdio.h>"               │ "sharpinclude_lt_stdioh_gt"
 *   "git checkout -b feature/login"    │ "git_checkout_b_featurelogin"
 *   "kubectl get pods --all-namespaces"│ "kubectl_get_pods_all_namespaces"
 *   "SELECT * FROM users"              │ "SELECT_FROM_users"
 *   "192.168.1.1:8080"                 │ "19216811_8080"  (IPs lose dots)
 *   "user@host.com"                    │ "userathost_com" (emails lose @)
 *   "toUpperCase()"                    │ "toUpperCase"
 *   "Array.prototype.map()"            │ "ArrayprototypemapTypically"
 *   "console.log('hello')"            │ "consolelog_hello"
 *   "document.getElementById()"        │ "documentgetElementById"
 *   "_.debounce()"                     │ "debounce"
 *   "Math.PI"                          │ "MathPI"
 *   "package.json"                     │ "packagejson"
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 7 — MATH / SCIENCE PATTERNS
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Input                    │ Output
 *   ─────────────────────────┼──────────────────────
 *   "E = mc²"                │ "E_eq_mc2"
 *   "H₂O"                   │ "H2O"
 *   "x² + y² = z²"          │ "x2_plus_y2_eq_z2"
 *   "π (Pi)"                 │ "π_Pi"  (Greek kept)
 *   "∑ Summation"            │ "∑_Summation"  (math symbols kept)
 *   "CO₂ Emissions"          │ "CO2_Emissions"
 *   "10⁶ (Million)"          │ "106_Million"
 *   "a × b"                  │ "a_x_b"  (× → x)
 *   "a ÷ b"                  │ "a_div_b" (÷ → div)
 *   "a ≠ b"                  │ "a_neq_b" (≠ → neq)
 *   "x ≥ 5"                  │ "x_gte_5" (≥ → gte)
 *   "x ≤ 10"                 │ "x_lte_10" (≤ → lte)
 *   "√2"                     │ "sqrt2"  (√ → sqrt)
 *   "∞ Loop"                 │ "inf_Loop"  (∞ → inf)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 8 — EDGE CASES / MISC
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Input                     │ Output
 *   ──────────────────────────┼─────────────────────
 *   "Part 1: Introduction"    │ "Part_1_Introduction"
 *   "Q&A Session"             │ "QandA_Session"
 *   "Do's & Don'ts"           │ "Dos_and_Donts"
 *   "Self-Paced Learning"     │ "Self_Paced_Learning"
 *   "10,000 Users"            │ "10000_Users"
 *   "Version 2.0"             │ "Version_20"
 *   "$100 Budget"             │ "dollar100_Budget"
 *   "50% Off Sale!"           │ "50pct_Off_Sale"
 *   "FAQ: Common Questions?"  │ "FAQ_Common_Questions"
 *   "Step #1: Setup"          │ "Step_sharp1_Setup"
 *   "Buy Now!!!"              │ "Buy_Now"
 *   "Hello...World"           │ "HelloWorld"
 *   ""Smart Quotes""          │ "Smart_Quotes"
 *   "'Curly' Apostrophes"     │ "Curly_Apostrophes"
 *   "file_name"               │ "file_name" (already clean)
 *   "ALLCAPS"                 │ "ALLCAPS" (case preserved)
 *   "camelCase"               │ "camelCase" (case preserved)
 *   ""                        │ "" (empty stays empty)
 *   "   "                     │ "" (whitespace-only → empty)
 *   "___"                     │ "" (underscore-only → empty)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FULL FOLDER STRUCTURE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   .txt file:
 *     HTML4 & HTML5
 *       1. Getting Started with HTML
 *         1. Introduction to Web Development
 *           1. What is the Internet
 *           2. How Websites Work
 *
 *   CDN folders:
 *     HTML4_and_HTML5/                                   ← course (sanitized, no order)
 *     HTML4_and_HTML5/HTML4_and_HTML5.txt                ← structure file
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/      ← chapter (NN_ prefix)
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/assets/
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/01_Introduction_to_Web_Development/  ← topic
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/01_Introduction_to_Web_Development/assets/
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/01_Introduction_to_Web_Development/videos/
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/01_Introduction_to_Web_Development/en/
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/01_Introduction_to_Web_Development/hi/
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/01_Introduction_to_Web_Development/en/01_What_is_the_Internet.html
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/01_Introduction_to_Web_Development/en/02_How_Websites_Work.html
 *     HTML4_and_HTML5/01_Getting_Started_with_HTML/01_Introduction_to_Web_Development/videos/01_What_is_the_Internet.mp4
 *
 *   Database:
 *     Subject slug: "html4-and-html5"
 *     Chapter slug: "getting-started-with-html"
 *     Topic slug:   "introduction-to-web-development"
 *     Sub-topic slug: "what-is-the-internet"
 *
 *   Bunny Stream collections:
 *     "HTML4 & HTML5"
 *     "HTML4 & HTML5 > Getting Started with HTML"
 *     "HTML4 & HTML5 > Getting Started with HTML > Introduction to Web Development"
 *
 *   Language folders: en/, hi/, gu/, mr/ (ISO 639-1 codes, lowercase, never sanitised)
 *   Assets folder:    assets/ (always ignored during import/scan)
 *   Videos folder:    videos/ (scanned for .mp4 .webm .mov .avi .mkv)
 */

/**
 * Sanitize a name for use as a CDN folder or file name.
 * Applies every rule documented above.
 */
export function sanitizeName(name: string): string {
  let s = name;

  // ── Step 0: Normalise unicode ──
  // Strip accents: "Résumé" → "Resume", "café" → "cafe"
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // ── Step 1: Multi-char sequences (before single-char, order matters) ──
  s = s.replace(/\.\.\./g, '');        // ellipsis → remove
  s = s.replace(/\u2026/g, '');        // … (unicode ellipsis)
  s = s.replace(/->/g, ' to ');        // -> arrow
  s = s.replace(/=>/g, ' to ');        // => fat arrow
  s = s.replace(/<-/g, ' from ');      // <- reverse arrow
  s = s.replace(/<=/g, ' lte ');       // <= less than or equal
  s = s.replace(/>=/g, ' gte ');       // >= greater than or equal
  s = s.replace(/!=/g, ' neq ');       // != not equal
  s = s.replace(/==/g, ' eq ');        // == equality
  s = s.replace(/&&/g, ' and ');       // logical AND
  s = s.replace(/\|\|/g, ' or ');      // logical OR
  s = s.replace(/::/g, '_');           // scope operator (std::cout)
  s = s.replace(/--/g, '_');           // double dash

  // ── Step 2: Unicode math/science symbols ──
  s = s.replace(/×/g, ' x ');         // multiplication sign
  s = s.replace(/÷/g, ' div ');       // division sign
  s = s.replace(/≠/g, ' neq ');       // not equal
  s = s.replace(/≥/g, ' gte ');       // greater or equal
  s = s.replace(/≤/g, ' lte ');       // less or equal
  s = s.replace(/√/g, 'sqrt');        // square root
  s = s.replace(/∞/g, 'inf');         // infinity
  // Superscript digits: ⁰¹²³⁴⁵⁶⁷⁸⁹ → 0123456789
  s = s.replace(/⁰/g, '0').replace(/¹/g, '1').replace(/²/g, '2').replace(/³/g, '3')
       .replace(/⁴/g, '4').replace(/⁵/g, '5').replace(/⁶/g, '6').replace(/⁷/g, '7')
       .replace(/⁸/g, '8').replace(/⁹/g, '9');
  // Subscript digits: ₀₁₂₃₄₅₆₇₈₉ → 0123456789
  s = s.replace(/₀/g, '0').replace(/₁/g, '1').replace(/₂/g, '2').replace(/₃/g, '3')
       .replace(/₄/g, '4').replace(/₅/g, '5').replace(/₆/g, '6').replace(/₇/g, '7')
       .replace(/₈/g, '8').replace(/₉/g, '9');

  // ── Step 3: Smart quotes / fancy punctuation (Word, Google Docs) ──
  s = s.replace(/[\u2018\u2019\u201A\u201B]/g, '');   // ' ' ‚ ‛ curly single quotes
  s = s.replace(/[\u201C\u201D\u201E\u201F]/g, '');   // " " „ ‟ curly double quotes
  s = s.replace(/[\u2013]/g, '_');                     // – en-dash → _
  s = s.replace(/[\u2014]/g, '_');                     // — em-dash → _

  // ── Step 4: Single-char meaningful replacements ──
  s = s.replace(/&/g, 'and');
  s = s.replace(/\+/g, 'plus');
  s = s.replace(/#/g, 'sharp');
  s = s.replace(/@/g, 'at');
  s = s.replace(/%/g, 'pct');
  s = s.replace(/\$/g, 'dollar');
  s = s.replace(/=/g, 'eq');
  s = s.replace(/~/g, 'tilde');
  s = s.replace(/\^/g, 'caret');
  s = s.replace(/\|/g, 'pipe');
  s = s.replace(/>/g, 'gt');
  s = s.replace(/</g, 'lt');

  // ── Step 5: Remove grouping / quoting / unsafe chars ──
  s = s.replace(/[()[\]{}'",.:;!?`*\\\/]/g, '');

  // ── Step 6: Hyphens, dashes, whitespace → underscore ──
  s = s.replace(/[\s\-\u2013\u2014\t]+/g, '_');

  // ── Step 7: Collapse, trim ──
  s = s.replace(/_+/g, '_');
  s = s.replace(/^_|_$/g, '');

  return s;
}

/**
 * Build a CDN folder/file name with zero-padded order prefix.
 * Example: buildCdnName(1, "Getting Started with HTML") → "01_Getting_Started_with_HTML"
 */
export function buildCdnName(order: number, name: string): string {
  const paddedOrder = String(order).padStart(2, '0');
  const sanitized = sanitizeName(name);
  return `${paddedOrder}_${sanitized}`;
}

/**
 * Build a CDN course folder name (no order prefix, just sanitized).
 * Example: "HTML4 & HTML5" → "HTML4_and_HTML5"
 */
export function buildCourseFolderName(courseName: string): string {
  return sanitizeName(courseName);
}

/**
 * Generate a slug from a name (for database records).
 * Same replacement logic as sanitizeName but lowercased with hyphens.
 *
 * Example: "Getting Started with HTML" → "getting-started-with-html"
 * Example: "C# Basics"                → "csharp-basics"
 * Example: "C++ Programming"          → "cplusplus-programming"
 * Example: "Node.js"                  → "nodejs"
 * Example: "E = mc²"                  → "e-eq-mc2"
 */
export function nameToSlug(name: string): string {
  let s = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Multi-char
  s = s.replace(/\.\.\./g, '').replace(/\u2026/g, '');
  s = s.replace(/->/g, '-to-').replace(/=>/g, '-to-').replace(/<-/g, '-from-');
  s = s.replace(/<=/g, '-lte-').replace(/>=/g, '-gte-');
  s = s.replace(/!=/g, '-neq-').replace(/==/g, '-eq-');
  s = s.replace(/&&/g, '-and-').replace(/\|\|/g, '-or-');
  s = s.replace(/::/g, '-').replace(/--/g, '-');
  // Unicode math
  s = s.replace(/×/g, '-x-').replace(/÷/g, '-div-');
  s = s.replace(/≠/g, '-neq-').replace(/≥/g, '-gte-').replace(/≤/g, '-lte-');
  s = s.replace(/√/g, 'sqrt').replace(/∞/g, 'inf');
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, m => '0123456789'['⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(m)]);
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, m => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(m)]);
  // Smart quotes
  s = s.replace(/[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F]/g, '');
  s = s.replace(/[\u2013\u2014]/g, '-');
  // Single-char meaningful
  s = s.replace(/&/g, 'and').replace(/\+/g, 'plus').replace(/#/g, 'sharp');
  s = s.replace(/@/g, 'at').replace(/%/g, 'pct').replace(/\$/g, 'dollar');
  s = s.replace(/=/g, 'eq').replace(/~/g, 'tilde').replace(/\^/g, 'caret');
  s = s.replace(/\|/g, 'pipe').replace(/>/g, 'gt').replace(/</g, 'lt');
  // Remove everything else non-alphanumeric (except spaces, hyphens, non-latin scripts)
  s = s.replace(/[^a-z0-9\s\-\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0600-\u06FF]/g, '');
  s = s.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s;
}

/**
 * Normalize a CDN folder/file name back to a comparable string
 * by stripping the order prefix and replacing underscores with spaces.
 *
 * "01_Getting_Started_with_HTML"  → "getting started with html"
 * "01_Cplusplus_Programming"     → "cplusplus programming"
 * "01_E_eq_mc2"                  → "e eq mc2"
 *
 * Used for fuzzy matching CDN folders to parsed .txt entries.
 */
export function normalizeCdnName(cdnName: string): string {
  // Strip order prefix (e.g., "01_" or "1._")
  const stripped = cdnName.replace(/^\d+[._]\s*/, '');
  return stripped
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Normalize a .txt entry name for comparison.
 * Applies the same word-replacements as sanitizeName so both sides match.
 *
 * "Getting Started with HTML"  → "getting started with html"
 * "C++ Programming"            → "cplusplus programming"
 * "C# Basics"                  → "csharp basics"
 * "E = mc²"                    → "e eq mc2"
 * "Node.js - Getting Started"  → "nodejs getting started"
 */
export function normalizeTxtName(name: string): string {
  let s = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Multi-char sequences
  s = s.replace(/\.\.\./g, '').replace(/\u2026/g, '');
  s = s.replace(/->/g, ' to ').replace(/=>/g, ' to ').replace(/<-/g, ' from ');
  s = s.replace(/<=/g, ' lte ').replace(/>=/g, ' gte ');
  s = s.replace(/!=/g, ' neq ').replace(/==/g, ' eq ');
  s = s.replace(/&&/g, ' and ').replace(/\|\|/g, ' or ');
  s = s.replace(/::/g, ' ').replace(/--/g, ' ');
  // Unicode math
  s = s.replace(/×/g, ' x ').replace(/÷/g, ' div ');
  s = s.replace(/≠/g, ' neq ').replace(/≥/g, ' gte ').replace(/≤/g, ' lte ');
  s = s.replace(/√/g, 'sqrt').replace(/∞/g, 'inf');
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, m => '0123456789'['⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(m)]);
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, m => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(m)]);
  // Smart quotes/dashes
  s = s.replace(/[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F]/g, '');
  s = s.replace(/[\u2013\u2014]/g, ' ');
  // Single-char
  s = s.replace(/&/g, 'and').replace(/\+/g, 'plus').replace(/#/g, 'sharp');
  s = s.replace(/@/g, 'at').replace(/%/g, 'pct').replace(/\$/g, 'dollar');
  s = s.replace(/=/g, 'eq').replace(/~/g, 'tilde').replace(/\^/g, 'caret');
  s = s.replace(/\|/g, 'pipe').replace(/>/g, 'gt').replace(/</g, 'lt');
  // Remove punctuation/brackets
  s = s.replace(/[()[\]{}'",.:;!?`*\\\/]/g, '');
  // Normalize spacing
  s = s.replace(/[\s\-]+/g, ' ').toLowerCase().trim();
  return s;
}

/**
 * Match a CDN folder/file name to a .txt entry name.
 * Returns true if they refer to the same item.
 */
export function namesMatch(cdnName: string, txtName: string): boolean {
  return normalizeCdnName(cdnName) === normalizeTxtName(txtName);
}

// ─── Summary ───────────────────────────────────────────

export function courseSummary(result: CourseParseResult): {
  chapters: number;
  topics: number;
  subTopics: number;
} {
  let topics = 0;
  let subTopics = 0;
  if (!result.course) return { chapters: 0, topics: 0, subTopics: 0 };
  for (const ch of result.course.chapters) {
    topics += ch.topics.length;
    for (const tp of ch.topics) {
      subTopics += tp.subTopics.length;
    }
  }
  return {
    chapters: result.course.chapters.length,
    topics,
    subTopics,
  };
}

// ─── CDN Path Builder ──────────────────────────────────

/**
 * Build the complete set of CDN folder paths for a course.
 * Used to scaffold the folder structure on Bunny CDN.
 */
export function buildCdnPaths(
  course: ParsedCourse,
  languageIsoCodes: string[]
): string[] {
  const paths: string[] = [];
  const courseFolderName = buildCourseFolderName(course.name);

  // Course root
  paths.push(courseFolderName);

  for (const chapter of course.chapters) {
    const chapterName = buildCdnName(chapter.order, chapter.name);
    const chapterPath = `${courseFolderName}/${chapterName}`;
    paths.push(chapterPath);
    paths.push(`${chapterPath}/assets`);

    for (const topic of chapter.topics) {
      const topicName = buildCdnName(topic.order, topic.name);
      const topicPath = `${chapterPath}/${topicName}`;
      paths.push(topicPath);
      paths.push(`${topicPath}/assets`);
      paths.push(`${topicPath}/videos`);

      // Language folders
      for (const iso of languageIsoCodes) {
        paths.push(`${topicPath}/${iso}`);
      }
    }
  }

  return paths;
}
