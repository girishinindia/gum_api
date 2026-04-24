/**
 * Material AI Generator Service
 * Generates translations and metadata for imported material items using AI.
 * Batches items per subject tree to minimize API calls.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

type AIProvider = 'anthropic' | 'openai' | 'gemini';

// ─── Lazy-init clients (shared with ai.controller pattern) ───
let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
    anthropicClient = new Anthropic({ apiKey: key });
  }
  return anthropicClient;
}

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not configured');
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function getGemini(): GoogleGenerativeAI {
  if (!geminiClient) {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error('GOOGLE_API_KEY is not configured');
    geminiClient = new GoogleGenerativeAI(key);
  }
  return geminiClient;
}

// ─── Token estimation & batching config ───
// Approximate output tokens per item per language (name + short_intro + long_intro in JSON)
const TOKENS_PER_ITEM_PER_LANG = 120;    // ~120 tokens for 3 fields in JSON structure
const TOKENS_OVERHEAD_PER_ITEM = 30;      // JSON keys, braces, commas
const TOKENS_SUBJECT_EXTRA = 20;          // difficulty_level + estimated_hours
const TOKENS_JSON_WRAPPER = 100;          // outer { "subjects": {}, "chapters": {}, "topics": {} }
const SAFETY_MARGIN = 0.75;               // use only 75% of max tokens to be safe

const MAX_OUTPUT_TOKENS: Record<AIProvider, number> = {
  anthropic: 32768,
  openai: 16384,
  gemini: 65536,
};

/**
 * Estimate output tokens needed for a set of items across languages.
 */
function estimateOutputTokens(
  subjectCount: number,
  chapterCount: number,
  topicCount: number,
  langCount: number,
): number {
  const subjectTokens = subjectCount * (langCount * TOKENS_PER_ITEM_PER_LANG + TOKENS_OVERHEAD_PER_ITEM + TOKENS_SUBJECT_EXTRA);
  const chapterTokens = chapterCount * (langCount * TOKENS_PER_ITEM_PER_LANG + TOKENS_OVERHEAD_PER_ITEM);
  const topicTokens = topicCount * (langCount * TOKENS_PER_ITEM_PER_LANG + TOKENS_OVERHEAD_PER_ITEM);
  return TOKENS_JSON_WRAPPER + subjectTokens + chapterTokens + topicTokens;
}

async function callAI(provider: AIProvider, systemPrompt: string, userContent: string): Promise<string> {
  if (provider === 'anthropic') {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 32768,
      messages: [{ role: 'user', content: `${systemPrompt}\n\n${userContent}\n\nRespond with ONLY valid JSON.` }],
    });
    return msg.content.find(b => b.type === 'text')?.text || '{}';
  }
  if (provider === 'openai') {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 16384,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });
    return completion.choices[0]?.message?.content || '{}';
  }
  if (provider === 'gemini') {
    const client = getGemini();
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3, maxOutputTokens: 65536, responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(`${systemPrompt}\n\n${userContent}\n\nRespond with ONLY valid JSON.`);
    return result.response.text() || '{}';
  }
  throw new Error(`Unknown AI provider: ${provider}`);
}

function parseJSON(raw: string): any {
  let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Try to repair truncated JSON by closing open braces/brackets
    console.warn('JSON parse failed, attempting repair...');
    // Remove any trailing incomplete string (e.g. truncated mid-value)
    cleaned = cleaned.replace(/,\s*"[^"]*$/, '');  // remove trailing incomplete key
    cleaned = cleaned.replace(/,\s*$/, '');          // remove trailing comma
    // Count open vs close braces and brackets
    const openBraces = (cleaned.match(/\{/g) || []).length;
    const closeBraces = (cleaned.match(/\}/g) || []).length;
    const openBrackets = (cleaned.match(/\[/g) || []).length;
    const closeBrackets = (cleaned.match(/\]/g) || []).length;
    // Close any unclosed brackets then braces
    for (let i = 0; i < openBrackets - closeBrackets; i++) cleaned += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) cleaned += '}';
    try {
      return JSON.parse(cleaned);
    } catch {
      // If still fails, throw the original error
      throw firstErr;
    }
  }
}

// ─── Types ───

export interface GeneratedTranslation {
  name: string;
  short_intro: string;
  long_intro: string;
}

export interface GeneratedSubjectData {
  difficulty_level: string;
  estimated_hours: number;
  translations: Record<string, GeneratedTranslation>; // keyed by iso_code
}

export interface GeneratedChapterData {
  translations: Record<string, GeneratedTranslation>;
}

export interface GeneratedTopicData {
  translations: Record<string, GeneratedTranslation>;
}

export interface GeneratedSubTopicData {
  translations: Record<string, GeneratedTranslation>;
}

export interface MaterialTreeInput {
  subjects: Array<{
    name: string;
    isNew: boolean;
    chapters: Array<{
      name: string;
      isNew: boolean;
      topics: Array<{
        name: string;
        isNew: boolean;
        subTopics?: Array<{
          name: string;
          isNew: boolean;
        }>;
      }>;
    }>;
  }>;
}

export interface GeneratedMaterialData {
  subjects: Record<string, GeneratedSubjectData>;
  chapters: Record<string, GeneratedChapterData>;
  topics: Record<string, GeneratedTopicData>;
  sub_topics: Record<string, GeneratedSubTopicData>;
}

/**
 * Build the system prompt for material generation.
 */
function buildSystemPrompt(langList: string): string {
  return `You are an expert educational content creator for GrowUpMore — an online learning platform.
Generate translations for NEW educational items in these languages: ${langList}

Return JSON with keys: "subjects", "chapters", "topics", "sub_topics". Each maps item names to data.

For SUBJECTS: { "difficulty_level": "beginner"|"intermediate"|"advanced"|"expert"|"all_levels", "estimated_hours": number, "translations": { "<iso_code>": { "name": "...", "short_intro": "1-2 sentences (max 300 chars)", "long_intro": "2-4 sentences (max 1000 chars)" } } }
For CHAPTERS/TOPICS/SUB_TOPICS: same but without difficulty_level and estimated_hours.

ONLY generate these 3 fields per translation: name, short_intro, long_intro. Nothing else.

RULES:
- "en" = high-quality English, natural human writing style
- Other languages = translated with EXACT same meaning
- Content must be contextually relevant to the parent hierarchy

MOST IMPORTANT — STRICTLY FOLLOW FOR NON-ENGLISH:
Do NOT write in pure regional language. MUST keep technical English words in English script (Latin letters) — do NOT transliterate them.
GOOD (Hindi): "HTML5 की Fundamentals सीखें। Web Development में Semantic Elements को cover करता है।"
BAD (Hindi): "एचटीएमएल5 की मूल बातें। वेब डेवलपमेंट..." — WRONG, technical words transliterated.
Output = MIX of regional language + English technical words in Latin script.`;
}

/**
 * Build user content for a batch of items.
 */
function buildUserContent(
  subjects: string[],
  chapters: Array<{ name: string; parentSubject: string }>,
  topics: Array<{ name: string; parentChapter: string; parentSubject: string }>,
  subTopics: Array<{ name: string; parentTopic: string; parentChapter: string; parentSubject: string }>,
  langList: string,
  langCodes: string[],
): string {
  let userContent = 'Generate data for the following NEW educational items:\n\n';

  if (subjects.length > 0) {
    userContent += 'NEW SUBJECTS:\n';
    for (const name of subjects) {
      userContent += `- ${name}\n`;
    }
    userContent += '\n';
  }

  if (chapters.length > 0) {
    userContent += 'NEW CHAPTERS:\n';
    for (const ch of chapters) {
      userContent += `- "${ch.name}" (under subject: ${ch.parentSubject})\n`;
    }
    userContent += '\n';
  }

  if (topics.length > 0) {
    userContent += 'NEW TOPICS:\n';
    for (const t of topics) {
      userContent += `- "${t.name}" (under chapter: ${t.parentChapter}, subject: ${t.parentSubject})\n`;
    }
    userContent += '\n';
  }

  if (subTopics.length > 0) {
    userContent += 'NEW SUB-TOPICS:\n';
    for (const st of subTopics) {
      userContent += `- "${st.name}" (under topic: ${st.parentTopic}, chapter: ${st.parentChapter}, subject: ${st.parentSubject})\n`;
    }
    userContent += '\n';
  }

  userContent += `\nLanguages to generate for: ${langList}\nLanguage ISO codes: ${langCodes.join(', ')}`;
  return userContent;
}

/**
 * Split items into batches that fit within the provider's max output tokens.
 * Returns arrays of batches, each batch containing its subset of subjects, chapters, topics.
 */
type SubTopicEntry = { name: string; parentTopic: string; parentChapter: string; parentSubject: string };

function splitIntoBatches(
  newSubjects: string[],
  newChapters: Array<{ name: string; parentSubject: string }>,
  newTopics: Array<{ name: string; parentChapter: string; parentSubject: string }>,
  newSubTopics: SubTopicEntry[],
  langCount: number,
  provider: AIProvider,
): Array<{
  subjects: string[];
  chapters: Array<{ name: string; parentSubject: string }>;
  topics: Array<{ name: string; parentChapter: string; parentSubject: string }>;
  subTopics: SubTopicEntry[];
}> {
  const maxTokens = Math.floor(MAX_OUTPUT_TOKENS[provider] * SAFETY_MARGIN);

  // Check if everything fits in one call
  const totalItems = newSubjects.length + newChapters.length + newTopics.length + newSubTopics.length;
  const totalEstimate = estimateOutputTokens(newSubjects.length, newChapters.length, newTopics.length + newSubTopics.length, langCount);

  if (totalEstimate <= maxTokens) {
    console.log(`[MaterialAI] All ${newSubjects.length}S + ${newChapters.length}C + ${newTopics.length}T + ${newSubTopics.length}ST fit in one call (~${totalEstimate} tokens, max ${maxTokens})`);
    return [{ subjects: newSubjects, chapters: newChapters, topics: newTopics, subTopics: newSubTopics }];
  }

  console.log(`[MaterialAI] Estimated ${totalEstimate} tokens exceeds max ${maxTokens} — splitting into batches...`);

  // Calculate tokens per single item
  const tokensPerSubject = langCount * TOKENS_PER_ITEM_PER_LANG + TOKENS_OVERHEAD_PER_ITEM + TOKENS_SUBJECT_EXTRA;
  const tokensPerChapter = langCount * TOKENS_PER_ITEM_PER_LANG + TOKENS_OVERHEAD_PER_ITEM;
  const tokensPerTopic = langCount * TOKENS_PER_ITEM_PER_LANG + TOKENS_OVERHEAD_PER_ITEM;
  const tokensPerSubTopic = langCount * TOKENS_PER_ITEM_PER_LANG + TOKENS_OVERHEAD_PER_ITEM;

  // Flatten all items into a weighted list, then greedily pack batches
  type ItemEntry =
    | { type: 'subject'; tokens: number; data: string }
    | { type: 'chapter'; tokens: number; data: { name: string; parentSubject: string } }
    | { type: 'topic'; tokens: number; data: { name: string; parentChapter: string; parentSubject: string } }
    | { type: 'subTopic'; tokens: number; data: SubTopicEntry };

  const allItems: ItemEntry[] = [
    ...newSubjects.map(s => ({ type: 'subject' as const, tokens: tokensPerSubject, data: s })),
    ...newChapters.map(c => ({ type: 'chapter' as const, tokens: tokensPerChapter, data: c })),
    ...newTopics.map(t => ({ type: 'topic' as const, tokens: tokensPerTopic, data: t })),
    ...newSubTopics.map(st => ({ type: 'subTopic' as const, tokens: tokensPerSubTopic, data: st })),
  ];

  const batches: Array<{
    subjects: string[];
    chapters: Array<{ name: string; parentSubject: string }>;
    topics: Array<{ name: string; parentChapter: string; parentSubject: string }>;
    subTopics: SubTopicEntry[];
  }> = [];

  let currentBatch = { subjects: [] as string[], chapters: [] as typeof newChapters, topics: [] as typeof newTopics, subTopics: [] as SubTopicEntry[] };
  let currentTokens = TOKENS_JSON_WRAPPER;

  for (const item of allItems) {
    const batchSize = currentBatch.subjects.length + currentBatch.chapters.length + currentBatch.topics.length + currentBatch.subTopics.length;
    if (currentTokens + item.tokens > maxTokens && batchSize > 0) {
      batches.push(currentBatch);
      currentBatch = { subjects: [], chapters: [], topics: [], subTopics: [] };
      currentTokens = TOKENS_JSON_WRAPPER;
    }

    if (item.type === 'subject') {
      currentBatch.subjects.push(item.data as string);
    } else if (item.type === 'chapter') {
      currentBatch.chapters.push(item.data as { name: string; parentSubject: string });
    } else if (item.type === 'topic') {
      currentBatch.topics.push(item.data as { name: string; parentChapter: string; parentSubject: string });
    } else {
      currentBatch.subTopics.push(item.data as SubTopicEntry);
    }
    currentTokens += item.tokens;
  }

  // Push the last batch
  const lastBatchSize = currentBatch.subjects.length + currentBatch.chapters.length + currentBatch.topics.length + currentBatch.subTopics.length;
  if (lastBatchSize > 0) {
    batches.push(currentBatch);
  }

  console.log(`[MaterialAI] Split into ${batches.length} batches: ${batches.map((b, i) => `Batch ${i + 1}: ${b.subjects.length}S + ${b.chapters.length}C + ${b.topics.length}T + ${b.subTopics.length}ST`).join(', ')}`);
  return batches;
}

/**
 * Generate AI data for all new items in the material tree.
 * Automatically estimates token usage and splits into batches if needed.
 */
export async function generateMaterialData(
  tree: MaterialTreeInput,
  languages: Array<{ iso_code: string; name: string }>,
  provider: AIProvider = 'gemini',
): Promise<GeneratedMaterialData> {
  const result: GeneratedMaterialData = { subjects: {}, chapters: {}, topics: {}, sub_topics: {} };

  // Collect all NEW items
  const newSubjects: string[] = [];
  const newChapters: Array<{ name: string; parentSubject: string }> = [];
  const newTopics: Array<{ name: string; parentChapter: string; parentSubject: string }> = [];
  const newSubTopics: SubTopicEntry[] = [];

  for (const subject of tree.subjects) {
    if (subject.isNew) newSubjects.push(subject.name);
    for (const chapter of subject.chapters) {
      if (chapter.isNew) newChapters.push({ name: chapter.name, parentSubject: subject.name });
      for (const topic of chapter.topics) {
        if (topic.isNew) newTopics.push({ name: topic.name, parentChapter: chapter.name, parentSubject: subject.name });
        if (topic.subTopics) {
          for (const st of topic.subTopics) {
            if (st.isNew) newSubTopics.push({ name: st.name, parentTopic: topic.name, parentChapter: chapter.name, parentSubject: subject.name });
          }
        }
      }
    }
  }

  const totalNew = newSubjects.length + newChapters.length + newTopics.length + newSubTopics.length;
  if (totalNew === 0) return result;

  const langList = languages.map(l => `${l.name} (${l.iso_code})`).join(', ');
  const langCodes = languages.map(l => l.iso_code);
  const systemPrompt = buildSystemPrompt(langList);

  // Split into batches based on estimated token usage
  const batches = splitIntoBatches(newSubjects, newChapters, newTopics, newSubTopics, languages.length, provider);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchLabel = batches.length > 1 ? ` [Batch ${i + 1}/${batches.length}]` : '';
    console.log(`[MaterialAI]${batchLabel} Generating for ${batch.subjects.length}S + ${batch.chapters.length}C + ${batch.topics.length}T + ${batch.subTopics.length}ST across ${languages.length} languages...`);

    const userContent = buildUserContent(batch.subjects, batch.chapters, batch.topics, batch.subTopics, langList, langCodes);

    try {
      const raw = await callAI(provider, systemPrompt, userContent);
      const parsed = parseJSON(raw);

      if (parsed.subjects) Object.assign(result.subjects, parsed.subjects);
      if (parsed.chapters) Object.assign(result.chapters, parsed.chapters);
      if (parsed.topics) Object.assign(result.topics, parsed.topics);
      if (parsed.sub_topics) Object.assign(result.sub_topics, parsed.sub_topics);

      console.log(`[MaterialAI]${batchLabel} Success — got ${Object.keys(parsed.subjects || {}).length}S + ${Object.keys(parsed.chapters || {}).length}C + ${Object.keys(parsed.topics || {}).length}T + ${Object.keys(parsed.sub_topics || {}).length}ST`);
    } catch (e) {
      console.error(`[MaterialAI]${batchLabel} AI generation failed:`, e);
      for (const name of batch.subjects) {
        result.subjects[name] = buildFallbackSubject(name, langCodes);
      }
      for (const ch of batch.chapters) {
        result.chapters[ch.name] = buildFallbackItem(ch.name, langCodes);
      }
      for (const t of batch.topics) {
        result.topics[t.name] = buildFallbackItem(t.name, langCodes);
      }
      for (const st of batch.subTopics) {
        result.sub_topics[st.name] = buildFallbackItem(st.name, langCodes);
      }
    }
  }

  return result;
}

function buildFallbackSubject(name: string, langCodes: string[]): GeneratedSubjectData {
  const translations: Record<string, GeneratedTranslation> = {};
  for (const code of langCodes) {
    translations[code] = buildFallbackTranslation(name);
  }
  return { difficulty_level: 'all_levels', estimated_hours: 0, translations };
}

function buildFallbackItem(name: string, langCodes: string[]): GeneratedChapterData {
  const translations: Record<string, GeneratedTranslation> = {};
  for (const code of langCodes) {
    translations[code] = buildFallbackTranslation(name);
  }
  return { translations };
}

function buildFallbackTranslation(name: string): GeneratedTranslation {
  return {
    name,
    short_intro: '',
    long_intro: '',
  };
}
