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
      }>;
    }>;
  }>;
}

export interface GeneratedMaterialData {
  subjects: Record<string, GeneratedSubjectData>;
  chapters: Record<string, GeneratedChapterData>;
  topics: Record<string, GeneratedTopicData>;
}

/**
 * Generate AI data for all new items in the material tree.
 * Groups items and makes batched AI calls per subject.
 */
export async function generateMaterialData(
  tree: MaterialTreeInput,
  languages: Array<{ iso_code: string; name: string }>,
  provider: AIProvider = 'gemini',
): Promise<GeneratedMaterialData> {
  const result: GeneratedMaterialData = { subjects: {}, chapters: {}, topics: {} };

  // Collect all NEW items
  const newSubjects: string[] = [];
  const newChapters: Array<{ name: string; parentSubject: string }> = [];
  const newTopics: Array<{ name: string; parentChapter: string; parentSubject: string }> = [];

  for (const subject of tree.subjects) {
    if (subject.isNew) newSubjects.push(subject.name);
    for (const chapter of subject.chapters) {
      if (chapter.isNew) newChapters.push({ name: chapter.name, parentSubject: subject.name });
      for (const topic of chapter.topics) {
        if (topic.isNew) newTopics.push({ name: topic.name, parentChapter: chapter.name, parentSubject: subject.name });
      }
    }
  }

  const totalNew = newSubjects.length + newChapters.length + newTopics.length;
  if (totalNew === 0) return result;

  const langList = languages.map(l => `${l.name} (${l.iso_code})`).join(', ');
  const langCodes = languages.map(l => l.iso_code);

  // Build the prompt — only ask for fields that are actually saved to DB (name, short_intro, long_intro)
  const systemPrompt = `You are an expert educational content creator for GrowUpMore — an online learning platform.
Generate translations for NEW educational items in these languages: ${langList}

Return JSON with keys: "subjects", "chapters", "topics". Each maps item names to data.

For SUBJECTS: { "difficulty_level": "beginner"|"intermediate"|"advanced"|"expert"|"all_levels", "estimated_hours": number, "translations": { "<iso_code>": { "name": "...", "short_intro": "1-2 sentences (max 300 chars)", "long_intro": "2-4 sentences (max 1000 chars)" } } }
For CHAPTERS/TOPICS: same but without difficulty_level and estimated_hours.

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

  // Build user content with the tree
  let userContent = 'Generate data for the following NEW educational items:\n\n';

  if (newSubjects.length > 0) {
    userContent += 'NEW SUBJECTS:\n';
    for (const name of newSubjects) {
      userContent += `- ${name}\n`;
    }
    userContent += '\n';
  }

  if (newChapters.length > 0) {
    userContent += 'NEW CHAPTERS:\n';
    for (const ch of newChapters) {
      userContent += `- "${ch.name}" (under subject: ${ch.parentSubject})\n`;
    }
    userContent += '\n';
  }

  if (newTopics.length > 0) {
    userContent += 'NEW TOPICS:\n';
    for (const t of newTopics) {
      userContent += `- "${t.name}" (under chapter: ${t.parentChapter}, subject: ${t.parentSubject})\n`;
    }
    userContent += '\n';
  }

  userContent += `\nLanguages to generate for: ${langList}\nLanguage ISO codes: ${langCodes.join(', ')}`;

  try {
    const raw = await callAI(provider, systemPrompt, userContent);
    const parsed = parseJSON(raw);

    if (parsed.subjects) result.subjects = parsed.subjects;
    if (parsed.chapters) result.chapters = parsed.chapters;
    if (parsed.topics) result.topics = parsed.topics;
  } catch (e) {
    console.error('AI generation failed for material import:', e);
    // Fall back: create basic translations from names
    for (const name of newSubjects) {
      result.subjects[name] = buildFallbackSubject(name, langCodes);
    }
    for (const ch of newChapters) {
      result.chapters[ch.name] = buildFallbackItem(ch.name, langCodes);
    }
    for (const t of newTopics) {
      result.topics[t.name] = buildFallbackItem(t.name, langCodes);
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
