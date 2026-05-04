import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { ok, err } from '../../utils/response';
import { logAdmin } from '../../services/activityLog.service';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { uploadRawFile, createBunnyFolder, createBunnyFolders, deleteImage, listBunnyStorageRecursive, listBunnyStorage, downloadBunnyFile, type CdnTreeNode } from '../../services/storage.service';
import { fetchVideoFromUrl, buildStorageUrl, buildCollectionName, findOrCreateCollection, createCourseCollections, clearCollectionCache, getVideoStatus, listAllStreamVideos, listAllStreamCollections, listStreamCollections, deleteVideoFromStream, deleteStreamCollection, listStreamVideos } from '../../services/video.service';
import { parseCourseStructure, buildCdnName, buildCourseFolderName, namesMatch, nameToSlug, normalizeCdnName, normalizeTxtName, type ParsedCourse, type ParsedChapter, type ParsedTopic, type ParsedSubTopic } from '../../utils/courseParser';
import { config } from '../../config';
import { parseMaterialTree, treeSummary } from '../../utils/materialTreeParser';
import { matchSubject, matchChapter, matchTopic, matchSubTopic } from '../../services/materialMatcher.service';
import { generateMaterialData, type MaterialTreeInput } from '../../services/materialAiGenerator.service';
import { getArchivedYoutubeUrls, markArchiveRestored } from '../../services/youtubeArchive.service';
import { fetchAll } from '../../utils/supabaseFetchAll';

// ─── Rate limiter (in-memory, per user) ───
const rateLimits = new Map<number, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60_000;

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Provider Types ───
type AIProvider = 'anthropic' | 'openai' | 'gemini';

// ─── Lazy-init clients ───
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

// ─── Unified AI call ───
async function callAI(provider: AIProvider, systemPrompt: string, userContent: string, maxTokens: number = 8192): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (provider === 'anthropic') {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: `${systemPrompt}\n\n${userContent}\n\nRespond with ONLY valid JSON.` }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text || '{}';
    return { text, inputTokens: msg.usage?.input_tokens || 0, outputTokens: msg.usage?.output_tokens || 0 };
  }

  if (provider === 'openai') {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });
    const text = completion.choices[0]?.message?.content || '{}';
    return { text, inputTokens: completion.usage?.prompt_tokens || 0, outputTokens: completion.usage?.completion_tokens || 0 };
  }

  if (provider === 'gemini') {
    const client = getGemini();
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    });
    const result = await model.generateContent(`${systemPrompt}\n\n${userContent}\n\nRespond with ONLY valid JSON.`);
    const response = result.response;
    const text = response.text() || '{}';
    return { text, inputTokens: response.usageMetadata?.promptTokenCount || 0, outputTokens: response.usageMetadata?.candidatesTokenCount || 0 };
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}

function parseJSON(raw: string): any {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // If it still doesn't start with { or [, try to extract JSON from the response
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const jsonStart = cleaned.search(/[\[{]/);
    if (jsonStart >= 0) cleaned = cleaned.slice(jsonStart);
  }
  // If it doesn't end with } or ], try to find the last valid closing bracket
  if (!cleaned.endsWith('}') && !cleaned.endsWith(']')) {
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (lastBrace >= 0) cleaned = cleaned.slice(0, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try fixing common AI issues: trailing commas before } or ]
    const fixedCommas = cleaned.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(fixedCommas);
  }
}

/**
 * Call AI and return raw text (not JSON). Used for HTML translation.
 */
async function callAIRaw(provider: AIProvider, systemPrompt: string, userContent: string, maxTokens: number = 16384): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (provider === 'anthropic') {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [
        { role: 'user', content: `${systemPrompt}\n\n${userContent}` },
      ],
    });
    const text = msg.content.find(b => b.type === 'text')?.text || '';
    return { text, inputTokens: msg.usage?.input_tokens || 0, outputTokens: msg.usage?.output_tokens || 0 };
  }

  if (provider === 'openai') {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });
    const text = completion.choices[0]?.message?.content || '';
    return { text, inputTokens: completion.usage?.prompt_tokens || 0, outputTokens: completion.usage?.completion_tokens || 0 };
  }

  if (provider === 'gemini') {
    const client = getGemini();
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: maxTokens,
      },
    });
    const result = await model.generateContent(`${systemPrompt}\n\n${userContent}`);
    const response = result.response;
    const text = response.text() || '';
    return { text, inputTokens: response.usageMetadata?.promptTokenCount || 0, outputTokens: response.usageMetadata?.candidatesTokenCount || 0 };
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}

// ─── Single-language generate (existing endpoint) ───
export async function generateTranslation(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { category_id, target_language_code, target_language_name, prompt, provider: reqProvider } = req.body;
    if (!category_id || !target_language_code) return err(res, 'category_id and target_language_code are required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const isEnglish = target_language_code === 'en';
    const targetLang = target_language_name || target_language_code;
    const userPrompt = prompt || (isEnglish
      ? 'Generate SEO-optimized content with engaging descriptions and relevant tags.'
      : 'Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated.');

    const { data: category } = await supabase.from('categories').select('*').eq('id', category_id).single();
    if (!category) return err(res, 'Category not found', 404);

    let systemPrompt: string;
    let userContent: string;

    if (isEnglish) {
      systemPrompt = `You are a professional SEO content writer for GrowUpMore — an educational platform.
Generate comprehensive English content for the category. Fill ALL fields.
OUTPUT — return ONLY valid JSON:
{"name":"","description":"2-3 sentences","is_new_title":"","tags":"comma-separated 5-8 tags","meta_title":"50-60 chars","meta_description":"150-160 chars","meta_keywords":"8-12 keywords","og_title":"","og_description":"100-150 chars","twitter_title":"","twitter_description":"70-100 chars","focus_keyword":""}
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ code: category.code, slug: category.slug });
    } else {
      const { data: enTrans } = await supabase.from('category_translations').select('*, languages!inner(iso_code)').eq('category_id', category_id).eq('languages.iso_code', 'en').is('deleted_at', null).limit(1);
      const source = enTrans?.[0];
      if (!source) return err(res, 'English translation not found. Please create the English version first.', 404);

      const sourceContent = {
        name: source.name || '', description: source.description || '', is_new_title: source.is_new_title || '',
        tags: Array.isArray(source.tags) ? source.tags.join(', ') : (source.tags || ''),
        meta_title: source.meta_title || '', meta_description: source.meta_description || '', meta_keywords: source.meta_keywords || '',
        og_title: source.og_title || '', og_description: source.og_description || '',
        twitter_title: source.twitter_title || '', twitter_description: source.twitter_description || '', focus_keyword: source.focus_keyword || '',
      };

      systemPrompt = `You are a professional multilingual SEO translator.
Translate English content into ${targetLang} (${target_language_code}) with EXACT same meaning.
RULES: Keep JSON keys in English. Tags comma-separated. Maintain tone and intent. Write in a natural, human way.
MOST IMPORTANT: Do NOT write in pure ${targetLang}. MUST keep technical English words in English script (Latin letters) — do NOT transliterate. Example (Hindi): "Web Development की Fundamentals सीखें" NOT "वेब डेवलपमेंट की मूल बातें". Keep subject/technical/brand words in English as they are.
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify(sourceContent);
    }

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);
    let translated: any;
    try { translated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    logAdmin({ actorId: userId, action: isEnglish ? 'ai_content_generated' : 'ai_translation_generated', targetType: 'category_translation', targetId: Number(category_id), targetName: `${category.code} → ${targetLang} (${provider})`, ip: getClientIp(req) });

    return ok(res, {
      source_language: isEnglish ? 'category_info' : 'en', target_language: target_language_code, provider,
      translated: {
        name: translated.name || '', description: translated.description || '', is_new_title: translated.is_new_title || '',
        tags: translated.tags || '', meta_title: translated.meta_title || '', meta_description: translated.meta_description || '',
        meta_keywords: translated.meta_keywords || '', og_title: translated.og_title || '', og_description: translated.og_description || '',
        twitter_title: translated.twitter_title || '', twitter_description: translated.twitter_description || '', focus_keyword: translated.focus_keyword || '',
      },
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, isEnglish ? 'Content generated successfully' : 'Translation generated successfully');
  } catch (error: any) {
    console.error('AI generateTranslation error:', error);
    return err(res, error.message || 'AI generation failed', 500);
  }
}

// ─── Bulk generate: single prompt generates English + ALL languages at once ───
export async function bulkGenerateTranslations(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { category_id, prompt, provider: reqProvider } = req.body;
    if (!category_id) return err(res, 'category_id is required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Fetch category
    const { data: category } = await supabase.from('categories').select('*').eq('id', category_id).single();
    if (!category) return err(res, 'Category not found', 404);

    // Fetch all active material languages
    const { data: allLangs } = await supabase.from('languages').select('id, name, iso_code, native_name').eq('is_active', true).eq('for_material', true).order('id');
    if (!allLangs || allLangs.length === 0) return err(res, 'No active languages found', 404);

    // Find existing active translations
    const { data: existing } = await supabase.from('category_translations').select('id, language_id, deleted_at').eq('category_id', category_id);
    const activeLangIds = new Set((existing || []).filter(e => !e.deleted_at).map(e => e.language_id));
    const softDeletedMap = new Map((existing || []).filter(e => e.deleted_at).map(e => [e.language_id, e.id]));
    const missingLangs = allLangs.filter(l => !activeLangIds.has(l.id));

    if (missingLangs.length === 0) {
      return ok(res, { results: [], message: 'All languages already have translations' });
    }

    const userPrompt = prompt || 'Create content in English with a natural human writing style. Translate exactly with the same meaning for other languages. Keep technical or brand words in English that sound strange or unnatural when translated.';

    // Check if English exists
    const hasEnglish = !missingLangs.find(l => l.iso_code === 'en');
    let englishSource: any = null;

    if (hasEnglish) {
      // Fetch existing English translation as source
      const { data: enTrans } = await supabase.from('category_translations').select('*').eq('category_id', category_id).is('deleted_at', null);
      const enLang = allLangs.find(l => l.iso_code === 'en');
      if (enLang && enTrans) englishSource = enTrans.find((t: any) => t.language_id === enLang.id);
    }

    // Build language list for prompt
    const langList = missingLangs.map(l => `${l.iso_code}: ${l.name}`).join(', ');

    // ─── SINGLE PROMPT: Generate all at once ───
    let systemPrompt: string;
    let userContent: string;

    if (!hasEnglish) {
      // Need to generate English first + translate to all others
      systemPrompt = `You are a professional SEO content writer and multilingual translator for GrowUpMore — an educational platform.

TASK: Generate comprehensive English SEO content for the category below, then translate it into ALL the specified languages.

OUTPUT — return ONLY valid JSON with this EXACT structure:
{
  "en": { "name": "...", "description": "...", "is_new_title": "...", "tags": "...", "meta_title": "...", "meta_description": "...", "meta_keywords": "...", "og_title": "...", "og_description": "...", "twitter_title": "...", "twitter_description": "...", "focus_keyword": "..." },
  "hi": { ... same fields translated to Hindi ... },
  "gu": { ... same fields translated to Gujarati ... }
}

LANGUAGES TO GENERATE: ${langList}

RULES:
- First create high-quality English content with a natural, human writing style.
- Then translate EXACTLY with the same meaning into each language's native script.
- Keep technical terms, brand names, and words that sound unnatural when translated in English.
- Tags should be comma-separated strings.
- SEO fields should be optimized for each language.
- description: 2-3 engaging sentences. meta_title: 50-60 chars. meta_description: 150-160 chars.
- Use the ISO code as the key for each language object.

USER INSTRUCTIONS: ${userPrompt}`;

      userContent = JSON.stringify({ code: category.code, slug: category.slug });
    } else {
      // English exists — translate to missing languages only
      const sourceContent = {
        name: englishSource?.name || '', description: englishSource?.description || '',
        is_new_title: englishSource?.is_new_title || '',
        tags: Array.isArray(englishSource?.tags) ? englishSource.tags.join(', ') : (englishSource?.tags || ''),
        meta_title: englishSource?.meta_title || '', meta_description: englishSource?.meta_description || '',
        meta_keywords: englishSource?.meta_keywords || '', og_title: englishSource?.og_title || '',
        og_description: englishSource?.og_description || '', twitter_title: englishSource?.twitter_title || '',
        twitter_description: englishSource?.twitter_description || '', focus_keyword: englishSource?.focus_keyword || '',
      };

      systemPrompt = `You are a professional multilingual SEO translator for GrowUpMore — an educational platform.

TASK: Translate the English content below into ALL the specified languages.

OUTPUT — return ONLY valid JSON with this EXACT structure:
{
  "hi": { "name": "...", "description": "...", "is_new_title": "...", "tags": "...", "meta_title": "...", "meta_description": "...", "meta_keywords": "...", "og_title": "...", "og_description": "...", "twitter_title": "...", "twitter_description": "...", "focus_keyword": "..." },
  "gu": { ... same fields translated ... }
}

LANGUAGES TO TRANSLATE: ${langList}

RULES:
- Translate EXACTLY with the same meaning into each language's native script.
- Keep technical terms, brand names, and words that sound unnatural when translated in English.
- Tags should be comma-separated strings.
- SEO fields should be optimized for each language while keeping exact meaning.
- Use the ISO code as the key for each language object.

USER INSTRUCTIONS: ${userPrompt}`;

      userContent = `English source content:\n${JSON.stringify(sourceContent)}`;
    }

    // Call AI (single call for all languages!) — scale tokens by language count
    const bulkTokens = Math.max(8192, missingLangs.length * 3072);
    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent, bulkTokens);

    let allTranslations: any;
    try { allTranslations = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    // Save each language to DB (upsert: restore soft-deleted rows if they exist)
    const results: any[] = [];
    for (const lang of missingLangs) {
      const translated = allTranslations[lang.iso_code];
      if (!translated) {
        results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: 'AI did not return translation for this language' });
        continue;
      }

      const tags = translated.tags ? (typeof translated.tags === 'string' ? translated.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : translated.tags) : [];

      // Generate JSON-LD structured data
      const structured_data = [
        {
          '@context': 'https://schema.org', '@type': 'CollectionPage',
          name: translated.name || '', ...(translated.description && { description: translated.description }),
          url: `https://growupmore.com/${lang.iso_code}/categories/${category.slug}`,
          inLanguage: lang.iso_code, isPartOf: { '@type': 'WebSite', name: 'GrowUpMore', url: 'https://growupmore.com' },
          provider: { '@type': 'Organization', name: 'GrowUpMore', url: 'https://growupmore.com' },
        },
        {
          '@context': 'https://schema.org', '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `https://growupmore.com/${lang.iso_code}` },
            { '@type': 'ListItem', position: 2, name: 'Categories', item: `https://growupmore.com/${lang.iso_code}/categories` },
            { '@type': 'ListItem', position: 3, name: translated.name || '' },
          ],
        },
        { '@context': 'https://schema.org', '@type': 'ItemList', name: translated.name || '', numberOfItems: 0, itemListElement: [] },
      ];

      const record: any = {
        category_id,
        language_id: lang.id,
        name: translated.name || '',
        description: translated.description || '',
        is_new_title: translated.is_new_title || '',
        tags,
        meta_title: translated.meta_title || '',
        meta_description: translated.meta_description || '',
        meta_keywords: translated.meta_keywords || '',
        og_title: translated.og_title || '',
        og_description: translated.og_description || '',
        twitter_title: translated.twitter_title || '',
        twitter_description: translated.twitter_description || '',
        focus_keyword: translated.focus_keyword || '',
        structured_data,
        is_active: true,
        deleted_at: null,
        updated_by: userId,
      };

      // Check if a soft-deleted row exists for this language — update it instead of inserting
      const softDeletedId = softDeletedMap.get(lang.id);
      let saved: any, saveErr: any;

      if (softDeletedId) {
        // Restore and overwrite the soft-deleted row
        const result = await supabase.from('category_translations').update({ ...record, created_by: userId }).eq('id', softDeletedId).select().single();
        saved = result.data;
        saveErr = result.error;
      } else {
        // Fresh insert
        const result = await supabase.from('category_translations').insert({ ...record, created_by: userId }).select().single();
        saved = result.data;
        saveErr = result.error;
      }

      if (saveErr) {
        results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: saveErr.message });
      } else {
        results.push({ language: lang.name, iso_code: lang.iso_code, status: 'success', id: saved.id });
      }
    }

    logAdmin({ actorId: userId, action: 'ai_bulk_translation_generated', targetType: 'category_translation', targetId: Number(category_id), targetName: `${category.code} → ${missingLangs.length} languages (${provider})`, ip: getClientIp(req) });

    const successCount = results.filter(r => r.status === 'success').length;
    return ok(res, {
      results,
      provider,
      total_tokens: inputTokens + outputTokens,
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, `Bulk generation complete: ${successCount}/${results.length} succeeded`);

  } catch (error: any) {
    console.error('AI bulkGenerateTranslations error:', error);
    return err(res, error.message || 'Bulk generation failed', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ─── SUB-CATEGORY TRANSLATIONS ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

// ─── Single-language generate for sub-category ───
export async function generateSubCategoryTranslation(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { sub_category_id, target_language_code, target_language_name, prompt, provider: reqProvider } = req.body;
    if (!sub_category_id || !target_language_code) return err(res, 'sub_category_id and target_language_code are required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const isEnglish = target_language_code === 'en';
    const targetLang = target_language_name || target_language_code;
    const userPrompt = prompt || (isEnglish
      ? 'Generate SEO-optimized content with engaging descriptions and relevant tags.'
      : 'Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated.');

    const { data: subCat } = await supabase.from('sub_categories').select('*, categories(code, slug)').eq('id', sub_category_id).single();
    if (!subCat) return err(res, 'Sub-category not found', 404);

    let systemPrompt: string;
    let userContent: string;

    if (isEnglish) {
      systemPrompt = `You are a professional SEO content writer for GrowUpMore — an educational platform.
Generate comprehensive English content for the sub-category. Fill ALL fields.
OUTPUT — return ONLY valid JSON:
{"name":"","description":"2-3 sentences","is_new_title":"","tags":"comma-separated 5-8 tags","meta_title":"50-60 chars","meta_description":"150-160 chars","meta_keywords":"8-12 keywords","og_title":"","og_description":"100-150 chars","twitter_title":"","twitter_description":"70-100 chars","focus_keyword":""}
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ code: subCat.code, slug: subCat.slug, parent_category: subCat.categories?.code || '' });
    } else {
      const { data: enTrans } = await supabase.from('sub_category_translations').select('*, languages!inner(iso_code)').eq('sub_category_id', sub_category_id).eq('languages.iso_code', 'en').is('deleted_at', null).limit(1);
      const source = enTrans?.[0];
      if (!source) return err(res, 'English translation not found. Please create the English version first.', 404);

      const sourceContent = {
        name: source.name || '', description: source.description || '', is_new_title: source.is_new_title || '',
        tags: Array.isArray(source.tags) ? source.tags.join(', ') : (source.tags || ''),
        meta_title: source.meta_title || '', meta_description: source.meta_description || '', meta_keywords: source.meta_keywords || '',
        og_title: source.og_title || '', og_description: source.og_description || '',
        twitter_title: source.twitter_title || '', twitter_description: source.twitter_description || '', focus_keyword: source.focus_keyword || '',
      };

      systemPrompt = `You are a professional multilingual SEO translator.
Translate English content into ${targetLang} (${target_language_code}) with EXACT same meaning.
RULES: Keep JSON keys in English. Tags comma-separated. Maintain tone and intent. Write in a natural, human way.
MOST IMPORTANT: Do NOT write in pure ${targetLang}. MUST keep technical English words in English script (Latin letters) — do NOT transliterate. Example (Hindi): "Web Development की Fundamentals सीखें" NOT "वेब डेवलपमेंट की मूल बातें". Keep subject/technical/brand words in English as they are.
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify(sourceContent);
    }

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);
    let translated: any;
    try { translated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    logAdmin({ actorId: userId, action: isEnglish ? 'ai_sub_category_content_generated' : 'ai_sub_category_translation_generated', targetType: 'sub_category_translation', targetId: Number(sub_category_id), targetName: `${subCat.code} → ${targetLang} (${provider})`, ip: getClientIp(req) });

    return ok(res, {
      source_language: isEnglish ? 'sub_category_info' : 'en', target_language: target_language_code, provider,
      translated: {
        name: translated.name || '', description: translated.description || '', is_new_title: translated.is_new_title || '',
        tags: translated.tags || '', meta_title: translated.meta_title || '', meta_description: translated.meta_description || '',
        meta_keywords: translated.meta_keywords || '', og_title: translated.og_title || '', og_description: translated.og_description || '',
        twitter_title: translated.twitter_title || '', twitter_description: translated.twitter_description || '', focus_keyword: translated.focus_keyword || '',
      },
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, isEnglish ? 'Content generated successfully' : 'Translation generated successfully');
  } catch (error: any) {
    console.error('AI generateSubCategoryTranslation error:', error);
    return err(res, error.message || 'AI generation failed', 500);
  }
}

// ─── Bulk generate for sub-category: single prompt generates English + ALL languages ───
export async function bulkGenerateSubCategoryTranslations(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { sub_category_id, prompt, provider: reqProvider } = req.body;
    if (!sub_category_id) return err(res, 'sub_category_id is required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    const { data: subCat } = await supabase.from('sub_categories').select('*, categories(code, slug)').eq('id', sub_category_id).single();
    if (!subCat) return err(res, 'Sub-category not found', 404);

    const { data: allLangs } = await supabase.from('languages').select('id, name, iso_code, native_name').eq('is_active', true).eq('for_material', true).order('id');
    if (!allLangs || allLangs.length === 0) return err(res, 'No active languages found', 404);

    // Find existing active + soft-deleted translations
    const { data: existing } = await supabase.from('sub_category_translations').select('id, language_id, deleted_at').eq('sub_category_id', sub_category_id);
    const activeLangIds = new Set((existing || []).filter(e => !e.deleted_at).map(e => e.language_id));
    const softDeletedMap = new Map((existing || []).filter(e => e.deleted_at).map(e => [e.language_id, e.id]));
    const missingLangs = allLangs.filter(l => !activeLangIds.has(l.id));

    if (missingLangs.length === 0) {
      return ok(res, { results: [], message: 'All languages already have translations' });
    }

    const userPrompt = prompt || 'Create content in English with a natural human writing style. Translate exactly with the same meaning for other languages. Keep technical or brand words in English that sound strange or unnatural when translated.';

    const hasEnglish = !missingLangs.find(l => l.iso_code === 'en');
    let englishSource: any = null;

    if (hasEnglish) {
      const { data: enTrans } = await supabase.from('sub_category_translations').select('*').eq('sub_category_id', sub_category_id).is('deleted_at', null);
      const enLang = allLangs.find(l => l.iso_code === 'en');
      if (enLang && enTrans) englishSource = enTrans.find((t: any) => t.language_id === enLang.id);
    }

    const langList = missingLangs.map(l => `${l.iso_code}: ${l.name}`).join(', ');
    const parentCategory = subCat.categories?.code || '';

    let systemPrompt: string;
    let userContent: string;

    if (!hasEnglish) {
      systemPrompt = `You are a professional SEO content writer and multilingual translator for GrowUpMore — an educational platform.

TASK: Generate comprehensive English SEO content for the sub-category below, then translate it into ALL the specified languages.

OUTPUT — return ONLY valid JSON with this EXACT structure:
{
  "en": { "name": "...", "description": "...", "is_new_title": "...", "tags": "...", "meta_title": "...", "meta_description": "...", "meta_keywords": "...", "og_title": "...", "og_description": "...", "twitter_title": "...", "twitter_description": "...", "focus_keyword": "..." },
  "hi": { ... same fields translated to Hindi ... }
}

LANGUAGES TO GENERATE: ${langList}

RULES:
- First create high-quality English content with a natural, human writing style.
- Then translate EXACTLY with the same meaning into each language's native script.
- Keep technical terms, brand names, and words that sound unnatural when translated in English.
- Tags should be comma-separated strings.
- SEO fields should be optimized for each language.
- description: 2-3 engaging sentences. meta_title: 50-60 chars. meta_description: 150-160 chars.
- Use the ISO code as the key for each language object.

USER INSTRUCTIONS: ${userPrompt}`;

      userContent = JSON.stringify({ code: subCat.code, slug: subCat.slug, parent_category: parentCategory });
    } else {
      const sourceContent = {
        name: englishSource?.name || '', description: englishSource?.description || '',
        is_new_title: englishSource?.is_new_title || '',
        tags: Array.isArray(englishSource?.tags) ? englishSource.tags.join(', ') : (englishSource?.tags || ''),
        meta_title: englishSource?.meta_title || '', meta_description: englishSource?.meta_description || '',
        meta_keywords: englishSource?.meta_keywords || '', og_title: englishSource?.og_title || '',
        og_description: englishSource?.og_description || '', twitter_title: englishSource?.twitter_title || '',
        twitter_description: englishSource?.twitter_description || '', focus_keyword: englishSource?.focus_keyword || '',
      };

      systemPrompt = `You are a professional multilingual SEO translator for GrowUpMore — an educational platform.

TASK: Translate the English content below into ALL the specified languages.

OUTPUT — return ONLY valid JSON with this EXACT structure:
{
  "hi": { "name": "...", "description": "...", "is_new_title": "...", "tags": "...", "meta_title": "...", "meta_description": "...", "meta_keywords": "...", "og_title": "...", "og_description": "...", "twitter_title": "...", "twitter_description": "...", "focus_keyword": "..." },
  "gu": { ... same fields translated ... }
}

LANGUAGES TO TRANSLATE: ${langList}

RULES:
- Translate EXACTLY with the same meaning into each language's native script.
- Keep technical terms, brand names, and words that sound unnatural when translated in English.
- Tags should be comma-separated strings.
- SEO fields should be optimized for each language while keeping exact meaning.
- Use the ISO code as the key for each language object.

USER INSTRUCTIONS: ${userPrompt}`;

      userContent = `English source content:\n${JSON.stringify(sourceContent)}`;
    }

    const bulkTokens = Math.max(8192, missingLangs.length * 3072);
    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent, bulkTokens);

    let allTranslations: any;
    try { allTranslations = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    const catSlug = subCat.categories?.slug || '';
    const results: any[] = [];
    for (const lang of missingLangs) {
      const translated = allTranslations[lang.iso_code];
      if (!translated) {
        results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: 'AI did not return translation for this language' });
        continue;
      }

      const tags = translated.tags ? (typeof translated.tags === 'string' ? translated.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : translated.tags) : [];

      // Generate JSON-LD structured data (4-level breadcrumb for sub-categories)
      const pageUrl = `https://growupmore.com/${lang.iso_code}/categories/${catSlug}/${subCat.slug}`;
      const structured_data = [
        {
          '@context': 'https://schema.org', '@type': 'CollectionPage',
          name: translated.name || '', ...(translated.description && { description: translated.description }),
          url: pageUrl, inLanguage: lang.iso_code,
          ...(subCat.image && { image: subCat.image }),
          isPartOf: { '@type': 'WebSite', name: 'GrowUpMore', url: 'https://growupmore.com' },
          provider: { '@type': 'Organization', name: 'GrowUpMore', url: 'https://growupmore.com' },
        },
        {
          '@context': 'https://schema.org', '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `https://growupmore.com/${lang.iso_code}` },
            { '@type': 'ListItem', position: 2, name: 'Categories', item: `https://growupmore.com/${lang.iso_code}/categories` },
            { '@type': 'ListItem', position: 3, name: parentCategory, item: `https://growupmore.com/${lang.iso_code}/categories/${catSlug}` },
            { '@type': 'ListItem', position: 4, name: translated.name || '' },
          ],
        },
        { '@context': 'https://schema.org', '@type': 'ItemList', name: translated.name || '', numberOfItems: 0, itemListElement: [] },
      ];

      const record: any = {
        sub_category_id,
        language_id: lang.id,
        name: translated.name || '',
        description: translated.description || '',
        is_new_title: translated.is_new_title || '',
        tags,
        meta_title: translated.meta_title || '',
        meta_description: translated.meta_description || '',
        meta_keywords: translated.meta_keywords || '',
        og_title: translated.og_title || '',
        og_description: translated.og_description || '',
        twitter_title: translated.twitter_title || '',
        twitter_description: translated.twitter_description || '',
        focus_keyword: translated.focus_keyword || '',
        structured_data,
        is_active: true,
        deleted_at: null,
        updated_by: userId,
      };

      const softDeletedId = softDeletedMap.get(lang.id);
      let saved: any, saveErr: any;

      if (softDeletedId) {
        const result = await supabase.from('sub_category_translations').update({ ...record, created_by: userId }).eq('id', softDeletedId).select().single();
        saved = result.data; saveErr = result.error;
      } else {
        const result = await supabase.from('sub_category_translations').insert({ ...record, created_by: userId }).select().single();
        saved = result.data; saveErr = result.error;
      }

      if (saveErr) {
        results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: saveErr.message });
      } else {
        results.push({ language: lang.name, iso_code: lang.iso_code, status: 'success', id: saved.id });
      }
    }

    logAdmin({ actorId: userId, action: 'ai_bulk_sub_category_translation_generated', targetType: 'sub_category_translation', targetId: Number(sub_category_id), targetName: `${subCat.code} → ${missingLangs.length} languages (${provider})`, ip: getClientIp(req) });

    const successCount = results.filter(r => r.status === 'success').length;
    return ok(res, {
      results, provider,
      total_tokens: inputTokens + outputTokens,
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, `Bulk generation complete: ${successCount}/${results.length} succeeded`);

  } catch (error: any) {
    console.error('AI bulkGenerateSubCategoryTranslations error:', error);
    return err(res, error.message || 'Bulk generation failed', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ─── AI TRANSLATION FOR MATERIAL MODULES (Subjects, Chapters, Topics) ─
// ═══════════════════════════════════════════════════════════════════════

// ─── Generic helper: material translation fields differ from category translations ───
const MATERIAL_FIELDS_SUBJECT = ['name', 'short_intro', 'long_intro'];
const MATERIAL_FIELDS_CHAPTER = ['name', 'short_intro', 'long_intro', 'prerequisites', 'learning_objectives'];
const MATERIAL_FIELDS_TOPIC   = ['name', 'short_intro', 'long_intro', 'prerequisites', 'learning_objectives'];
const MATERIAL_FIELDS_SUB_TOPIC = ['name', 'short_intro', 'long_intro', 'tags', 'video_title', 'video_description', 'meta_title', 'meta_description', 'meta_keywords', 'og_title', 'og_description', 'twitter_title', 'twitter_description', 'focus_keyword'];

const MATERIAL_FIELDS_COURSE = [
  'title', 'short_intro', 'long_intro', 'tagline',
  'video_title', 'video_description', 'is_new_title',
  'tags', 'prerequisites', 'skills_gain', 'what_you_will_learn',
  'course_includes', 'course_is_for', 'apply_for_designations',
  'demand_in_countries', 'salary_standard', 'future_courses',
  'meta_title', 'meta_description', 'meta_keywords',
  'og_title', 'og_description', 'twitter_title', 'twitter_description',
  'focus_keyword',
];
const COURSE_JSONB_FIELDS = ['tags', 'prerequisites', 'skills_gain', 'what_you_will_learn', 'course_includes', 'course_is_for', 'apply_for_designations', 'demand_in_countries', 'salary_standard', 'future_courses'];

const MATERIAL_FIELDS_COURSE_MODULE = [
  'name', 'short_intro', 'description',
  'tags',
  'meta_title', 'meta_description', 'meta_keywords',
  'og_title', 'og_description', 'twitter_title', 'twitter_description',
  'focus_keyword',
];
const COURSE_MODULE_JSONB_FIELDS = ['tags'];

const MATERIAL_FIELDS_BUNDLE = [
  'title', 'short_description', 'description',
  'highlights', 'tags',
  'meta_title', 'meta_description', 'meta_keywords',
  'og_title', 'og_description', 'twitter_title', 'twitter_description',
  'focus_keyword',
];
const BUNDLE_JSONB_FIELDS = ['highlights', 'tags'];

function buildMaterialJsonSpec(fields: string[]): string {
  return '{' + fields.map(f => `"${f}":"..."`).join(', ') + '}';
}

function extractMaterialFields(translated: any, fields: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const f of fields) result[f] = translated[f] || '';
  return result;
}

/** Convert comma-separated AI strings to arrays for JSONB columns */
function applyJsonbConversion(fields: Record<string, any>, jsonbFields?: string[]): void {
  if (!jsonbFields) return;
  for (const jf of jsonbFields) {
    const val = fields[jf];
    if (val && typeof val === 'string') {
      fields[jf] = val.split(',').map((s: string) => s.trim()).filter(Boolean);
    } else if (Array.isArray(val)) {
      // Already an array — ensure items are trimmed strings
      fields[jf] = val.map((s: any) => String(s).trim()).filter(Boolean);
    } else {
      fields[jf] = [];
    }
  }
}

// ─── Reusable helper: generate AI translations for all for_material languages ───
type MaterialEntityType = 'subject' | 'chapter' | 'topic' | 'sub_topic' | 'course' | 'course_module' | 'bundle';

const ENTITY_CONFIG: Record<MaterialEntityType, {
  table: string;
  translationTable: string;
  idField: string;
  fields: string[];
  entityLabel: string;
  jsonbFields?: string[];
  nameField?: string; // primary name field in translation table (default 'name')
}> = {
  subject: { table: 'subjects', translationTable: 'subject_translations', idField: 'subject_id', fields: MATERIAL_FIELDS_SUBJECT, entityLabel: 'subject' },
  chapter: { table: 'chapters', translationTable: 'chapter_translations', idField: 'chapter_id', fields: MATERIAL_FIELDS_CHAPTER, entityLabel: 'chapter' },
  topic: { table: 'topics', translationTable: 'topic_translations', idField: 'topic_id', fields: MATERIAL_FIELDS_TOPIC, entityLabel: 'topic' },
  sub_topic: { table: 'sub_topics', translationTable: 'sub_topic_translations', idField: 'sub_topic_id', fields: MATERIAL_FIELDS_SUB_TOPIC, entityLabel: 'sub-topic' },
  course: { table: 'courses', translationTable: 'course_translations', idField: 'course_id', fields: MATERIAL_FIELDS_COURSE, entityLabel: 'course', jsonbFields: COURSE_JSONB_FIELDS, nameField: 'title' },
  course_module: { table: 'course_modules', translationTable: 'course_module_translations', idField: 'course_module_id', fields: MATERIAL_FIELDS_COURSE_MODULE, entityLabel: 'course module', jsonbFields: COURSE_MODULE_JSONB_FIELDS },
  bundle: { table: 'bundles', translationTable: 'bundle_translations', idField: 'bundle_id', fields: MATERIAL_FIELDS_BUNDLE, entityLabel: 'bundle', jsonbFields: BUNDLE_JSONB_FIELDS, nameField: 'title' },
};

const DEFAULT_TRANSLATION_PROMPT = 'Create content in English language with human way writing style and convert exact English content with same meaning for other languages which are listed for translations. Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated. Most Important: don\'t write everything in pure regional language — use some common and technical English words in all outputs as it is. Keep technical or brand words in English that sound strange or unnatural or weird when translated. Write technical words like HTML5, CSS, JavaScript, Programming, Web Development, Database, Algorithm, Framework etc. in English script only, NOT in regional script.';

/**
 * Generate AI translations for an entity across all for_material languages.
 * Reusable by both the bulk API endpoints and importFromCdn.
 * Returns { results, totalInputTokens, totalOutputTokens }.
 */
async function generateAllTranslationsForEntity(
  entityType: MaterialEntityType,
  entityId: number,
  userId: string,
  provider: AIProvider = 'gemini',
  prompt?: string,
  forceRegenerate: boolean = false,
): Promise<{ results: any[]; totalInputTokens: number; totalOutputTokens: number }> {
  const cfg = ENTITY_CONFIG[entityType];
  const userPrompt = prompt || DEFAULT_TRANSLATION_PROMPT;

  // Fetch entity
  const { data: entity } = await supabase.from(cfg.table).select('*').eq('id', entityId).single();
  if (!entity) throw new Error(`${cfg.entityLabel} not found (id=${entityId})`);

  // For sub_topics, fetch parent topic slug for structured data breadcrumbs
  let parentTopicSlug = '';
  if (entityType === 'sub_topic' && entity.topic_id) {
    const { data: parentTopic } = await supabase.from('topics').select('slug').eq('id', entity.topic_id).single();
    parentTopicSlug = parentTopic?.slug || 'topic';
  }

  // Helper to generate JSON-LD structured data for sub-topic translations
  const buildStructuredData = (fields: any, isoCode: string): any[] | null => {
    if (entityType !== 'sub_topic') return null;
    const SITE_URL = 'https://growupmore.com';
    const SITE_NAME = 'GrowUpMore';
    const subTopicSlug = entity.slug || '';
    const topicSlug = parentTopicSlug;
    const headline = fields.meta_title || fields.og_title || fields.name || '';
    const desc = fields.meta_description || fields.og_description || fields.short_intro || '';
    const img = fields.og_image || fields.twitter_image || null;
    const keywords = fields.meta_keywords || fields.focus_keyword || undefined;
    const pageUrl = `${SITE_URL}/${isoCode}/subjects/${topicSlug}/${subTopicSlug}`;
    return [
      {
        '@context': 'https://schema.org', '@type': 'Article',
        name: headline, ...(desc && { description: desc }),
        url: pageUrl, inLanguage: isoCode,
        ...(img && { image: img }), ...(keywords && { keywords }),
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
        provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      },
      {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/${isoCode}` },
          { '@type': 'ListItem', position: 2, name: 'Subjects', item: `${SITE_URL}/${isoCode}/subjects` },
          { '@type': 'ListItem', position: 3, name: 'Subject', item: `${SITE_URL}/${isoCode}/subjects` },
          { '@type': 'ListItem', position: 4, name: 'Topic', item: `${SITE_URL}/${isoCode}/subjects/${topicSlug}` },
          { '@type': 'ListItem', position: 5, name: fields.name || '' },
        ],
      },
      { '@context': 'https://schema.org', '@type': 'ItemList', name: fields.name || '', numberOfItems: 0, itemListElement: [] },
    ];
  };

  // Fetch all for_material languages
  const { data: allLangs } = await supabase.from('languages').select('id, name, iso_code, native_name').eq('is_active', true).eq('for_material', true).order('id');
  if (!allLangs || allLangs.length === 0) return { results: [], totalInputTokens: 0, totalOutputTokens: 0 };

  // Find existing translations (fetch ALL fields so we can detect empty-content records)
  const { data: existing } = await supabase.from(cfg.translationTable).select('*').eq(cfg.idField, entityId);
  const activeTranslations = (existing || []).filter((e: any) => !e.deleted_at);
  const activeLangIds = new Set(activeTranslations.map((e: any) => e.language_id));
  const softDeletedMap = new Map((existing || []).filter((e: any) => e.deleted_at).map((e: any) => [e.language_id, e.id]));

  // Check which active translations have meaningful content vs just name/page
  const primaryNameField = cfg.nameField || 'name';
  const contentFields = cfg.fields.filter(f => f !== primaryNameField);
  const emptyTransMap = new Map<number, number>(); // language_id → translation record id (for update)
  for (const t of activeTranslations) {
    const hasContent = contentFields.some((f: string) => {
      const val = t[f];
      if (Array.isArray(val)) return val.length > 0;
      return val && typeof val === 'string' && val.trim().length > 0;
    });
    if (!hasContent) {
      emptyTransMap.set(t.language_id, t.id);
    }
  }

  // Languages that need work: truly missing OR exist but have no content
  // When forceRegenerate is true, include ALL languages (they'll be overwritten)
  let langsNeedingContent: typeof allLangs;
  if (forceRegenerate) {
    // Force regenerate: all languages need work (existing ones will be updated)
    langsNeedingContent = allLangs;
    // Also add existing translations to emptyTransMap so they get updated instead of inserted
    for (const t of activeTranslations) {
      if (!emptyTransMap.has(t.language_id)) {
        emptyTransMap.set(t.language_id, t.id);
      }
    }
  } else {
    const missingLangs = allLangs.filter(l => !activeLangIds.has(l.id));
    const emptyLangs = allLangs.filter(l => emptyTransMap.has(l.id));
    langsNeedingContent = [...missingLangs, ...emptyLangs];
  }

  if (langsNeedingContent.length === 0) return { results: [], totalInputTokens: 0, totalOutputTokens: 0 };

  // Check if English already exists with meaningful content
  const enLangRecord = allLangs.find(l => l.iso_code === 'en');
  let englishSource: any = null;
  let englishExistsInDb = activeLangIds.has(enLangRecord?.id); // true if English translation row exists
  let englishHasContent = false;

  if (englishExistsInDb && enLangRecord) {
    englishSource = activeTranslations.find((t: any) => t.language_id === enLangRecord.id);
    // Check if English has actual content beyond just name/title
    englishHasContent = englishSource && contentFields.some((f: string) => {
      const val = englishSource[f];
      if (Array.isArray(val)) return val.length > 0;
      return val && typeof val === 'string' && val.trim().length > 0;
    });
  }

  // If English exists but is empty (name-only from CDN import), we need to generate English content first
  const needsEnglishGeneration = englishExistsInDb && !englishHasContent;

  const entityName = entity.name || entity.title || entity.code || entity.slug || '';

  // Build extra field rules
  const extraRules = entityType === 'subject'
    ? 'name = full subject name; short_intro = 1-2 sentences; long_intro = 3-5 sentences.'
    : entityType === 'chapter' || entityType === 'topic'
    ? `name = full ${cfg.entityLabel} name; short_intro = 1-2 sentences; long_intro = 3-5 sentences; prerequisites = what learners should know; learning_objectives = what they'll achieve.`
    : entityType === 'course'
    ? `title = full course title; short_intro = 1-2 sentences; long_intro = 3-5 sentences; tagline = catchy one-liner; video_title = concise video title; video_description = 2-3 sentence video description; is_new_title = badge text like "New" or "Updated"; tags = comma-separated relevant tags; prerequisites = comma-separated prerequisite knowledge; skills_gain = comma-separated skills students will gain; what_you_will_learn = comma-separated learning outcomes; course_includes = comma-separated items included (e.g. "10 video lectures, 5 quizzes"); course_is_for = comma-separated target audience descriptions; apply_for_designations = comma-separated career designations; demand_in_countries = comma-separated country names; salary_standard = comma-separated salary ranges; future_courses = comma-separated next course suggestions; meta_title = SEO page title (50-60 chars); meta_description = SEO description (150-160 chars); meta_keywords = comma-separated SEO keywords; og_title = Open Graph title; og_description = Open Graph description (1-2 sentences); twitter_title = Twitter card title; twitter_description = Twitter card description (1-2 sentences); focus_keyword = primary SEO keyword.`
    : entityType === 'course_module'
    ? `name = full module name; short_intro = 1-2 sentences; description = 3-5 sentence module description; tags = comma-separated relevant tags; meta_title = SEO page title (50-60 chars); meta_description = SEO description (150-160 chars); meta_keywords = comma-separated SEO keywords; og_title = Open Graph title; og_description = Open Graph description (1-2 sentences); twitter_title = Twitter card title; twitter_description = Twitter card description (1-2 sentences); focus_keyword = primary SEO keyword.`
    : entityType === 'bundle'
    ? `title = full bundle title; short_description = 1-2 sentences; description = 3-5 sentence bundle description; highlights = comma-separated key highlights; tags = comma-separated relevant tags; meta_title = SEO page title (50-60 chars); meta_description = SEO description (150-160 chars); meta_keywords = comma-separated SEO keywords; og_title = Open Graph title; og_description = Open Graph description (1-2 sentences); twitter_title = Twitter card title; twitter_description = Twitter card description (1-2 sentences); focus_keyword = primary SEO keyword.`
    : `name = full ${cfg.entityLabel} name; short_intro = 1-2 sentences; long_intro = 3-5 sentences; tags = comma-separated relevant tags; video_title = concise video title; video_description = 2-3 sentence video description; meta_title = SEO page title (50-60 chars); meta_description = SEO description (150-160 chars); meta_keywords = comma-separated SEO keywords; og_title = Open Graph title; og_description = Open Graph description (1-2 sentences); twitter_title = Twitter card title; twitter_description = Twitter card description (1-2 sentences); focus_keyword = primary SEO keyword.`;

  // ─── Step A: If English exists but is empty, generate English content first ───
  if (needsEnglishGeneration) {
    const enJsonSpec = buildMaterialJsonSpec(cfg.fields);
    const enSystemPrompt = `You are a professional educational content writer for GrowUpMore — an educational platform.
TASK: Generate comprehensive English content for the ${cfg.entityLabel} below.
OUTPUT — return ONLY valid JSON: ${enJsonSpec}
RULES: ${extraRules} Write in a natural, human way. Be thorough and informative.`;
    const enUserContent = JSON.stringify({ name: entityName, slug: entity.slug || '', code: entity.code || '' });

    try {
      const { text: enText, inputTokens: enIn, outputTokens: enOut } = await callAI(provider, enSystemPrompt, enUserContent);
      const enTranslated = parseJSON(enText);
      const enFields = extractMaterialFields(enTranslated, cfg.fields);
      applyJsonbConversion(enFields, cfg.jsonbFields);

      // Generate structured data for sub-topic translations
      const enStructuredData = buildStructuredData(enFields, 'en');

      // Update the existing English translation record with full content
      if (englishSource?.id) {
        await supabase.from(cfg.translationTable).update({
          ...enFields,
          ...(enStructuredData && { structured_data: enStructuredData }),
          updated_by: userId,
        }).eq('id', englishSource.id);
      } else if (enLangRecord) {
        // English record might not exist yet (edge case)
        await supabase.from(cfg.translationTable).upsert({
          [cfg.idField]: entityId,
          language_id: enLangRecord.id,
          ...enFields,
          ...(enStructuredData && { structured_data: enStructuredData }),
          is_active: true,
          created_by: userId,
        }, { onConflict: `${cfg.idField},language_id` });
      }

      // Never overwrite entity name with AI-generated name — the user-set name is authoritative.
      // The forward sync (entity.name → English translation) already exists in CRUD controllers.

      // Refresh englishSource with the new content for translation step
      englishSource = { ...englishSource, ...enFields };
      englishHasContent = true;
    } catch (enErr: any) {
      console.error(`Failed to generate English content for ${cfg.entityLabel} ${entityId}:`, enErr);
      // Continue anyway — translations will be generated from name only
    }
  }

  // ─── Step B: Generate translations for all other missing/empty languages ───
  // Include both truly missing and empty (name-only) translations, excluding English (handled above)
  const langsToTranslate = langsNeedingContent.filter(l => l.iso_code !== 'en');

  if (langsToTranslate.length === 0) return { results: [], totalInputTokens: 0, totalOutputTokens: 0 };

  const langList = langsToTranslate.map(l => `${l.iso_code}: ${l.name}`).join(', ');
  const jsonSpec = buildMaterialJsonSpec(cfg.fields);

  let systemPrompt: string;
  let userContent: string;

  if (!englishHasContent) {
    // No English content at all — generate everything from scratch
    systemPrompt = `You are a professional educational content writer and multilingual translator for GrowUpMore.
TASK: Generate comprehensive English content for the ${cfg.entityLabel} below, then translate into ALL specified languages.
OUTPUT — return ONLY valid JSON: { "en": ${jsonSpec}, ${langsToTranslate.map(l => `"${l.iso_code}": ${jsonSpec}`).join(', ')} }
LANGUAGES: en: English, ${langList}
RULES: ${extraRules} Translate EXACTLY. Use ISO code as key. Write in a natural, human way.
MOST IMPORTANT — STRICTLY FOLLOW: Do NOT write in pure regional languages. MUST keep technical/subject/brand English words in English script (Latin letters) — do NOT transliterate. Example (Hindi): "HTML5 की Fundamentals सीखें। Web Development में Semantic Elements को cover करता है।" NOT "एचटीएमएल5 की मूल बातें।"
USER INSTRUCTIONS: ${userPrompt}`;
    userContent = JSON.stringify({ name: entityName, slug: entity.slug || '', code: entity.code || '' });
  } else {
    // English content exists — translate from it
    const sourceContent: any = {};
    for (const f of cfg.fields) sourceContent[f] = englishSource?.[f] || '';
    systemPrompt = `You are a professional multilingual educational translator for GrowUpMore.
TASK: Translate English content into ALL specified languages.
OUTPUT — return ONLY valid JSON: { ${langsToTranslate.map(l => `"${l.iso_code}": ${jsonSpec}`).join(', ')} }
LANGUAGES: ${langList}
RULES: Translate EXACTLY with same meaning. Use ISO code as key. Write in a natural, human way.

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Do NOT write everything in pure regional languages. You MUST keep common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Modern Web Development में Semantic Elements और Forms को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें। आधुनिक वेब डेवलपमेंट..." — WRONG, technical words must stay in English script.
The output should be a MIX of regional language and English technical words in English script.

USER INSTRUCTIONS: ${userPrompt}`;
    userContent = `English source:\n${JSON.stringify(sourceContent)}`;
  }

  const bulkMaxTokens = Math.max(8192, langsToTranslate.length * 4096);
  let allTranslations: any = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Try bulk AI call with retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent, bulkMaxTokens);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      allTranslations = parseJSON(text);
      break;
    } catch (parseErr) {
      console.error(`Bulk ${cfg.entityLabel} translation attempt ${attempt + 1} failed:`, parseErr);
      if (attempt === 1) allTranslations = null;
    }
  }

  const results: any[] = [];

  // If bulk failed, fall back to one-by-one
  if (!allTranslations) {
    console.log(`Bulk ${cfg.entityLabel} translation failed, falling back to per-language...`);
    for (const lang of langsToTranslate) {
      try {
        const singleSpec = buildMaterialJsonSpec(cfg.fields);
        const singleSys = `You are a professional multilingual educational translator for GrowUpMore.
TASK: Translate the English content below into ${lang.name} (${lang.iso_code}).
OUTPUT — return ONLY valid JSON: ${singleSpec}
RULES: Translate EXACTLY with same meaning. Write in a natural, human way.
MOST IMPORTANT: Do NOT write in pure ${lang.name}. Keep technical/brand English words in English script. Example: "HTML5 की Fundamentals सीखें।"
USER INSTRUCTIONS: ${userPrompt}`;
        const fallbackSource: any = {};
        for (const f of cfg.fields) fallbackSource[f] = englishSource?.[f] || '';
        const singleUser = `English source:\n${JSON.stringify(fallbackSource)}`;
        const { text: singleText, inputTokens: sIn, outputTokens: sOut } = await callAI(provider, singleSys, singleUser);
        totalInputTokens += sIn;
        totalOutputTokens += sOut;
        const translated = parseJSON(singleText);
        const translatedFields = extractMaterialFields(translated, cfg.fields);
        applyJsonbConversion(translatedFields, cfg.jsonbFields);
        const sd = buildStructuredData(translatedFields, lang.iso_code);

        const record: any = {
          [cfg.idField]: entityId, language_id: lang.id,
          ...translatedFields,
          ...(sd && { structured_data: sd }),
          is_active: true, deleted_at: null, updated_by: userId,
        };
        const softDeletedId = softDeletedMap.get(lang.id);
        const emptyExistingId = emptyTransMap.get(lang.id);
        let saved: any, saveErr: any;
        if (softDeletedId) {
          const r2 = await supabase.from(cfg.translationTable).update({ ...record, created_by: userId }).eq('id', softDeletedId).select().single();
          saved = r2.data; saveErr = r2.error;
        } else if (emptyExistingId) {
          // Update existing empty translation with AI content (preserves page_url etc.)
          const r2 = await supabase.from(cfg.translationTable).update({ ...translatedFields, ...(sd && { structured_data: sd }), updated_by: userId }).eq('id', emptyExistingId).select().single();
          saved = r2.data; saveErr = r2.error;
        } else {
          const r2 = await supabase.from(cfg.translationTable).insert({ ...record, created_by: userId }).select().single();
          saved = r2.data; saveErr = r2.error;
        }
        results.push(saveErr
          ? { language: lang.name, iso_code: lang.iso_code, status: 'error', error: saveErr.message }
          : { language: lang.name, iso_code: lang.iso_code, status: 'success', id: saved.id });
      } catch (langErr: any) {
        results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: langErr.message || 'Translation failed' });
      }
    }
  } else {
    // Bulk succeeded — save each language
    for (const lang of langsToTranslate) {
      const translated = allTranslations[lang.iso_code];
      if (!translated) { results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: 'AI did not return translation' }); continue; }

      const translatedFields = extractMaterialFields(translated, cfg.fields);
      applyJsonbConversion(translatedFields, cfg.jsonbFields);
      const sd = buildStructuredData(translatedFields, lang.iso_code);

      const record: any = {
        [cfg.idField]: entityId, language_id: lang.id,
        ...translatedFields,
        ...(sd && { structured_data: sd }),
        is_active: true, deleted_at: null, updated_by: userId,
      };
      const softDeletedId = softDeletedMap.get(lang.id);
      const emptyExistingId = emptyTransMap.get(lang.id);
      let saved: any, saveErr: any;
      if (softDeletedId) {
        const r2 = await supabase.from(cfg.translationTable).update({ ...record, created_by: userId }).eq('id', softDeletedId).select().single();
        saved = r2.data; saveErr = r2.error;
      } else if (emptyExistingId) {
        // Update existing empty translation with AI content (preserves page_url etc.)
        const r2 = await supabase.from(cfg.translationTable).update({ ...translatedFields, ...(sd && { structured_data: sd }), updated_by: userId }).eq('id', emptyExistingId).select().single();
        saved = r2.data; saveErr = r2.error;
      } else {
        const r2 = await supabase.from(cfg.translationTable).insert({ ...record, created_by: userId }).select().single();
        saved = r2.data; saveErr = r2.error;
      }
      results.push(saveErr
        ? { language: lang.name, iso_code: lang.iso_code, status: 'error', error: saveErr.message }
        : { language: lang.name, iso_code: lang.iso_code, status: 'success', id: saved.id });
    }

    // If English was generated via bulk (no content path), update entity + English translation
    if (!englishHasContent && allTranslations['en']) {
      const enFields = extractMaterialFields(allTranslations['en'], cfg.fields);
      applyJsonbConversion(enFields, cfg.jsonbFields);
      const enSd = buildStructuredData(enFields, 'en');
      const enNameVal = enFields[primaryNameField];
      if (enNameVal) await supabase.from(cfg.table).update({ name: typeof enNameVal === 'string' ? enNameVal : entity.name }).eq('id', entityId);
      if (englishSource?.id) {
        await supabase.from(cfg.translationTable).update({ ...enFields, ...(enSd && { structured_data: enSd }), updated_by: userId }).eq('id', englishSource.id);
      }
    }
  }

  return { results, totalInputTokens, totalOutputTokens };
}

// ─── SUBJECT translation (single) ───
export async function generateSubjectTranslation(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { subject_id, target_language_code, target_language_name, prompt, provider: reqProvider } = req.body;
    if (!subject_id || !target_language_code) return err(res, 'subject_id and target_language_code are required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const isEnglish = target_language_code === 'en';
    const targetLang = target_language_name || target_language_code;
    const userPrompt = prompt || (isEnglish
      ? 'Generate educational content with engaging introductions.'
      : 'Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated.');

    const { data: subject } = await supabase.from('subjects').select('*').eq('id', subject_id).single();
    if (!subject) return err(res, 'Subject not found', 404);

    let systemPrompt: string;
    let userContent: string;
    const jsonSpec = buildMaterialJsonSpec(MATERIAL_FIELDS_SUBJECT);

    if (isEnglish) {
      systemPrompt = `You are a professional educational content writer for GrowUpMore — an educational platform.
Generate comprehensive English content for the subject. Write in a natural, human way — not robotic or overly formal. Fill ALL fields.
- name: Full name of the subject
- short_intro: 1-2 sentence engaging introduction
- long_intro: 3-5 sentence detailed introduction covering scope and importance
OUTPUT — return ONLY valid JSON: ${jsonSpec}
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ code: subject.code, slug: subject.slug, name: subject.name || subject.code, description: subject.description || '' });
    } else {
      const { data: enTrans } = await supabase.from('subject_translations').select('*, languages!inner(iso_code)').eq('subject_id', subject_id).eq('languages.iso_code', 'en').is('deleted_at', null).limit(1);
      const source = enTrans?.[0];
      if (!source) return err(res, 'English translation not found. Please create the English version first.', 404);

      const sourceContent: any = {};
      for (const f of MATERIAL_FIELDS_SUBJECT) sourceContent[f] = source[f] || '';

      systemPrompt = `You are a professional multilingual educational translator.
Translate English content into ${targetLang} (${target_language_code}) with EXACT same meaning.
RULES:
- Keep JSON keys in English.
- Write in a natural, human way — not robotic or overly formal.

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Do NOT write everything in pure ${targetLang}. You MUST use common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Modern Web Development के लिए Semantic Elements और Multimedia Integration को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें सीखें। आधुनिक वेब डेवलपमेंट की नींव..." — This is WRONG because technical words are transliterated.
The output should be a MIX of regional language and English technical words written in English script.

USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify(sourceContent);
    }

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);
    let translated: any;
    try { translated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    logAdmin({ actorId: userId, action: isEnglish ? 'ai_content_generated' : 'ai_translation_generated', targetType: 'subject_translation', targetId: Number(subject_id), targetName: `${subject.code} → ${targetLang} (${provider})`, ip: getClientIp(req) });

    return ok(res, {
      source_language: isEnglish ? 'subject_info' : 'en', target_language: target_language_code, provider,
      translated: extractMaterialFields(translated, MATERIAL_FIELDS_SUBJECT),
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, isEnglish ? 'Content generated successfully' : 'Translation generated successfully');
  } catch (error: any) {
    console.error('AI generateSubjectTranslation error:', error);
    return err(res, error.message || 'AI generation failed', 500);
  }
}

// ─── SUBJECT translation (bulk) ───
export async function bulkGenerateSubjectTranslations(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { subject_id, prompt, provider: reqProvider } = req.body;
    if (!subject_id) return err(res, 'subject_id is required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    const { data: subject } = await supabase.from('subjects').select('*').eq('id', subject_id).single();
    if (!subject) return err(res, 'Subject not found', 404);

    const { data: allLangs } = await supabase.from('languages').select('id, name, iso_code, native_name').eq('is_active', true).eq('for_material', true).order('id');
    if (!allLangs || allLangs.length === 0) return err(res, 'No active languages found', 404);

    const { data: existing } = await supabase.from('subject_translations').select('id, language_id, deleted_at').eq('subject_id', subject_id);
    const activeLangIds = new Set((existing || []).filter(e => !e.deleted_at).map(e => e.language_id));
    const softDeletedMap = new Map((existing || []).filter(e => e.deleted_at).map(e => [e.language_id, e.id]));
    const missingLangs = allLangs.filter(l => !activeLangIds.has(l.id));

    if (missingLangs.length === 0) return ok(res, { results: [], message: 'All languages already have translations' });

    const userPrompt = prompt || 'Create content in English language with human way writing style and convert exact English content with same meaning for other languages which are listed for translations. Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated. Most Important: don\'t write everything in pure regional language — use some common and technical English words in all outputs as it is. Keep technical or brand words in English that sound strange or unnatural or weird when translated. Write technical words like HTML5, CSS, JavaScript, Programming, Web Development, Database, Algorithm, Framework etc. in English script only, NOT in regional script.';
    const hasEnglish = !missingLangs.find(l => l.iso_code === 'en');
    let englishSource: any = null;
    if (hasEnglish) {
      const { data: enTrans } = await supabase.from('subject_translations').select('*').eq('subject_id', subject_id).is('deleted_at', null);
      const enLang = allLangs.find(l => l.iso_code === 'en');
      if (enLang && enTrans) englishSource = enTrans.find((t: any) => t.language_id === enLang.id);
    }

    const langList = missingLangs.map(l => `${l.iso_code}: ${l.name}`).join(', ');
    const jsonSpec = buildMaterialJsonSpec(MATERIAL_FIELDS_SUBJECT);

    let systemPrompt: string;
    let userContent: string;

    if (!hasEnglish) {
      systemPrompt = `You are a professional educational content writer and multilingual translator for GrowUpMore.
TASK: Generate comprehensive English content for the subject below, then translate into ALL specified languages.
OUTPUT — return ONLY valid JSON: { "en": ${jsonSpec}, "hi": ${jsonSpec}, ... }
LANGUAGES: ${langList}
RULES: name = full subject name; short_intro = 1-2 sentences; long_intro = 3-5 sentences. Translate EXACTLY with same meaning. Use ISO code as key. Write in a natural, human way.
MOST IMPORTANT: Do NOT write in pure regional languages. MUST keep technical English words in English script (Latin letters) — do NOT transliterate. Example (Hindi): "HTML5 की Fundamentals सीखें। Web Development में Semantic Elements को cover करता है।" NOT "एचटीएमएल5 की मूल बातें।"
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ code: subject.code, slug: subject.slug, name: subject.name || subject.code, description: subject.description || '' });
    } else {
      const sourceContent: any = {};
      for (const f of MATERIAL_FIELDS_SUBJECT) sourceContent[f] = englishSource?.[f] || '';
      systemPrompt = `You are a professional multilingual educational translator for GrowUpMore.
TASK: Translate English content into ALL specified languages.
OUTPUT — return ONLY valid JSON: { "hi": ${jsonSpec}, ... }
LANGUAGES: ${langList}
RULES: Translate EXACTLY with same meaning. Use ISO code as key. Write in a natural, human way.

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Do NOT write everything in pure regional languages. You MUST keep common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Modern Web Development में Semantic Elements और Forms को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें। आधुनिक वेब डेवलपमेंट..." — WRONG, technical words must stay in English script.
The output should be a MIX of regional language and English technical words in English script.

USER INSTRUCTIONS: ${userPrompt}`;
      userContent = `English source:\n${JSON.stringify(sourceContent)}`;
    }

    const bulkTokens = Math.max(8192, missingLangs.length * 4096);
    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent, bulkTokens);
    let allTranslations: any;
    try { allTranslations = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    const results: any[] = [];
    for (const lang of missingLangs) {
      const translated = allTranslations[lang.iso_code];
      if (!translated) { results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: 'AI did not return translation for this language' }); continue; }

      const record: any = {
        subject_id, language_id: lang.id,
        ...extractMaterialFields(translated, MATERIAL_FIELDS_SUBJECT),
        is_active: true, deleted_at: null, updated_by: userId,
      };

      const softDeletedId = softDeletedMap.get(lang.id);
      let saved: any, saveErr: any;
      if (softDeletedId) {
        const r2 = await supabase.from('subject_translations').update({ ...record, created_by: userId }).eq('id', softDeletedId).select().single();
        saved = r2.data; saveErr = r2.error;
      } else {
        const r2 = await supabase.from('subject_translations').insert({ ...record, created_by: userId }).select().single();
        saved = r2.data; saveErr = r2.error;
      }

      results.push(saveErr
        ? { language: lang.name, iso_code: lang.iso_code, status: 'error', error: saveErr.message }
        : { language: lang.name, iso_code: lang.iso_code, status: 'success', id: saved.id });
    }

    logAdmin({ actorId: userId, action: 'ai_bulk_translation_generated', targetType: 'subject_translation', targetId: Number(subject_id), targetName: `${subject.code} → ${missingLangs.length} languages (${provider})`, ip: getClientIp(req) });
    const successCount = results.filter(r => r.status === 'success').length;
    return ok(res, { results, provider, usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } }, `Bulk generation complete: ${successCount}/${results.length} succeeded`);
  } catch (error: any) {
    console.error('AI bulkGenerateSubjectTranslations error:', error);
    return err(res, error.message || 'Bulk generation failed', 500);
  }
}

// ─── CHAPTER translation (single) ───
export async function generateChapterTranslation(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { chapter_id, target_language_code, target_language_name, prompt, provider: reqProvider } = req.body;
    if (!chapter_id || !target_language_code) return err(res, 'chapter_id and target_language_code are required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const isEnglish = target_language_code === 'en';
    const targetLang = target_language_name || target_language_code;
    const userPrompt = prompt || (isEnglish
      ? 'Generate educational content with clear learning objectives and prerequisites.'
      : 'Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated.');

    const { data: chapter } = await supabase.from('chapters').select('*').eq('id', chapter_id).single();
    if (!chapter) return err(res, 'Chapter not found', 404);

    let systemPrompt: string;
    let userContent: string;
    const jsonSpec = buildMaterialJsonSpec(MATERIAL_FIELDS_CHAPTER);

    if (isEnglish) {
      systemPrompt = `You are a professional educational content writer for GrowUpMore — an educational platform.
Generate comprehensive English content for the chapter. Write in a natural, human way — not robotic or overly formal. Fill ALL fields.
- name: Full name of the chapter
- short_intro: 1-2 sentence engaging introduction
- long_intro: 3-5 sentence detailed introduction
- prerequisites: What learners should know before starting this chapter
- learning_objectives: What learners will achieve after completing this chapter (bullet points as text)
OUTPUT — return ONLY valid JSON: ${jsonSpec}
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ code: chapter.code || '', slug: chapter.slug, name: chapter.name || chapter.code, parent_subject: chapter.subjects?.code || '' });
    } else {
      const { data: enTrans } = await supabase.from('chapter_translations').select('*, languages!inner(iso_code)').eq('chapter_id', chapter_id).eq('languages.iso_code', 'en').is('deleted_at', null).limit(1);
      const source = enTrans?.[0];
      if (!source) return err(res, 'English translation not found. Please create the English version first.', 404);

      const sourceContent: any = {};
      for (const f of MATERIAL_FIELDS_CHAPTER) sourceContent[f] = source[f] || '';

      systemPrompt = `You are a professional multilingual educational translator.
Translate English content into ${targetLang} (${target_language_code}) with EXACT same meaning.
RULES:
- Keep JSON keys in English.
- Write in a natural, human way — not robotic or overly formal.

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Do NOT write everything in pure ${targetLang}. You MUST use common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Modern Web Development के लिए Semantic Elements और Multimedia Integration को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें सीखें। आधुनिक वेब डेवलपमेंट की नींव..." — This is WRONG because technical words are transliterated.
The output should be a MIX of regional language and English technical words written in English script.

USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify(sourceContent);
    }

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);
    let translated: any;
    try { translated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    logAdmin({ actorId: userId, action: isEnglish ? 'ai_content_generated' : 'ai_translation_generated', targetType: 'chapter_translation', targetId: Number(chapter_id), targetName: `${chapter.code || chapter.slug} → ${targetLang} (${provider})`, ip: getClientIp(req) });

    return ok(res, {
      source_language: isEnglish ? 'chapter_info' : 'en', target_language: target_language_code, provider,
      translated: extractMaterialFields(translated, MATERIAL_FIELDS_CHAPTER),
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, isEnglish ? 'Content generated successfully' : 'Translation generated successfully');
  } catch (error: any) {
    console.error('AI generateChapterTranslation error:', error);
    return err(res, error.message || 'AI generation failed', 500);
  }
}

// ─── CHAPTER translation (bulk) ───
export async function bulkGenerateChapterTranslations(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { chapter_id, prompt, provider: reqProvider } = req.body;
    if (!chapter_id) return err(res, 'chapter_id is required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const { data: chapter } = await supabase.from('chapters').select('*').eq('id', chapter_id).single();
    if (!chapter) return err(res, 'Chapter not found', 404);

    const { data: allLangs } = await supabase.from('languages').select('id, name, iso_code, native_name').eq('is_active', true).eq('for_material', true).order('id');
    if (!allLangs || allLangs.length === 0) return err(res, 'No active languages found', 404);

    const { data: existing } = await supabase.from('chapter_translations').select('id, language_id, deleted_at').eq('chapter_id', chapter_id);
    const activeLangIds = new Set((existing || []).filter(e => !e.deleted_at).map(e => e.language_id));
    const softDeletedMap = new Map((existing || []).filter(e => e.deleted_at).map(e => [e.language_id, e.id]));
    const missingLangs = allLangs.filter(l => !activeLangIds.has(l.id));

    if (missingLangs.length === 0) return ok(res, { results: [], message: 'All languages already have translations' });

    const userPrompt = prompt || 'Create content in English language with human way writing style and convert exact English content with same meaning for other languages which are listed for translations. Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated. Most Important: don\'t write everything in pure regional language — use some common and technical English words in all outputs as it is. Keep technical or brand words in English that sound strange or unnatural or weird when translated. Write technical words like HTML5, CSS, JavaScript, Programming, Web Development, Database, Algorithm, Framework etc. in English script only, NOT in regional script.';
    const hasEnglish = !missingLangs.find(l => l.iso_code === 'en');
    let englishSource: any = null;
    if (hasEnglish) {
      const { data: enTrans } = await supabase.from('chapter_translations').select('*').eq('chapter_id', chapter_id).is('deleted_at', null);
      const enLang = allLangs.find(l => l.iso_code === 'en');
      if (enLang && enTrans) englishSource = enTrans.find((t: any) => t.language_id === enLang.id);
    }

    const langList = missingLangs.map(l => `${l.iso_code}: ${l.name}`).join(', ');
    const jsonSpec = buildMaterialJsonSpec(MATERIAL_FIELDS_CHAPTER);

    let systemPrompt: string;
    let userContent: string;

    if (!hasEnglish) {
      systemPrompt = `You are a professional educational content writer and multilingual translator for GrowUpMore.
TASK: Generate comprehensive English content for the chapter below, then translate into ALL specified languages.
OUTPUT — return ONLY valid JSON: { "en": ${jsonSpec}, "hi": ${jsonSpec}, ... }
LANGUAGES: ${langList}
RULES: name = full chapter name; short_intro = 1-2 sentences; long_intro = 3-5 sentences; prerequisites = what learners should know; learning_objectives = what they'll achieve. Translate EXACTLY. Use ISO code as key. Write in a natural, human way.
MOST IMPORTANT — STRICTLY FOLLOW: Do NOT write in pure regional languages. MUST keep technical/subject/brand English words in English script (Latin letters) — do NOT transliterate. Example (Hindi): "HTML5 की Fundamentals सीखें। Web Development में Semantic Elements को cover करता है।" NOT "एचटीएमएल5 की मूल बातें।"
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ code: chapter.code || '', slug: chapter.slug, name: chapter.name || chapter.code, parent_subject: chapter.subjects?.code || '' });
    } else {
      const sourceContent: any = {};
      for (const f of MATERIAL_FIELDS_CHAPTER) sourceContent[f] = englishSource?.[f] || '';
      systemPrompt = `You are a professional multilingual educational translator for GrowUpMore.
TASK: Translate English content into ALL specified languages.
OUTPUT — return ONLY valid JSON: { "hi": ${jsonSpec}, ... }
LANGUAGES: ${langList}
RULES: Translate EXACTLY with same meaning. Use ISO code as key. Write in a natural, human way.

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Do NOT write everything in pure regional languages. You MUST keep common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Modern Web Development में Semantic Elements और Forms को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें। आधुनिक वेब डेवलपमेंट..." — WRONG, technical words must stay in English script.
The output should be a MIX of regional language and English technical words in English script.

USER INSTRUCTIONS: ${userPrompt}`;
      userContent = `English source:\n${JSON.stringify(sourceContent)}`;
    }

    const bulkTokens = Math.max(8192, missingLangs.length * 4096);
    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent, bulkTokens);
    let allTranslations: any;
    try { allTranslations = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    const results: any[] = [];
    for (const lang of missingLangs) {
      const translated = allTranslations[lang.iso_code];
      if (!translated) { results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: 'AI did not return translation for this language' }); continue; }

      const record: any = {
        chapter_id, language_id: lang.id,
        ...extractMaterialFields(translated, MATERIAL_FIELDS_CHAPTER),
        is_active: true, deleted_at: null, updated_by: userId,
      };

      const softDeletedId = softDeletedMap.get(lang.id);
      let saved: any, saveErr: any;
      if (softDeletedId) {
        const r2 = await supabase.from('chapter_translations').update({ ...record, created_by: userId }).eq('id', softDeletedId).select().single();
        saved = r2.data; saveErr = r2.error;
      } else {
        const r2 = await supabase.from('chapter_translations').insert({ ...record, created_by: userId }).select().single();
        saved = r2.data; saveErr = r2.error;
      }

      results.push(saveErr
        ? { language: lang.name, iso_code: lang.iso_code, status: 'error', error: saveErr.message }
        : { language: lang.name, iso_code: lang.iso_code, status: 'success', id: saved.id });
    }

    logAdmin({ actorId: userId, action: 'ai_bulk_translation_generated', targetType: 'chapter_translation', targetId: Number(chapter_id), targetName: `${chapter.code || chapter.slug} → ${missingLangs.length} languages (${provider})`, ip: getClientIp(req) });
    const successCount = results.filter(r => r.status === 'success').length;
    return ok(res, { results, provider, usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } }, `Bulk generation complete: ${successCount}/${results.length} succeeded`);
  } catch (error: any) {
    console.error('AI bulkGenerateChapterTranslations error:', error);
    return err(res, error.message || 'Bulk generation failed', 500);
  }
}

// ─── TOPIC translation (single) ───
export async function generateTopicTranslation(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { topic_id, target_language_code, target_language_name, prompt, provider: reqProvider } = req.body;
    if (!topic_id || !target_language_code) return err(res, 'topic_id and target_language_code are required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const isEnglish = target_language_code === 'en';
    const targetLang = target_language_name || target_language_code;
    const userPrompt = prompt || (isEnglish
      ? 'Generate educational content with clear learning objectives and prerequisites.'
      : 'Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated.');

    const { data: topic } = await supabase.from('topics').select('*').eq('id', topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);

    let systemPrompt: string;
    let userContent: string;
    const jsonSpec = buildMaterialJsonSpec(MATERIAL_FIELDS_TOPIC);

    if (isEnglish) {
      systemPrompt = `You are a professional educational content writer for GrowUpMore — an educational platform.
Generate comprehensive English content for the topic. Write in a natural, human way — not robotic or overly formal. Fill ALL fields.
- name: Full name of the topic
- short_intro: 1-2 sentence engaging introduction
- long_intro: 3-5 sentence detailed introduction
- prerequisites: What learners should know before starting this topic
- learning_objectives: What learners will achieve after completing this topic (bullet points as text)
OUTPUT — return ONLY valid JSON: ${jsonSpec}
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ code: topic.code || '', slug: topic.slug, name: topic.name || topic.code, parent_chapter: topic.chapters?.code || '', parent_subject: topic.chapters?.subjects?.code || '' });
    } else {
      const { data: enTrans } = await supabase.from('topic_translations').select('*, languages!inner(iso_code)').eq('topic_id', topic_id).eq('languages.iso_code', 'en').is('deleted_at', null).limit(1);
      const source = enTrans?.[0];
      if (!source) return err(res, 'English translation not found. Please create the English version first.', 404);

      const sourceContent: any = {};
      for (const f of MATERIAL_FIELDS_TOPIC) sourceContent[f] = source[f] || '';

      systemPrompt = `You are a professional multilingual educational translator.
Translate English content into ${targetLang} (${target_language_code}) with EXACT same meaning.
RULES:
- Keep JSON keys in English.
- Write in a natural, human way — not robotic or overly formal.

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Do NOT write everything in pure ${targetLang}. You MUST use common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Modern Web Development के लिए Semantic Elements और Multimedia Integration को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें सीखें। आधुनिक वेब डेवलपमेंट की नींव..." — This is WRONG because technical words are transliterated.
The output should be a MIX of regional language and English technical words written in English script.

USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify(sourceContent);
    }

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);
    let translated: any;
    try { translated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    logAdmin({ actorId: userId, action: isEnglish ? 'ai_content_generated' : 'ai_translation_generated', targetType: 'topic_translation', targetId: Number(topic_id), targetName: `${topic.code || topic.slug} → ${targetLang} (${provider})`, ip: getClientIp(req) });

    return ok(res, {
      source_language: isEnglish ? 'topic_info' : 'en', target_language: target_language_code, provider,
      translated: extractMaterialFields(translated, MATERIAL_FIELDS_TOPIC),
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, isEnglish ? 'Content generated successfully' : 'Translation generated successfully');
  } catch (error: any) {
    console.error('AI generateTopicTranslation error:', error);
    return err(res, error.message || 'AI generation failed', 500);
  }
}

// ─── TOPIC translation (bulk) ───
export async function bulkGenerateTopicTranslations(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { topic_id, prompt, provider: reqProvider } = req.body;
    if (!topic_id) return err(res, 'topic_id is required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const { data: topic } = await supabase.from('topics').select('*').eq('id', topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);

    const { data: allLangs } = await supabase.from('languages').select('id, name, iso_code, native_name').eq('is_active', true).eq('for_material', true).order('id');
    if (!allLangs || allLangs.length === 0) return err(res, 'No active languages found', 404);

    const { data: existing } = await supabase.from('topic_translations').select('id, language_id, deleted_at').eq('topic_id', topic_id);
    const activeLangIds = new Set((existing || []).filter(e => !e.deleted_at).map(e => e.language_id));
    const softDeletedMap = new Map((existing || []).filter(e => e.deleted_at).map(e => [e.language_id, e.id]));
    const missingLangs = allLangs.filter(l => !activeLangIds.has(l.id));

    if (missingLangs.length === 0) return ok(res, { results: [], message: 'All languages already have translations' });

    const userPrompt = prompt || 'Create content in English language with human way writing style and convert exact English content with same meaning for other languages which are listed for translations. Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated. Most Important: don\'t write everything in pure regional language — use some common and technical English words in all outputs as it is. Keep technical or brand words in English that sound strange or unnatural or weird when translated. Write technical words like HTML5, CSS, JavaScript, Programming, Web Development, Database, Algorithm, Framework etc. in English script only, NOT in regional script.';
    const hasEnglish = !missingLangs.find(l => l.iso_code === 'en');
    let englishSource: any = null;
    if (hasEnglish) {
      const { data: enTrans } = await supabase.from('topic_translations').select('*').eq('topic_id', topic_id).is('deleted_at', null);
      const enLang = allLangs.find(l => l.iso_code === 'en');
      if (enLang && enTrans) englishSource = enTrans.find((t: any) => t.language_id === enLang.id);
    }

    const langList = missingLangs.map(l => `${l.iso_code}: ${l.name}`).join(', ');
    const jsonSpec = buildMaterialJsonSpec(MATERIAL_FIELDS_TOPIC);

    let systemPrompt: string;
    let userContent: string;

    if (!hasEnglish) {
      systemPrompt = `You are a professional educational content writer and multilingual translator for GrowUpMore.
TASK: Generate comprehensive English content for the topic below, then translate into ALL specified languages.
OUTPUT — return ONLY valid JSON: { "en": ${jsonSpec}, "hi": ${jsonSpec}, ... }
LANGUAGES: ${langList}
RULES: name = full topic name; short_intro = 1-2 sentences; long_intro = 3-5 sentences; prerequisites = what learners should know; learning_objectives = what they'll achieve. Translate EXACTLY. Use ISO code as key. Write in a natural, human way.
MOST IMPORTANT — STRICTLY FOLLOW: Do NOT write in pure regional languages. MUST keep technical/subject/brand English words in English script (Latin letters) — do NOT transliterate. Example (Hindi): "HTML5 की Fundamentals सीखें। Web Development में Semantic Elements को cover करता है।" NOT "एचटीएमएल5 की मूल बातें।"
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ code: topic.code || '', slug: topic.slug, name: topic.name || topic.code, parent_chapter: topic.chapters?.code || '', parent_subject: topic.chapters?.subjects?.code || '' });
    } else {
      const sourceContent: any = {};
      for (const f of MATERIAL_FIELDS_TOPIC) sourceContent[f] = englishSource?.[f] || '';
      systemPrompt = `You are a professional multilingual educational translator for GrowUpMore.
TASK: Translate English content into ALL specified languages.
OUTPUT — return ONLY valid JSON: { "hi": ${jsonSpec}, ... }
LANGUAGES: ${langList}
RULES: Translate EXACTLY with same meaning. Use ISO code as key. Write in a natural, human way.

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Do NOT write everything in pure regional languages. You MUST keep common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Modern Web Development में Semantic Elements और Forms को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें। आधुनिक वेब डेवलपमेंट..." — WRONG, technical words must stay in English script.
The output should be a MIX of regional language and English technical words in English script.

USER INSTRUCTIONS: ${userPrompt}`;
      userContent = `English source:\n${JSON.stringify(sourceContent)}`;
    }

    const bulkTokens = Math.max(8192, missingLangs.length * 4096);
    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent, bulkTokens);
    let allTranslations: any;
    try { allTranslations = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    const results: any[] = [];
    for (const lang of missingLangs) {
      const translated = allTranslations[lang.iso_code];
      if (!translated) { results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: 'AI did not return translation for this language' }); continue; }

      const record: any = {
        topic_id, language_id: lang.id,
        ...extractMaterialFields(translated, MATERIAL_FIELDS_TOPIC),
        is_active: true, deleted_at: null, updated_by: userId,
      };

      const softDeletedId = softDeletedMap.get(lang.id);
      let saved: any, saveErr: any;
      if (softDeletedId) {
        const r2 = await supabase.from('topic_translations').update({ ...record, created_by: userId }).eq('id', softDeletedId).select().single();
        saved = r2.data; saveErr = r2.error;
      } else {
        const r2 = await supabase.from('topic_translations').insert({ ...record, created_by: userId }).select().single();
        saved = r2.data; saveErr = r2.error;
      }

      results.push(saveErr
        ? { language: lang.name, iso_code: lang.iso_code, status: 'error', error: saveErr.message }
        : { language: lang.name, iso_code: lang.iso_code, status: 'success', id: saved.id });
    }

    logAdmin({ actorId: userId, action: 'ai_bulk_translation_generated', targetType: 'topic_translation', targetId: Number(topic_id), targetName: `${topic.code || topic.slug} → ${missingLangs.length} languages (${provider})`, ip: getClientIp(req) });
    const successCount = results.filter(r => r.status === 'success').length;
    return ok(res, { results, provider, usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } }, `Bulk generation complete: ${successCount}/${results.length} succeeded`);
  } catch (error: any) {
    console.error('AI bulkGenerateTopicTranslations error:', error);
    return err(res, error.message || 'Bulk generation failed', 500);
  }
}

// ─── SUB-TOPIC translation (single) ───
export async function generateSubTopicTranslation(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { sub_topic_id, target_language_code, target_language_name, prompt, provider: reqProvider } = req.body;
    if (!sub_topic_id || !target_language_code) return err(res, 'sub_topic_id and target_language_code are required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const isEnglish = target_language_code === 'en';
    const targetLang = target_language_name || target_language_code;
    const userPrompt = prompt || (isEnglish
      ? 'Generate educational content with engaging introductions.'
      : 'Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated.');

    const { data: subTopic } = await supabase.from('sub_topics').select('*').eq('id', sub_topic_id).single();
    if (!subTopic) return err(res, 'Sub-topic not found', 404);

    let systemPrompt: string;
    let userContent: string;
    const jsonSpec = buildMaterialJsonSpec(MATERIAL_FIELDS_SUB_TOPIC);

    if (isEnglish) {
      systemPrompt = `You are a professional educational content writer for GrowUpMore — an educational platform.
Generate comprehensive English content for the sub-topic. Write in a natural, human way — not robotic or overly formal. Fill ALL fields.
- name: Full name of the sub-topic
- short_intro: 1-2 sentence engaging introduction
- long_intro: 3-5 sentence detailed introduction covering scope and importance
OUTPUT — return ONLY valid JSON: ${jsonSpec}
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ slug: subTopic.slug, difficulty_level: subTopic.difficulty_level || '', estimated_minutes: subTopic.estimated_minutes || '' });
    } else {
      const { data: enTrans } = await supabase.from('sub_topic_translations').select('*, languages!inner(iso_code)').eq('sub_topic_id', sub_topic_id).eq('languages.iso_code', 'en').is('deleted_at', null).limit(1);
      const source = enTrans?.[0];
      if (!source) return err(res, 'English translation not found. Please create the English version first.', 404);

      const sourceContent: any = {};
      for (const f of MATERIAL_FIELDS_SUB_TOPIC) sourceContent[f] = source[f] || '';

      systemPrompt = `You are a professional multilingual educational translator.
Translate English content into ${targetLang} (${target_language_code}) with EXACT same meaning.
RULES:
- Keep JSON keys in English.
- Write in a natural, human way — not robotic or overly formal.

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Do NOT write everything in pure ${targetLang}. You MUST use common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Modern Web Development के लिए Semantic Elements और Multimedia Integration को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें सीखें। आधुनिक वेब डेवलपमेंट की नींव..." — This is WRONG because technical words are transliterated.
The output should be a MIX of regional language and English technical words written in English script.

USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify(sourceContent);
    }

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);
    let translated: any;
    try { translated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    logAdmin({ actorId: userId, action: isEnglish ? 'ai_content_generated' : 'ai_translation_generated', targetType: 'sub_topic_translation', targetId: Number(sub_topic_id), targetName: `${subTopic.slug} → ${targetLang} (${provider})`, ip: getClientIp(req) });

    return ok(res, {
      source_language: isEnglish ? 'sub_topic_info' : 'en', target_language: target_language_code, provider,
      translated: extractMaterialFields(translated, MATERIAL_FIELDS_SUB_TOPIC),
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, isEnglish ? 'Content generated successfully' : 'Translation generated successfully');
  } catch (error: any) {
    console.error('AI generateSubTopicTranslation error:', error);
    return err(res, error.message || 'AI generation failed', 500);
  }
}

// ─── SUB-TOPIC translation (bulk) ───
export async function bulkGenerateSubTopicTranslations(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { sub_topic_id, prompt, provider: reqProvider } = req.body;
    if (!sub_topic_id) return err(res, 'sub_topic_id is required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const { data: subTopic } = await supabase.from('sub_topics').select('*').eq('id', sub_topic_id).single();
    if (!subTopic) return err(res, 'Sub-topic not found', 404);

    const { data: allLangs } = await supabase.from('languages').select('id, name, iso_code, native_name').eq('is_active', true).eq('for_material', true).order('id');
    if (!allLangs || allLangs.length === 0) return err(res, 'No active languages found', 404);

    const { data: existing } = await supabase.from('sub_topic_translations').select('id, language_id, deleted_at').eq('sub_topic_id', sub_topic_id);
    const activeLangIds = new Set((existing || []).filter(e => !e.deleted_at).map(e => e.language_id));
    const softDeletedMap = new Map((existing || []).filter(e => e.deleted_at).map(e => [e.language_id, e.id]));
    const missingLangs = allLangs.filter(l => !activeLangIds.has(l.id));

    if (missingLangs.length === 0) return ok(res, { results: [], message: 'All languages already have translations' });

    const userPrompt = prompt || 'Create content in English language with human way writing style and convert exact English content with same meaning for other languages which are listed for translations. Translate exactly with the same meaning. Keep technical or brand words in English that sound strange or unnatural when translated. Most Important: don\'t write everything in pure regional language — use some common and technical English words in all outputs as it is. Keep technical or brand words in English that sound strange or unnatural or weird when translated. Write technical words like HTML5, CSS, JavaScript, Programming, Web Development, Database, Algorithm, Framework etc. in English script only, NOT in regional script.';
    const hasEnglish = !missingLangs.find(l => l.iso_code === 'en');
    let englishSource: any = null;
    if (hasEnglish) {
      const { data: enTrans } = await supabase.from('sub_topic_translations').select('*').eq('sub_topic_id', sub_topic_id).is('deleted_at', null);
      const enLang = allLangs.find(l => l.iso_code === 'en');
      if (enLang && enTrans) englishSource = enTrans.find((t: any) => t.language_id === enLang.id);
    }

    const langList = missingLangs.map(l => `${l.iso_code}: ${l.name}`).join(', ');
    const jsonSpec = buildMaterialJsonSpec(MATERIAL_FIELDS_SUB_TOPIC);

    let systemPrompt: string;
    let userContent: string;

    if (!hasEnglish) {
      systemPrompt = `You are a professional educational content writer and multilingual translator for GrowUpMore.
TASK: Generate comprehensive English content for the sub-topic below, then translate into ALL specified languages.
OUTPUT — return ONLY valid JSON: { "en": ${jsonSpec}, "hi": ${jsonSpec}, ... }
LANGUAGES: ${langList}
RULES: name = full sub-topic name; short_intro = 1-2 sentences; long_intro = 3-5 sentences. Translate EXACTLY. Use ISO code as key. Write in a natural, human way.
MOST IMPORTANT — STRICTLY FOLLOW: Do NOT write in pure regional languages. MUST keep technical/subject/brand English words in English script (Latin letters) — do NOT transliterate. Example (Hindi): "HTML5 की Fundamentals सीखें। Web Development में Semantic Elements को cover करता है।" NOT "एचटीएमएल5 की मूल बातें।"
USER INSTRUCTIONS: ${userPrompt}`;
      userContent = JSON.stringify({ slug: subTopic.slug, difficulty_level: subTopic.difficulty_level || '', estimated_minutes: subTopic.estimated_minutes || '' });
    } else {
      const sourceContent: any = {};
      for (const f of MATERIAL_FIELDS_SUB_TOPIC) sourceContent[f] = englishSource?.[f] || '';
      systemPrompt = `You are a professional multilingual educational translator for GrowUpMore.
TASK: Translate English content into ALL specified languages.
OUTPUT — return ONLY valid JSON: { "hi": ${jsonSpec}, ... }
LANGUAGES: ${langList}
RULES: Translate EXACTLY with same meaning. Use ISO code as key. Write in a natural, human way.

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Do NOT write everything in pure regional languages. You MUST keep common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Modern Web Development में Semantic Elements और Forms को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें। आधुनिक वेब डेवलपमेंट..." — WRONG, technical words must stay in English script.
The output should be a MIX of regional language and English technical words in English script.

USER INSTRUCTIONS: ${userPrompt}`;
      userContent = `English source:\n${JSON.stringify(sourceContent)}`;
    }

    // Use higher token limit for bulk translations (14 fields × N languages)
    const bulkMaxTokens = Math.max(8192, missingLangs.length * 4096);

    // Try bulk AI call with retry on invalid JSON
    let allTranslations: any = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent, bulkMaxTokens);
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        allTranslations = parseJSON(text);
        break; // Success
      } catch (parseErr) {
        console.error(`Bulk translation attempt ${attempt + 1} failed (JSON parse):`, parseErr);
        if (attempt === 1) allTranslations = null; // Give up after 2 attempts
      }
    }

    const results: any[] = [];

    // If bulk AI failed entirely, fall back to one-by-one translation
    if (!allTranslations) {
      console.log('Bulk translation JSON parse failed, falling back to per-language translation...');
      for (const lang of missingLangs) {
        try {
          const singleJsonSpec = buildMaterialJsonSpec(MATERIAL_FIELDS_SUB_TOPIC);
          const singleSystemPrompt = `You are a professional multilingual educational translator for GrowUpMore.
TASK: Translate the English content below into ${lang.name} (${lang.iso_code}).
OUTPUT — return ONLY valid JSON: ${singleJsonSpec}
RULES: Translate EXACTLY with same meaning. Write in a natural, human way.
MOST IMPORTANT: Do NOT write in pure ${lang.name}. Keep technical/brand English words in English script. Example: "HTML5 की Fundamentals सीखें।"
USER INSTRUCTIONS: ${userPrompt}`;
          const sourceContent: any = {};
          for (const f of MATERIAL_FIELDS_SUB_TOPIC) sourceContent[f] = englishSource?.[f] || '';
          const singleUserContent = `English source:\n${JSON.stringify(sourceContent)}`;
          const { text: singleText, inputTokens: sIn, outputTokens: sOut } = await callAI(provider, singleSystemPrompt, singleUserContent);
          totalInputTokens += sIn;
          totalOutputTokens += sOut;
          const translated = parseJSON(singleText);

          const record: any = {
            sub_topic_id, language_id: lang.id,
            ...extractMaterialFields(translated, MATERIAL_FIELDS_SUB_TOPIC),
            is_active: true, deleted_at: null, updated_by: userId,
          };
          const softDeletedId = softDeletedMap.get(lang.id);
          let saved: any, saveErr: any;
          if (softDeletedId) {
            const r2 = await supabase.from('sub_topic_translations').update({ ...record, created_by: userId }).eq('id', softDeletedId).select().single();
            saved = r2.data; saveErr = r2.error;
          } else {
            const r2 = await supabase.from('sub_topic_translations').insert({ ...record, created_by: userId }).select().single();
            saved = r2.data; saveErr = r2.error;
          }
          results.push(saveErr
            ? { language: lang.name, iso_code: lang.iso_code, status: 'error', error: saveErr.message }
            : { language: lang.name, iso_code: lang.iso_code, status: 'success', id: saved.id });
        } catch (langErr: any) {
          console.error(`Per-language translation failed for ${lang.iso_code}:`, langErr);
          results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: langErr.message || 'Translation failed' });
        }
      }
    } else {
      // Bulk AI succeeded — process each language from the combined response
      for (const lang of missingLangs) {
        const translated = allTranslations[lang.iso_code];
        if (!translated) { results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: 'AI did not return translation for this language' }); continue; }

        const record: any = {
          sub_topic_id, language_id: lang.id,
          ...extractMaterialFields(translated, MATERIAL_FIELDS_SUB_TOPIC),
          is_active: true, deleted_at: null, updated_by: userId,
        };

        const softDeletedId = softDeletedMap.get(lang.id);
        let saved: any, saveErr: any;
        if (softDeletedId) {
          const r2 = await supabase.from('sub_topic_translations').update({ ...record, created_by: userId }).eq('id', softDeletedId).select().single();
          saved = r2.data; saveErr = r2.error;
        } else {
          const r2 = await supabase.from('sub_topic_translations').insert({ ...record, created_by: userId }).select().single();
          saved = r2.data; saveErr = r2.error;
        }

        results.push(saveErr
          ? { language: lang.name, iso_code: lang.iso_code, status: 'error', error: saveErr.message }
          : { language: lang.name, iso_code: lang.iso_code, status: 'success', id: saved.id });
      }
    }

    logAdmin({ actorId: userId, action: 'ai_bulk_translation_generated', targetType: 'sub_topic_translation', targetId: Number(sub_topic_id), targetName: `${subTopic.slug} → ${missingLangs.length} languages (${provider})`, ip: getClientIp(req) });
    const successCount = results.filter(r => r.status === 'success').length;
    return ok(res, { results, provider, usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens } }, `Bulk generation complete: ${successCount}/${results.length} succeeded`);
  } catch (error: any) {
    console.error('AI bulkGenerateSubTopicTranslations error:', error);
    return err(res, error.message || 'Bulk generation failed', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ─── AI SAMPLE DATA GENERATION FOR USER PROFILE MODULES ─────────────
// ═══════════════════════════════════════════════════════════════════════

type SampleModule = 'profile' | 'address' | 'contact' | 'identity' | 'bank' | 'education' | 'experience' | 'social_medias' | 'skills' | 'languages' | 'documents' | 'projects';

const VALID_MODULES: SampleModule[] = ['profile', 'address', 'contact', 'identity', 'bank', 'education', 'experience', 'social_medias', 'skills', 'languages', 'documents', 'projects'];

async function fetchMasterData(module: SampleModule) {
  const data: Record<string, any[]> = {};

  if (module === 'education') {
    const { data: levels } = await supabase.from('education_levels').select('id, name, abbreviation, level_category').eq('is_active', true).is('deleted_at', null).order('level_order');
    data.education_levels = levels || [];
  }

  if (module === 'skills') {
    const { data: skills } = await supabase.from('skills').select('id, name').eq('is_active', true).is('deleted_at', null).order('name').limit(100);
    data.skills = skills || [];
  }

  if (module === 'languages') {
    const { data: langs } = await supabase.from('languages').select('id, name, native_name').eq('is_active', true).is('deleted_at', null).order('name').limit(50);
    data.languages = langs || [];
  }

  if (module === 'social_medias') {
    const { data: platforms } = await supabase.from('social_medias').select('id, name, code, base_url, placeholder').eq('is_active', true).is('deleted_at', null).order('display_order');
    data.social_medias = platforms || [];
  }

  if (module === 'documents') {
    const { data: docTypes } = await supabase.from('document_types').select('id, name').eq('is_active', true).is('deleted_at', null).order('sort_order');
    data.document_types = docTypes || [];
    const { data: docs } = await supabase.from('documents').select('id, name, document_type_id').eq('is_active', true).is('deleted_at', null).order('name');
    data.documents = docs || [];
  }

  if (module === 'experience') {
    const { data: desigs } = await supabase.from('designations').select('id, name').eq('is_active', true).is('deleted_at', null).order('name').limit(50);
    data.designations = desigs || [];
  }

  if (module === 'profile') {
    const { data: countries } = await supabase.from('countries').select('id, name').eq('is_active', true).is('deleted_at', null).order('name').limit(20);
    data.countries = countries || [];
  }

  if (module === 'address') {
    const { data: countries } = await supabase.from('countries').select('id, name').eq('is_active', true).is('deleted_at', null).order('name').limit(20);
    data.countries = countries || [];
    // Fetch Indian states + cities for realistic data
    const indiaCountry = countries?.find(c => c.name === 'India');
    if (indiaCountry) {
      const { data: states } = await supabase.from('states').select('id, name').eq('country_id', indiaCountry.id).is('deleted_at', null).order('name').limit(40);
      data.states = states || [];
      if (states && states.length > 0) {
        const stateIds = states.slice(0, 10).map(s => s.id);
        const { data: cities } = await supabase.from('cities').select('id, name, state_id').in('state_id', stateIds).is('deleted_at', null).order('name').limit(100);
        data.cities = cities || [];
      }
    }
  }

  return data;
}

// ─── Fetch existing user records to prevent duplicates ───
interface ExistingUserData {
  promptText: string;
  usedIds: number[]; // FK IDs already used (skill_id, language_id, social_media_id, etc.)
}

async function fetchExistingUserRecords(module: SampleModule, userId: number): Promise<ExistingUserData> {
  const empty: ExistingUserData = { promptText: '', usedIds: [] };
  const multiRecordModules = ['education', 'experience', 'skills', 'languages', 'social_medias', 'documents', 'projects'];
  if (!multiRecordModules.includes(module)) return empty;

  let existing: string[] = [];
  let usedIds: number[] = [];

  if (module === 'education') {
    const { data } = await supabase.from('user_education').select('institution_name, degree_title, field_of_study, education_level_id').eq('user_id', userId).eq('is_active', true).is('deleted_at', null);
    existing = (data || []).map(e => `${e.degree_title || ''} in ${e.field_of_study || ''} at ${e.institution_name || ''} (education_level_id: ${e.education_level_id})`);
  }

  if (module === 'experience') {
    const { data } = await supabase.from('user_experience').select('company_name, job_title, designation_id').eq('user_id', userId).eq('is_active', true).is('deleted_at', null);
    existing = (data || []).map(e => `${e.job_title || ''} at ${e.company_name || ''} (designation_id: ${e.designation_id})`);
  }

  if (module === 'skills') {
    const { data } = await supabase.from('user_skills').select('skill_id, skill:skills(name)').eq('user_id', userId).eq('is_active', true).is('deleted_at', null);
    existing = (data || []).map((s: any) => `skill_id: ${s.skill_id} (${s.skill?.name || 'unknown'})`);
    usedIds = (data || []).map((s: any) => s.skill_id);
  }

  if (module === 'languages') {
    const { data } = await supabase.from('user_languages').select('language_id, language:languages(name)').eq('user_id', userId).eq('is_active', true).is('deleted_at', null);
    existing = (data || []).map((l: any) => `language_id: ${l.language_id} (${l.language?.name || 'unknown'})`);
    usedIds = (data || []).map((l: any) => l.language_id);
  }

  if (module === 'social_medias') {
    const { data } = await supabase.from('user_social_medias').select('social_media_id, social_media:social_medias(name)').eq('user_id', userId).eq('is_active', true).is('deleted_at', null);
    existing = (data || []).map((s: any) => `social_media_id: ${s.social_media_id} (${s.social_media?.name || 'unknown'})`);
    usedIds = (data || []).map((s: any) => s.social_media_id);
  }

  if (module === 'documents') {
    const { data } = await supabase.from('user_documents').select('document_type_id, document_id, document_type:document_types(name), document:documents(name)').eq('user_id', userId).is('deleted_at', null);
    existing = (data || []).map((d: any) => `document_type_id: ${d.document_type_id} (${d.document_type?.name || ''}), document_id: ${d.document_id} (${d.document?.name || ''})`);
    usedIds = (data || []).filter((d: any) => d.document_id).map((d: any) => d.document_id);
  }

  if (module === 'projects') {
    const { data } = await supabase.from('user_projects').select('project_title, project_type').eq('user_id', userId).eq('is_active', true).is('deleted_at', null);
    existing = (data || []).map(p => `"${p.project_title}" (${p.project_type || ''})`);
  }

  if (existing.length === 0) return empty;
  const promptText = `\n\n⚠️ ALREADY EXISTS — DO NOT DUPLICATE:\nThe user already has these ${module} records. Generate COMPLETELY DIFFERENT ones that do NOT overlap with any of these:\n${existing.map(e => `- ${e}`).join('\n')}`;
  return { promptText, usedIds };
}

function buildSampleDataPrompt(module: SampleModule, masterData: Record<string, any[]>, count: number, userName: string, existingData: ExistingUserData = { promptText: '', usedIds: [] }): { system: string; user: string } {
  // Filter out already-used FK IDs from available master data lists
  const usedIdSet = new Set(existingData.usedIds);
  if (module === 'skills' && masterData.skills) {
    masterData = { ...masterData, skills: masterData.skills.filter(s => !usedIdSet.has(s.id)) };
  }
  if (module === 'languages' && masterData.languages) {
    masterData = { ...masterData, languages: masterData.languages.filter(l => !usedIdSet.has(l.id)) };
  }
  if (module === 'social_medias' && masterData.social_medias) {
    masterData = { ...masterData, social_medias: masterData.social_medias.filter(s => !usedIdSet.has(s.id)) };
  }
  if (module === 'documents' && masterData.documents) {
    masterData = { ...masterData, documents: masterData.documents.filter(d => !usedIdSet.has(d.id)) };
  }
  const existingRecords = existingData.promptText;
  const singleModules = ['profile', 'address', 'contact', 'identity', 'bank'];
  const isSingle = singleModules.includes(module);
  const base = `You are a realistic sample data generator for an Indian educational platform called GrowUpMore.
Generate ${isSingle ? '1 record' : `${count} realistic sample records`} for a user named "${userName}".
Context: Indian professional/student. Use realistic Indian names, institutions, companies, locations.
Return ONLY valid JSON. ${isSingle ? 'Return a single JSON object.' : 'Return a JSON array of objects.'}${existingRecords}`;

  switch (module) {
    case 'profile':
      return {
        system: `${base}
FIELDS (all optional, fill as many as makes sense):
- date_of_birth: "YYYY-MM-DD" (age 20-35)
- gender: "male"|"female"|"other"
- blood_group: "A+"|"A-"|"B+"|"B-"|"AB+"|"AB-"|"O+"|"O-"
- marital_status: "single"|"married"|"divorced"|"widowed"|"separated"
- permanent_address_line1, permanent_address_line2: strings (max 255)
- permanent_postal_code: 6-digit Indian PIN
- current_address_line1, current_address_line2, current_postal_code
- alternate_email: valid email (max 255)
- alternate_phone: Indian phone "+91XXXXXXXXXX" (max 20)
- emergency_contact_name (max 100), emergency_contact_relationship (max 50), emergency_contact_phone (max 20), emergency_contact_email
- bio: 2-3 sentence professional bio (max 2000)
- headline: professional headline like LinkedIn (max 200)
${masterData.countries?.length ? `Available country IDs: ${JSON.stringify(masterData.countries.map(c => ({ id: c.id, name: c.name })))}. Use these for permanent_country_id and current_country_id.` : ''}
Do NOT include: aadhar_number, pan_number, passport_number, bank details, UPI details.`,
        user: `Generate a realistic Indian profile for "${userName}".`,
      };

    case 'address':
      return {
        system: `${base}
FIELDS (all optional, fill ALL with realistic data):
- permanent_address_line1: (max 255) street, house no.
- permanent_address_line2: (max 255) landmark, area
- permanent_postal_code: 6-digit Indian PIN code
- current_address_line1: (max 255)
- current_address_line2: (max 255)
- current_postal_code: 6-digit Indian PIN code
${masterData.countries?.length ? `Available country IDs: ${JSON.stringify(masterData.countries.map(c => ({ id: c.id, name: c.name })))}. Use for permanent_country_id and current_country_id.` : ''}
${masterData.states?.length ? `Available state IDs: ${JSON.stringify(masterData.states.map(s => ({ id: s.id, name: s.name })))}. Use for permanent_state_id and current_state_id.` : ''}
${masterData.cities?.length ? `Available city IDs (with state_id): ${JSON.stringify(masterData.cities.slice(0, 50).map(c => ({ id: c.id, name: c.name, state_id: c.state_id })))}. Use for permanent_city_id and current_city_id. Make sure city's state_id matches the chosen state.` : ''}
Generate realistic Indian addresses. Permanent and current can be different cities/states to simulate someone who moved.`,
        user: `Generate realistic Indian permanent and current addresses for "${userName}".`,
      };

    case 'contact':
      return {
        system: `${base}
FIELDS (all optional, fill ALL with realistic data):
- alternate_email: (max 255) a valid alternate email address
- alternate_phone: (max 20) Indian phone "+91XXXXXXXXXX"
- emergency_contact_name: (max 100) realistic Indian name (parent/spouse/sibling)
- emergency_contact_relationship: (max 50) e.g. "Father", "Mother", "Spouse", "Brother", "Sister"
- emergency_contact_phone: (max 20) Indian phone "+91XXXXXXXXXX"
- emergency_contact_email: (max 255) valid email
Generate realistic Indian contact information. The alternate email can be a Gmail/Yahoo address. Emergency contact should be a family member.`,
        user: `Generate realistic alternate contact and emergency contact details for "${userName}".`,
      };

    case 'identity':
      return {
        system: `${base}
FIELDS (all optional, fill ALL with realistic MASKED/SAMPLE data):
- aadhar_number: (max 12 chars, NO spaces) 12-digit number e.g. "XXXXXXXXXXXX" or "234567891234" — must be exactly 12 characters with no spaces
- pan_number: (max 10) format "ABCDE1234F" — 5 letters, 4 digits, 1 letter
- passport_number: (max 20) Indian passport format e.g. "J1234567"
- driving_license_number: (max 20) format like "GJ01-20200012345"
- voter_id: (max 20) format like "ABC1234567"
Generate SAMPLE/MASKED Indian identity document numbers. These are for demo purposes only, not real numbers.`,
        user: `Generate sample masked Indian identity/KYC numbers for "${userName}". Use realistic formats but masked values.`,
      };

    case 'bank':
      return {
        system: `${base}
FIELDS (all optional, fill ALL with realistic SAMPLE data):
- bank_account_name: (max 100) account holder name (use the user's name)
- bank_account_number: (max 30) realistic masked Indian bank account number e.g. "XXXX XXXX XXXX 4567"
- bank_ifsc_code: (max 11) realistic Indian IFSC code format e.g. "SBIN0001234", "HDFC0000123", "ICIC0002345"
- bank_name: (max 100) real Indian bank name e.g. "State Bank of India", "HDFC Bank", "ICICI Bank"
- bank_branch: (max 100) realistic branch name e.g. "Connaught Place, New Delhi"
- upi_id: (max 100) realistic UPI ID e.g. "name@upi", "name@paytm", "name@okaxis"
- upi_number: (max 20) Indian phone number for UPI e.g. "9876543210"
Generate realistic sample Indian banking details. Use masked account numbers for privacy. The IFSC code should be a realistic format matching the bank name.`,
        user: `Generate sample Indian bank account and UPI details for "${userName}". Use masked account numbers.`,
      };

    case 'education':
      return {
        system: `${base}
FIELDS per record:
- education_level_id: (REQUIRED) pick from available levels below
- institution_name: (REQUIRED, max 500) realistic Indian institution
- board_or_university: (max 500) e.g. "CBSE", "Gujarat University"
- field_of_study: (max 500) e.g. "Computer Science"
- specialization: (max 500)
- grade_or_percentage: (max 100) e.g. "8.5" or "85%"
- grade_type: "percentage"|"cgpa"|"gpa"|"grade"|"pass_fail"
- start_date: "YYYY-MM-DD"
- end_date: "YYYY-MM-DD" (null if currently studying)
- is_currently_studying: boolean
- is_highest_qualification: boolean (only 1 should be true)
- description: (max 2000) brief description

Available education levels: ${JSON.stringify(masterData.education_levels?.map(l => ({ id: l.id, name: l.name, category: l.level_category })) || [])}
Use ONLY these IDs for education_level_id.`,
        user: `Generate ${count} education records for "${userName}" — from school through higher education. Make dates chronologically consistent.`,
      };

    case 'experience':
      return {
        system: `${base}
FIELDS per record:
- company_name: (REQUIRED, max 500) realistic Indian or MNC company
- job_title: (REQUIRED, max 500)
- employment_type: "full_time"|"part_time"|"contract"|"internship"|"freelance"|"self_employed"
- department: (max 300)
- location: (max 500) Indian city
- work_mode: "on_site"|"remote"|"hybrid"
- start_date: (REQUIRED) "YYYY-MM-DD"
- end_date: "YYYY-MM-DD" (null if current job)
- is_current_job: boolean (only 1 should be true)
- description: (max 5000) job description with responsibilities
- key_achievements: (max 5000)
- skills_used: (max 2000) comma-separated
${masterData.designations?.length ? `Available designation IDs: ${JSON.stringify(masterData.designations.slice(0, 20).map(d => ({ id: d.id, name: d.name })))}. Use ONLY these IDs for designation_id — pick the closest match or set to null if none fit.` : ''}
Do NOT include: salary_range, reference_name, reference_phone, reference_email.`,
        user: `Generate ${count} work experience records for "${userName}". Make dates chronologically consistent and career progression realistic.`,
      };

    case 'social_medias':
      return {
        system: `${base}
FIELDS per record:
- social_media_id: (REQUIRED) pick from available platforms below
- profile_url: (REQUIRED, max 1000) realistic URL using the platform's base_url
- username: (max 300)
- is_primary: boolean (only 1 should be true)
- is_verified: boolean (set false)

Available platforms: ${JSON.stringify(masterData.social_medias?.map(s => ({ id: s.id, name: s.name, code: s.code, base_url: s.base_url })) || [])}
Use ONLY these IDs for social_media_id. Generate a URL based on the platform's base_url.`,
        user: `Generate ${count} social media profiles for "${userName}". Pick the most common platforms. Use a consistent username derived from the user's name.`,
      };

    case 'skills':
      return {
        system: `${base}
FIELDS per record:
- skill_id: (REQUIRED) pick from available skills below
- proficiency_level: "beginner"|"elementary"|"intermediate"|"advanced"|"expert"
- years_of_experience: number 0-30
- is_primary: boolean (only 1 should be true)
- endorsement_count: number 0-50

Available skills: ${JSON.stringify(masterData.skills?.slice(0, 60).map(s => ({ id: s.id, name: s.name })) || [])}
Use ONLY these IDs for skill_id. Do NOT repeat the same skill_id.`,
        user: `Generate ${count} skill records for "${userName}". Pick a diverse but realistic set of skills for an IT professional. Vary proficiency levels realistically.`,
      };

    case 'languages':
      return {
        system: `${base}
FIELDS per record:
- language_id: (REQUIRED) pick from available languages below
- proficiency_level: "basic"|"conversational"|"professional"|"fluent"|"native"
- can_read: boolean
- can_write: boolean
- can_speak: boolean
- is_primary: boolean (only 1 should be true)
- is_native: boolean (only 1 should be true)

Available languages: ${JSON.stringify(masterData.languages?.map(l => ({ id: l.id, name: l.name })) || [])}
Use ONLY these IDs for language_id. Do NOT repeat the same language_id.`,
        user: `Generate ${count} language records for "${userName}". Typical Indian user: native Hindi or regional language, professional English, perhaps 1-2 more.`,
      };

    case 'documents':
      return {
        system: `${base}
FIELDS per record:
- document_type_id: (REQUIRED) pick from available document types below
- document_id: (REQUIRED) pick from available documents below — its document_type_id MUST match the record's document_type_id
- document_number: (max 200) realistic format (masked, e.g. "XXXX-XXXX-1234")
- issue_date: "YYYY-MM-DD"
- expiry_date: "YYYY-MM-DD" (null if no expiry)
- verification_status: "pending"
Do NOT include: file (this needs actual file uploads).

Available document types: ${JSON.stringify(masterData.document_types?.map(d => ({ id: d.id, name: d.name })) || [])}
Available documents: ${JSON.stringify(masterData.documents?.map(d => ({ id: d.id, name: d.name, document_type_id: d.document_type_id })) || [])}
Use ONLY these IDs. The document_id's document_type_id MUST match the record's document_type_id.`,
        user: `Generate ${count} identity/KYC document metadata records for "${userName}". Use common Indian documents (Aadhar, PAN, Passport, etc.). Mask sensitive numbers. Pick the correct document_type_id and matching document_id for each.`,
      };

    case 'projects':
      return {
        system: `${base}
FIELDS per record:
- project_title: (REQUIRED, max 500)
- project_type: "personal"|"academic"|"professional"|"freelance"|"open_source"|"research"|"hackathon"
- description: (max 5000) detailed description
- objectives: (max 3000)
- role_in_project: (max 300)
- responsibilities: (max 5000)
- team_size: number 1-20
- is_solo_project: boolean
- organization_name: (max 500)
- industry: (max 300)
- technologies_used: (max 2000) comma-separated
- tools_used: (max 2000) comma-separated
- programming_languages: (max 1000) comma-separated
- frameworks: (max 1000) comma-separated
- databases_used: (max 500) comma-separated
- platform: (max 200) e.g. "Web", "Mobile", "Cloud"
- start_date: "YYYY-MM-DD"
- end_date: "YYYY-MM-DD"
- is_ongoing: boolean
- project_status: "completed"|"in_progress"|"planning"
- key_achievements: (max 5000)
- impact_summary: (max 2000)
- project_url: (max 1000) realistic URL
- repository_url: (max 1000) GitHub URL
- is_featured: boolean (max 1 true)
- is_published: boolean (set true)
- display_order: number starting from 1
Do NOT include: reference_name, reference_email, reference_phone, client_name.`,
        user: `Generate ${count} project records for "${userName}". Mix of academic, professional, and personal projects. Make technologies realistic and current.`,
      };
  }
}

export async function generateSampleData(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { module, provider: reqProvider, target_user_id, count: reqCount } = req.body;
    if (!module || !VALID_MODULES.includes(module)) return err(res, `Invalid module. Must be one of: ${VALID_MODULES.join(', ')}`, 400);
    if (!target_user_id) return err(res, 'target_user_id is required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const singleObjectModules: SampleModule[] = ['profile', 'address', 'contact', 'identity', 'bank'];
    const count = singleObjectModules.includes(module) ? 1 : Math.min(Math.max(reqCount || 3, 1), 25);

    // Fetch user name for context
    const { data: targetUser } = await supabase.from('users').select('id, full_name, email').eq('id', target_user_id).single();
    if (!targetUser) return err(res, 'Target user not found', 404);

    // Fetch relevant master data + existing records to avoid duplicates
    const [masterData, existingData] = await Promise.all([
      fetchMasterData(module),
      fetchExistingUserRecords(module, target_user_id),
    ]);
    const { system, user: userContent } = buildSampleDataPrompt(module, masterData, count, targetUser.full_name || targetUser.email, existingData);

    const { text, inputTokens, outputTokens } = await callAI(provider, system, userContent);

    let generated: any;
    try { generated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    // Ensure array for non-single-object modules
    if (!singleObjectModules.includes(module) && !Array.isArray(generated)) {
      // Try to extract array from object wrapper
      const keys = Object.keys(generated);
      if (keys.length === 1 && Array.isArray(generated[keys[0]])) {
        generated = generated[keys[0]];
      } else {
        generated = [generated];
      }
    }

    logAdmin({ actorId: userId, action: 'ai_sample_data_generated', targetType: `user_${module}`, targetId: target_user_id, targetName: `${targetUser.full_name} → ${module} (${provider})`, ip: getClientIp(req) });

    return ok(res, {
      module,
      provider,
      target_user_id,
      generated,
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, `Sample ${module} data generated successfully`);
  } catch (error: any) {
    console.error('AI generateSampleData error:', error);
    return err(res, error.message || 'Sample data generation failed', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ─── AI MASTER DATA GENERATION ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

type MasterModule = 'skills' | 'languages' | 'education_levels' | 'document_types' | 'documents' | 'designations' | 'specializations' | 'learning_goals' | 'social_medias' | 'countries' | 'states' | 'cities' | 'categories' | 'sub_categories' | 'branches' | 'departments' | 'branch_departments' | 'employee_profiles' | 'student_profiles' | 'instructor_profiles' | 'subjects' | 'chapters' | 'topics';

const VALID_MASTER_MODULES: MasterModule[] = ['skills', 'languages', 'education_levels', 'document_types', 'documents', 'designations', 'specializations', 'learning_goals', 'social_medias', 'countries', 'states', 'cities', 'categories', 'sub_categories', 'branches', 'departments', 'branch_departments', 'employee_profiles', 'student_profiles', 'instructor_profiles', 'subjects', 'chapters', 'topics'];

async function fetchMasterContext(module: MasterModule) {
  const ctx: Record<string, any[]> = {};
  // For documents module, fetch document_types so AI can assign valid document_type_id
  if (module === 'documents') {
    const { data } = await supabase.from('document_types').select('id, name').eq('is_active', true).is('deleted_at', null).order('sort_order');
    ctx.document_types = data || [];
  }
  // For states, fetch countries so AI can assign valid country_id
  if (module === 'states') {
    const { data } = await supabase.from('countries').select('id, name, iso2').eq('is_active', true).is('deleted_at', null).order('name');
    ctx.countries = data || [];
  }
  // For cities, fetch countries and states so AI can assign valid state_id
  if (module === 'cities') {
    const { data: countries } = await supabase.from('countries').select('id, name, iso2').eq('is_active', true).is('deleted_at', null).order('name');
    ctx.countries = countries || [];
    const { data: states } = await supabase.from('states').select('id, name, state_code, country_id').eq('is_active', true).is('deleted_at', null).order('name').limit(200);
    ctx.states = states || [];
  }
  // For sub_categories, fetch categories so AI can assign valid category_id
  if (module === 'sub_categories') {
    const { data } = await supabase.from('categories').select('id, code, slug').eq('is_active', true).is('deleted_at', null).order('display_order');
    ctx.categories = data || [];
  }
  // For branches, fetch countries, states, cities for location + users for manager
  if (module === 'branches') {
    const { data: countries } = await supabase.from('countries').select('id, name').eq('is_active', true).is('deleted_at', null).order('name').limit(20);
    ctx.countries = countries || [];
    const indiaCountry = countries?.find(c => c.name === 'India');
    if (indiaCountry) {
      const { data: states } = await supabase.from('states').select('id, name').eq('country_id', indiaCountry.id).is('deleted_at', null).order('name').limit(40);
      ctx.states = states || [];
      if (states && states.length > 0) {
        const stateIds = states.slice(0, 10).map(s => s.id);
        const { data: cities } = await supabase.from('cities').select('id, name, state_id').in('state_id', stateIds).is('deleted_at', null).order('name').limit(100);
        ctx.cities = cities || [];
      }
    }
  }
  // For departments, fetch existing departments for parent_department_id
  if (module === 'departments') {
    const { data } = await supabase.from('departments').select('id, name, code').eq('is_active', true).is('deleted_at', null).order('name');
    ctx.existing_departments = data || [];
  }
  // For branch_departments, fetch branches, departments, and existing assignments
  if (module === 'branch_departments') {
    const [branchesRes, departmentsRes, existingRes] = await Promise.all([
      supabase.from('branches').select('id, name, code').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('departments').select('id, name, code').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('branch_departments').select('branch_id, department_id').is('deleted_at', null),
    ]);
    ctx.branches = branchesRes.data || [];
    ctx.departments = departmentsRes.data || [];
    ctx.existing_assignments = (existingRes.data || []).map((a: any) => `${a.branch_id}-${a.department_id}`);
  }
  // For employee_profiles, fetch designations, departments, branches, and available users
  if (module === 'employee_profiles') {
    const [designations, departments, branches, users, existingProfiles] = await Promise.all([
      supabase.from('designations').select('id, name, code').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('departments').select('id, name, code').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('branches').select('id, name, code').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('users').select('id, full_name, email').eq('status', 'active').eq('type', 'employee').is('deleted_at', null).order('id').limit(500),
      supabase.from('employee_profiles').select('user_id').is('deleted_at', null),
    ]);
    ctx.designations = designations.data || [];
    ctx.departments = departments.data || [];
    ctx.branches = branches.data || [];
    const usedUserIds = new Set((existingProfiles.data || []).map((p: any) => p.user_id));
    ctx.available_users = (users.data || []).filter((u: any) => !usedUserIds.has(u.id));
  }
  // For student_profiles, fetch education_levels, learning_goals, specializations, languages, and available users
  if (module === 'student_profiles') {
    const [educationLevels, learningGoals, specializations, languages, users, existingProfiles] = await Promise.all([
      supabase.from('education_levels').select('id, name').eq('is_active', true).is('deleted_at', null).order('sort_order'),
      supabase.from('learning_goals').select('id, name').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('specializations').select('id, name').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('languages').select('id, name').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('users').select('id, full_name, email').eq('status', 'active').eq('type', 'student').is('deleted_at', null).order('id').limit(500),
      supabase.from('student_profiles').select('user_id').is('deleted_at', null),
    ]);
    ctx.education_levels = educationLevels.data || [];
    ctx.learning_goals = learningGoals.data || [];
    ctx.specializations = specializations.data || [];
    ctx.languages = languages.data || [];
    const usedUserIds = new Set((existingProfiles.data || []).map((p: any) => p.user_id));
    ctx.available_users = (users.data || []).filter((u: any) => !usedUserIds.has(u.id));
  }
  // For instructor_profiles, fetch designations, departments, branches, specializations, languages, and available users
  if (module === 'instructor_profiles') {
    const [designations, departments, branches, specializations, languages, users, existingProfiles] = await Promise.all([
      supabase.from('designations').select('id, name, code').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('departments').select('id, name, code').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('branches').select('id, name, code').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('specializations').select('id, name').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('languages').select('id, name').eq('is_active', true).is('deleted_at', null).order('name'),
      supabase.from('users').select('id, full_name, email').eq('status', 'active').eq('type', 'instructor').is('deleted_at', null).order('id').limit(500),
      supabase.from('instructor_profiles').select('user_id').is('deleted_at', null),
    ]);
    ctx.designations = designations.data || [];
    ctx.departments = departments.data || [];
    ctx.branches = branches.data || [];
    ctx.specializations = specializations.data || [];
    ctx.languages = languages.data || [];
    const usedUserIds = new Set((existingProfiles.data || []).map((p: any) => p.user_id));
    ctx.available_users = (users.data || []).filter((u: any) => !usedUserIds.has(u.id));
  }
  // For chapters, fetch subjects so AI can assign valid subject_id
  if (module === 'chapters') {
    const { data } = await supabase.from('subjects').select('id, code, slug').eq('is_active', true).is('deleted_at', null).order('display_order');
    ctx.subjects = data || [];
  }
  // For topics, fetch chapters (with subject info) so AI can assign valid chapter_id
  if (module === 'topics') {
    const { data: chapters } = await supabase.from('chapters').select('id, slug, subject_id, subjects(code)').eq('is_active', true).is('deleted_at', null).order('display_order');
    ctx.chapters = chapters || [];
  }
  return ctx;
}

// ─── Fetch existing master records to prevent duplicates ───
async function fetchExistingMasterRecords(module: MasterModule): Promise<string> {
  const tableMap: Record<string, string> = {
    skills: 'skills', languages: 'languages', education_levels: 'education_levels',
    document_types: 'document_types', documents: 'documents', designations: 'designations',
    specializations: 'specializations', learning_goals: 'learning_goals', social_medias: 'social_medias',
    countries: 'countries', states: 'states', cities: 'cities',
    categories: 'categories', sub_categories: 'sub_categories',
    branches: 'branches', departments: 'departments',
    employee_profiles: 'employee_profiles', student_profiles: 'student_profiles', instructor_profiles: 'instructor_profiles',
    subjects: 'subjects', chapters: 'chapters', topics: 'topics',
  };
  const table = tableMap[module];
  if (!table) return '';

  // Select identifying columns based on module
  let selectCols = 'name';
  if (['skills', 'specializations'].includes(module)) selectCols = 'name, category';
  if (module === 'designations') selectCols = 'name, code';
  if (module === 'languages') selectCols = 'name, iso_code';
  if (module === 'countries') selectCols = 'name, iso2';
  if (module === 'states') selectCols = 'name, state_code';
  if (module === 'cities') selectCols = 'name';
  if (module === 'social_medias') selectCols = 'name, code';
  if (module === 'categories') selectCols = 'code, slug';
  if (module === 'sub_categories') selectCols = 'code, slug';
  if (module === 'branches') selectCols = 'name, code';
  if (module === 'departments') selectCols = 'name, code';
  if (module === 'branch_departments') selectCols = 'branch_id, department_id';
  if (module === 'employee_profiles') selectCols = 'employee_code, user_id';
  if (module === 'student_profiles') selectCols = 'enrollment_number, user_id';
  if (module === 'instructor_profiles') selectCols = 'instructor_code, user_id';
  if (module === 'subjects') selectCols = 'code, slug';
  if (module === 'chapters') selectCols = 'slug, subject_id';
  if (module === 'topics') selectCols = 'slug, chapter_id';

  const { data } = await supabase.from(table).select(selectCols).eq('is_active', true).is('deleted_at', null).order('id').limit(500);
  if (!data || data.length === 0) return '';

  // Build compact list
  let items: string[];
  if (module === 'categories') {
    items = data.map((r: any) => `${r.code} (${r.slug})`);
  } else if (module === 'sub_categories') {
    items = data.map((r: any) => `${r.code} (${r.slug})`);
  } else if (module === 'languages') {
    items = data.map((r: any) => `${r.name} (${r.iso_code || ''})`);
  } else if (module === 'countries') {
    items = data.map((r: any) => `${r.name} (${r.iso2 || ''})`);
  } else if (module === 'states') {
    items = data.map((r: any) => `${r.name} (${r.state_code || ''})`);
  } else if (['social_medias', 'branches', 'departments', 'designations'].includes(module)) {
    items = data.map((r: any) => `${r.name}${r.code ? ` (${r.code})` : ''}`);
  } else if (module === 'branch_departments') {
    items = data.map((r: any) => `branch:${r.branch_id}-dept:${r.department_id}`);
  } else if (module === 'employee_profiles') {
    items = data.map((r: any) => `${r.employee_code} (user:${r.user_id})`);
  } else if (module === 'student_profiles') {
    items = data.map((r: any) => `${r.enrollment_number} (user:${r.user_id})`);
  } else if (module === 'instructor_profiles') {
    items = data.map((r: any) => `${r.instructor_code} (user:${r.user_id})`);
  } else if (module === 'subjects') {
    items = data.map((r: any) => `${r.code} (/${r.slug})`);
  } else if (module === 'chapters') {
    items = data.map((r: any) => `/${r.slug} (subject:${r.subject_id})`);
  } else if (module === 'topics') {
    items = data.map((r: any) => `/${r.slug} (chapter:${r.chapter_id})`);
  } else {
    items = data.map((r: any) => r.name);
  }

  return `\n\n⚠️ ALREADY EXISTS — DO NOT DUPLICATE:\nThese ${module} records already exist in the database. Generate COMPLETELY DIFFERENT/NEW ones that are NOT in this list:\n${items.join(', ')}`;
}

function buildMasterDataPrompt(module: MasterModule, context: Record<string, any[]>, count: number, existingRecords: string = ''): { system: string; user: string } {
  const base = `You are a master data generator for an Indian educational platform called GrowUpMore.
Generate ${count} unique, realistic records for the "${module}" master table.
Context: Indian educational/professional platform. Generate diverse, commonly-used entries.
Return ONLY valid JSON — a JSON array of objects. Do NOT include id, created_at, updated_at, deleted_at, created_by, updated_by, deleted_by fields.${existingRecords}`;

  switch (module) {
    case 'skills':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) name of the skill
- category: (REQUIRED) one of: "technical"|"soft_skill"|"tool"|"framework"|"language"|"domain"|"certification"|"other"
- description: (max 2000 chars) brief description of the skill
- is_active: true
- sort_order: sequential number starting from 1
Generate a diverse mix of IT, soft skills, tools, frameworks, and certifications relevant to Indian professionals.`,
        user: `Generate ${count} unique skills. Include popular technologies (React, Python, AWS), soft skills (Communication, Leadership), tools (VS Code, Docker), frameworks (Spring Boot, Django), and certifications (AWS Solutions Architect, PMP). Avoid duplicates.`,
      };

    case 'languages':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) language name in English
- native_name: (max 200 chars) language name in its own script
- iso_code: (max 10 chars) ISO 639-1 code
- script: (max 100 chars) script used e.g. "Devanagari", "Latin"
- for_material: boolean (true if this language should be used for platform content/translations)
- is_active: true
- sort_order: sequential number
Generate Indian languages plus major world languages.`,
        user: `Generate ${count} languages. Start with major Indian languages (Hindi, Gujarati, Tamil, Telugu, Bengali, Marathi, Kannada, Malayalam, Punjabi, Odia, Urdu, Assamese, Sanskrit) with native names in their scripts, then add major world languages (English, Spanish, French, Arabic, Mandarin, Japanese, German, etc.). Set for_material=true for English, Hindi, and Gujarati.`,
      };

    case 'education_levels':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) full name of education level
- abbreviation: (max 50 chars) e.g. "B.Tech", "MBA", "PhD"
- level_order: integer for ordering (higher = more advanced)
- level_category: (REQUIRED) one of: "pre_school"|"school"|"diploma"|"undergraduate"|"postgraduate"|"doctoral"|"professional"|"informal"|"other"
- description: (max 2000 chars)
- is_active: true
- sort_order: sequential number
Generate education levels following the Indian education system hierarchy.`,
        user: `Generate ${count} education levels covering the full Indian education spectrum: Pre-School/Nursery, Primary (1-5), Secondary (6-10), Higher Secondary (11-12), ITI/Diploma, B.Tech/B.E., B.Sc, B.Com, BBA, BA, BCA, M.Tech, M.Sc, MBA, MCA, MA, M.Com, PhD, Post-Doctoral, Professional certifications, etc. Order by level_order from lowest to highest.`,
      };

    case 'document_types':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) category name for documents
- description: (max 2000 chars) what this category includes
- is_active: true
- sort_order: sequential number
Generate categories of identity/KYC documents relevant to India.`,
        user: `Generate ${count} document type categories. Examples: "Identity Proof", "Address Proof", "Education Certificate", "Employment Proof", "Professional License", "Financial Document", "Government ID", "Travel Document", "Insurance", "Other".`,
      };

    case 'documents':
      return {
        system: `${base}
FIELDS per record:
- document_type_id: (REQUIRED) must be a valid ID from available document types below
- name: (REQUIRED, 1-200 chars) specific document name
- description: (max 2000 chars) brief description
- is_active: true
- sort_order: sequential number

Available document types: ${JSON.stringify(context.document_types?.map(d => ({ id: d.id, name: d.name })) || [])}
Use ONLY these IDs for document_type_id. Assign each document to the most appropriate type.`,
        user: `Generate ${count} specific documents. Examples: Aadhar Card, PAN Card, Passport, Driving License, Voter ID, Ration Card, 10th Marksheet, 12th Marksheet, Degree Certificate, Experience Letter, Salary Slip, Bank Statement, etc. Map each to the correct document_type_id.`,
      };

    case 'designations':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) designation/job title
- code: (max 50 chars) short code e.g. "SDE1", "PM", "VP"
- level: integer 0-10 (0=intern, 10=C-suite)
- level_band: (REQUIRED) one of: "intern"|"entry"|"mid"|"senior"|"lead"|"manager"|"director"|"executive"
- description: (max 2000 chars) brief description of the role
- is_active: true
- sort_order: sequential number
Generate designations covering the typical Indian corporate hierarchy.`,
        user: `Generate ${count} designations covering the full hierarchy: Intern, Trainee, Junior Developer, Software Engineer, Senior Software Engineer, Tech Lead, Engineering Manager, Architect, Principal Engineer, Director of Engineering, VP Engineering, CTO, Data Analyst, Product Manager, Designer, HR Executive, Business Analyst, DevOps Engineer, QA Engineer, etc.`,
      };

    case 'specializations':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) specialization name
- category: (REQUIRED) one of: "technology"|"data"|"design"|"business"|"language"|"science"|"mathematics"|"arts"|"health"|"exam_prep"|"professional"|"other"
- description: (max 2000 chars)
- is_active: true
- sort_order: sequential number
Generate specializations relevant to Indian education and professional development.`,
        user: `Generate ${count} specializations. Include: Web Development, Mobile Development, Machine Learning, Data Science, Cloud Computing, Cybersecurity, UI/UX Design, Digital Marketing, Financial Analysis, Competitive Exam Prep (UPSC, CAT, GATE, JEE), Content Writing, Blockchain, IoT, Game Development, Project Management, etc.`,
      };

    case 'learning_goals':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) learning goal name
- description: (max 2000 chars)
- display_order: sequential integer
- is_active: true
- sort_order: sequential number
Generate learning goals for an Indian educational platform.`,
        user: `Generate ${count} learning goals. Examples: "Get a job in IT", "Prepare for government exams", "Learn a new programming language", "Upskill for promotion", "Career switch to tech", "Build a portfolio", "Prepare for interviews", "Learn freelancing", "Start a business", "Academic excellence", "Competitive exam preparation", "Personal development", etc.`,
      };

    case 'social_medias':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) platform display name
- code: (REQUIRED, 1-50 chars) lowercase slug e.g. "linkedin", "github"
- base_url: (max 500 chars) profile base URL e.g. "https://linkedin.com/in/"
- placeholder: (max 500 chars) placeholder text for the URL input e.g. "your-profile-slug"
- platform_type: (REQUIRED) one of: "social"|"professional"|"code"|"video"|"blog"|"portfolio"|"messaging"|"website"|"other"
- display_order: sequential integer
- is_active: true
- sort_order: sequential number
Generate popular social media and professional platforms.`,
        user: `Generate ${count} platforms. Include: LinkedIn, GitHub, Twitter/X, Facebook, Instagram, YouTube, LeetCode, HackerRank, Stack Overflow, Medium, Behance, Dribbble, CodePen, Portfolio Website, Personal Blog, Telegram, WhatsApp, Discord, Reddit, Kaggle, etc.`,
      };

    case 'countries':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) country name in English
- nationality: (max 200 chars) e.g. "Indian", "American"
- iso2: (REQUIRED, exactly 2 chars) ISO 3166-1 alpha-2 code e.g. "IN", "US"
- iso3: (REQUIRED, exactly 3 chars) ISO 3166-1 alpha-3 code e.g. "IND", "USA"
- phone_code: (max 10 chars) international dialing code e.g. "+91", "+1"
- currency: (max 3 chars) ISO 4217 currency code e.g. "INR", "USD"
- currency_symbol: (max 5 chars) e.g. "₹", "$"
- currency_name: (max 100 chars) e.g. "Indian Rupee", "US Dollar"
- tld: (max 10 chars) top-level domain e.g. ".in", ".us"
- national_language: (max 100 chars) primary language
- region: (max 100 chars) world region e.g. "Asia", "Europe", "Africa"
- subregion: (max 100 chars) e.g. "Southern Asia", "Western Europe"
- languages: JSON array of language objects [{"code":"hi","name":"Hindi"},...]
- latitude: decimal number
- longitude: decimal number
- is_active: true
- sort_order: sequential number
Generate real-world countries with accurate data.`,
        user: `Generate ${count} countries with accurate ISO codes, currencies, and phone codes. Start with major countries: India, United States, United Kingdom, Canada, Australia, Germany, France, Japan, China, Brazil, etc.`,
      };

    case 'states':
      return {
        system: `${base}
FIELDS per record:
- country_id: (REQUIRED) must be a valid ID from available countries below
- name: (REQUIRED, 1-200 chars) state/province name
- state_code: (max 10 chars) state abbreviation e.g. "GJ", "MH", "CA"
- is_active: true
- sort_order: sequential number

Available countries: ${JSON.stringify(context.countries?.map((c: any) => ({ id: c.id, name: c.name, iso2: c.iso2 })) || [])}
Use ONLY these IDs for country_id. Generate states/provinces that belong to these countries.`,
        user: `Generate ${count} states/provinces. Focus primarily on Indian states (Gujarat, Maharashtra, Rajasthan, Karnataka, Tamil Nadu, etc.) and include some states from other available countries. Use accurate state codes.`,
      };

    case 'cities':
      return {
        system: `${base}
FIELDS per record:
- state_id: (REQUIRED) must be a valid ID from available states below
- name: (REQUIRED, 1-200 chars) city name
- phonecode: (max 20 chars) STD/area code e.g. "0261", "022", "011"
- timezone: (max 100 chars) timezone identifier e.g. "Asia/Kolkata", "America/New_York"
- latitude: decimal number
- longitude: decimal number
- is_active: true
- sort_order: sequential number

Available countries: ${JSON.stringify(context.countries?.slice(0, 20).map((c: any) => ({ id: c.id, name: c.name })) || [])}
Available states (with country_id): ${JSON.stringify(context.states?.map((s: any) => ({ id: s.id, name: s.name, state_code: s.state_code, country_id: s.country_id })) || [])}
Use ONLY the available state IDs for state_id. Generate cities that belong to these states.`,
        user: `Generate ${count} cities. Focus primarily on major Indian cities (Surat, Ahmedabad, Mumbai, Delhi, Bangalore, Chennai, Hyderabad, Pune, Kolkata, Jaipur, etc.) mapped to their correct state. Include cities from other available states/countries too. Use accurate phone codes and timezones.`,
      };

    case 'categories':
      return {
        system: `${base}
FIELDS per record:
- code: (REQUIRED, 1-100 chars) unique lowercase code e.g. "programming", "data-science"
- slug: (REQUIRED, 1-200 chars) URL-friendly slug, usually same as code
NOTE: "name" is NOT a field in categories table — names are stored in category_translations table.
- display_order: sequential integer starting from 1
- is_new: boolean (true for recently added categories)
- new_until: date string "YYYY-MM-DD" or null
- is_active: true
- og_site_name: "GrowUpMore"
- og_type: "website"
- twitter_site: "@growupmore"
- twitter_card: "summary_large_image"
- robots_directive: "index, follow"
- sort_order: sequential number
Do NOT include: image (uploaded separately). Generate categories for an Indian educational platform.`,
        user: `Generate ${count} categories for course/content categories. Each must have a code and slug (name is stored in the translations table, not in the categories table). Examples: code="programming" slug="programming", code="web-development" slug="web-development", code="data-science" slug="data-science", code="machine-learning" slug="machine-learning", etc.`,
      };

    case 'sub_categories':
      return {
        system: `${base}
FIELDS per record:
- category_id: (REQUIRED) must be a valid ID from available categories below
- code: (REQUIRED, 1-100 chars) unique lowercase code e.g. "react", "python-basics"
- slug: (REQUIRED, 1-200 chars) URL-friendly slug, usually same as code
NOTE: "name" is NOT a field in sub_categories table — names are stored in sub_category_translations table.
- display_order: sequential integer starting from 1
- is_new: boolean (true for recently added)
- new_until: date string "YYYY-MM-DD" or null
- is_active: true
- og_site_name: "GrowUpMore"
- og_type: "website"
- twitter_site: "@growupmore"
- twitter_card: "summary_large_image"
- robots_directive: "index, follow"
- sort_order: sequential number
Do NOT include: image (uploaded separately).

Available categories (use ONLY these IDs for category_id): ${JSON.stringify(context.categories?.map((c: any) => ({ id: c.id, code: c.code, slug: c.slug })) || [])}
Assign each sub-category to its most relevant parent category.`,
        user: `Generate ${count} sub-categories. Each must have category_id, code, and slug (name is stored in the translations table, not in the sub_categories table). Map each to the correct parent category from the available list. Examples: code="react" slug="react" (under web-development), code="python" slug="python" (under programming), code="aws" slug="aws" (under cloud-computing), etc.`,
      };

    case 'branches':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) branch name e.g. "GrowUpMore Surat HQ", "GrowUpMore Mumbai Office"
- code: (REQUIRED, 1-50 chars) unique uppercase code e.g. "SRT-HQ", "MUM-01", "DEL-02"
- branch_type: (REQUIRED) one of: "headquarters"|"office"|"campus"|"remote"|"warehouse"|"other"
- address_line_1: (max 255) street address
- address_line_2: (max 255) area, landmark
- pincode: (max 10) 6-digit Indian PIN code
- phone: (max 20) phone number with country code e.g. "+91-261-1234567"
- email: (max 255) branch email e.g. "surat@growupmore.com"
- website: (max 500) branch website URL or null
- google_maps_url: (max 1000) Google Maps URL or null
- is_active: true
- sort_order: sequential number
${context.countries?.length ? `Available country IDs: ${JSON.stringify(context.countries.map((c: any) => ({ id: c.id, name: c.name })))}. Use for country_id.` : ''}
${context.states?.length ? `Available state IDs: ${JSON.stringify(context.states.map((s: any) => ({ id: s.id, name: s.name })))}. Use for state_id.` : ''}
${context.cities?.length ? `Available city IDs (with state_id): ${JSON.stringify(context.cities.slice(0, 50).map((c: any) => ({ id: c.id, name: c.name, state_id: c.state_id })))}. Use for city_id. Ensure city's state_id matches the chosen state.` : ''}
Do NOT include: branch_manager_id (this is assigned separately).`,
        user: `Generate ${count} branch/office records for GrowUpMore across different Indian cities. Include a head office, regional offices, and branch offices. Use realistic Indian addresses and PIN codes.`,
      };

    case 'departments':
      return {
        system: `${base}
FIELDS per record:
- name: (REQUIRED, 1-200 chars) department name e.g. "Engineering", "Human Resources"
- code: (REQUIRED, 1-50 chars) unique uppercase code e.g. "ENG", "HR", "MKT", "FIN"
- description: (max 2000 chars) brief description of department responsibilities
- is_active: true
- sort_order: sequential number
${context.existing_departments?.length ? `Existing departments (for parent_department_id, optional): ${JSON.stringify(context.existing_departments.map((d: any) => ({ id: d.id, name: d.name, code: d.code })))}. You may set parent_department_id to create sub-departments under existing ones, or set to null for top-level departments.` : ''}
Do NOT include: head_user_id (this is assigned separately).`,
        user: `Generate ${count} department records for an educational technology company. Include core departments (Engineering, Product, Design, Marketing, Sales, HR, Finance, Operations, Legal, Customer Support, Content, Quality Assurance) and optionally sub-departments.`,
      };

    case 'branch_departments':
      return {
        system: `${base}
FIELDS per record:
- branch_id: (REQUIRED) ID of a branch from the available list below
- department_id: (REQUIRED) ID of a department from the available list below
- is_active: true
- sort_order: sequential number

Available branches: ${JSON.stringify((context.branches || []).map((b: any) => ({ id: b.id, name: b.name, code: b.code })))}
Available departments: ${JSON.stringify((context.departments || []).map((d: any) => ({ id: d.id, name: d.name, code: d.code })))}
${context.existing_assignments?.length ? `\nAlready assigned (branch_id-department_id pairs to SKIP): ${context.existing_assignments.join(', ')}` : ''}

IMPORTANT: Each branch_id + department_id combination must be UNIQUE. Do not create duplicate assignments.
Do NOT include: head_user_id (this is assigned separately).`,
        user: `Generate ${count} branch-department assignment records. Assign departments to branches logically — every branch should have core departments (HR, Finance, Administration) and larger branches should also have specialized departments.`,
      };

    case 'employee_profiles': {
      const availUsers = context.available_users || [];
      const usersToAssign = availUsers.slice(0, count);
      return {
        system: `${base}
IMPORTANT: This is a 1:1 profile table. Each user can have ONLY ONE employee profile. Generate exactly ${Math.min(count, usersToAssign.length)} records, one per user.
${usersToAssign.length === 0 ? '\n⚠️ NO USERS AVAILABLE — all users already have employee profiles.' : ''}
FIELDS per record:
- user_id: (REQUIRED) must use ONLY from the available users list below
- employee_code: (REQUIRED, UNIQUE) format "EMP-YYYY-NNN" e.g. "EMP-2024-001", "EMP-2025-042"
- employee_type: (REQUIRED) one of: "full_time"|"part_time"|"contract"|"probation"|"intern"|"consultant"|"temporary"|"freelance"
- designation_id: (REQUIRED) pick from available designations below
- department_id: (REQUIRED) pick from available departments below
- branch_id: (REQUIRED) pick from available branches below
- reporting_manager_id: null (assigned separately)
- joining_date: (REQUIRED) realistic date between 2020-01-01 and 2025-12-31
- confirmation_date: set if employee_type is NOT probation (typically joining_date + 6 months)
- probation_end_date: set if employee_type is "probation"
- work_mode: one of: "on_site"|"remote"|"hybrid"
- shift_type: one of: "general"|"morning"|"afternoon"|"night"|"rotational"|"flexible"|"other"
- work_location: e.g. "Floor 2, Seat B-12" or "Remote - Mumbai"
- weekly_off_days: e.g. "saturday,sunday"
- pay_grade: one of: "L1"|"L2"|"L3"|"M1"|"M2"|"E1"|"E2"
- salary_currency: "INR"
- ctc_annual: realistic Indian CTC (300000 to 5000000)
- basic_salary_monthly: roughly 40% of CTC/12
- payment_mode: one of: "bank_transfer"|"cheque"|"cash"|"upi"|"other"
- pf_number: format "GJ/AHD/NNNNN" (realistic Indian PF number) or null
- esi_number: 10-digit number string or null
- uan_number: 12-digit number string or null
- tax_regime: "old"|"new"
- leave_balance_casual: 0-12
- leave_balance_sick: 0-12
- leave_balance_earned: 0-30
- total_experience_years: 0-30
- experience_at_joining: 0-25
- has_system_access: true/false
- has_email_access: true/false
- has_vpn_access: true/false (true for remote/hybrid)
- notice_period_days: 30, 60, or 90
- is_active: true

Available users to assign (use ONLY these user_ids — these are users with type="employee"): ${JSON.stringify(usersToAssign.map((u: any) => ({ id: u.id, name: u.full_name })))}
${context.designations?.length ? `Available designations: ${JSON.stringify(context.designations.map((d: any) => ({ id: d.id, name: d.name })))}` : ''}
${context.departments?.length ? `Available departments: ${JSON.stringify(context.departments.map((d: any) => ({ id: d.id, name: d.name })))}` : ''}
${context.branches?.length ? `Available branches: ${JSON.stringify(context.branches.map((b: any) => ({ id: b.id, name: b.name })))}` : ''}

Do NOT include: shift_branch_id, exit_type, exit_reason, exit_interview_done, full_and_final_done, contract_end_date, resignation_date, last_working_date, relieving_date, access_card_number, laptop_asset_id, professional_tax_number.`,
        user: `Generate ${Math.min(count, usersToAssign.length)} employee profiles for GrowUpMore staff. Create diverse profiles: mix of full_time, part_time, contract, intern. Vary departments, designations, branches. Use realistic Indian salary data, PF numbers, and joining dates.`,
      };
    }

    case 'student_profiles': {
      const availUsers = context.available_users || [];
      const usersToAssign = availUsers.slice(0, count);
      return {
        system: `${base}
IMPORTANT: This is a 1:1 profile table. Each user can have ONLY ONE student profile. Generate exactly ${Math.min(count, usersToAssign.length)} records, one per user.
${usersToAssign.length === 0 ? '\n⚠️ NO USERS AVAILABLE — all users already have student profiles.' : ''}
FIELDS per record:
- user_id: (REQUIRED) must use ONLY from the available users list below
- enrollment_number: (REQUIRED, UNIQUE) format "STU-YYYY-NNNNN" e.g. "STU-2024-00001"
- enrollment_date: realistic date (2023-01-01 to today)
- enrollment_type: one of: "self"|"corporate"|"scholarship"|"referral"|"trial"|"other"
- education_level_id: pick from available education levels below (or null)
- current_institution: realistic Indian institution name e.g. "IIT Bombay", "BITS Pilani", "Delhi University"
- current_field_of_study: e.g. "Computer Science", "Business Administration", "Electrical Engineering"
- current_semester_or_year: e.g. "3rd Semester", "2nd Year", "Final Year"
- expected_graduation_date: future date or null
- is_currently_studying: true/false
- learning_goal_id: pick from available learning goals below (or null)
- specialization_id: pick from available specializations below (or null)
- preferred_learning_mode: one of: "self_paced"|"instructor_led"|"hybrid"|"cohort_based"|"mentored"
- preferred_learning_language_id: pick from available languages below (or null)
- preferred_content_type: one of: "video"|"text"|"interactive"|"audio"|"mixed"
- daily_learning_hours: 0.5 to 8.0
- weekly_available_days: 1 to 7
- difficulty_preference: one of: "beginner"|"intermediate"|"advanced"|"mixed"
- parent_guardian_name: realistic Indian name or null
- parent_guardian_phone: Indian phone format "+91-XXXXXXXXXX" or null
- parent_guardian_relation: one of: "father"|"mother"|"guardian"|"spouse"|"sibling"|"other" or null
- courses_enrolled: 0-20
- courses_completed: 0 to courses_enrolled
- courses_in_progress: courses_enrolled - courses_completed
- certificates_earned: 0 to courses_completed
- total_learning_hours: 0-2000
- average_score: 40.00-99.00 or null
- current_streak_days: 0-365
- longest_streak_days: >= current_streak_days
- xp_points: 0-50000
- level: 1-50
- subscription_plan: one of: "free"|"basic"|"standard"|"premium"|"enterprise"|"lifetime"
- has_active_subscription: true if plan != "free"
- is_seeking_job: true/false
- is_open_to_internship: true/false
- is_open_to_freelance: true/false
- is_active: true

Available users to assign (use ONLY these user_ids — these are users with type="student"): ${JSON.stringify(usersToAssign.map((u: any) => ({ id: u.id, name: u.full_name })))}
${context.education_levels?.length ? `Available education levels: ${JSON.stringify(context.education_levels.map((e: any) => ({ id: e.id, name: e.name })))}` : ''}
${context.learning_goals?.length ? `Available learning goals: ${JSON.stringify(context.learning_goals.map((l: any) => ({ id: l.id, name: l.name })))}` : ''}
${context.specializations?.length ? `Available specializations: ${JSON.stringify(context.specializations.map((s: any) => ({ id: s.id, name: s.name })))}` : ''}
${context.languages?.length ? `Available languages: ${JSON.stringify(context.languages.map((l: any) => ({ id: l.id, name: l.name })))}` : ''}

Do NOT include: referred_by_user_id, referral_code, subscription_start_date, subscription_end_date, total_amount_paid, resume_url, portfolio_url, preferred_job_roles, preferred_locations, expected_salary_range, parent_guardian_email.`,
        user: `Generate ${Math.min(count, usersToAssign.length)} student profiles for GrowUpMore learners. Create diverse profiles: mix of self-enrolled, corporate, scholarship students. Vary education levels, institutions, learning preferences, subscription plans. Include realistic academic performance metrics.`,
      };
    }

    case 'instructor_profiles': {
      const availUsers = context.available_users || [];
      const usersToAssign = availUsers.slice(0, count);
      return {
        system: `${base}
IMPORTANT: This is a 1:1 profile table. Each user can have ONLY ONE instructor profile. Generate exactly ${Math.min(count, usersToAssign.length)} records, one per user.
${usersToAssign.length === 0 ? '\n⚠️ NO USERS AVAILABLE — all users already have instructor profiles.' : ''}
FIELDS per record:
- user_id: (REQUIRED) must use ONLY from the available users list below
- instructor_code: (REQUIRED, UNIQUE) format "INS-YYYY-NNN" e.g. "INS-2024-001"
- instructor_type: one of: "internal"|"external"|"guest"|"visiting"|"corporate"|"community"|"other"
- designation_id: pick from available designations below (or null)
- department_id: pick from available departments below (or null)
- branch_id: pick from available branches below (or null)
- joining_date: realistic date for instructors (2020-2025)
- specialization_id: pick from available specializations below (or null)
- secondary_specialization_id: pick a DIFFERENT specialization or null
- teaching_experience_years: 0-30
- industry_experience_years: 0-30
- total_experience_years: max of teaching + industry
- preferred_teaching_language_id: pick from available languages below (or null)
- teaching_mode: one of: "online"|"offline"|"hybrid"|"recorded_only"
- instructor_bio: 2-4 sentences describing expertise and teaching philosophy
- tagline: short catchy tagline e.g. "Making Machine Learning accessible to everyone"
- highest_qualification: e.g. "Ph.D. in Computer Science", "M.Tech in AI", "MBA from IIM Ahmedabad"
- certifications_summary: e.g. "AWS Solutions Architect, PMP, Scrum Master"
- publications_count: 0-50
- patents_count: 0-10
- total_courses_created: 0-20
- total_courses_published: 0 to total_courses_created
- total_students_taught: 0-50000
- total_reviews_received: 0-5000
- average_rating: 0.0-5.0 (realistic: 3.5-4.8)
- total_teaching_hours: 0-10000
- total_content_minutes: 0-50000
- completion_rate: 50.00-95.00
- is_available: true/false
- available_hours_per_week: 5-40
- max_concurrent_courses: 1-5
- payment_model: one of: "revenue_share"|"fixed_per_course"|"hourly"|"monthly_salary"|"per_student"|"hybrid"|"volunteer"|"other"
- revenue_share_percentage: 30.00-70.00 (if revenue_share model)
- hourly_rate: 500-10000 INR (if hourly model)
- payment_currency: "INR"
- approval_status: one of: "pending"|"under_review"|"approved"|"rejected"|"suspended"|"blacklisted" (most should be "approved")
- is_verified: true/false (true for approved)
- is_featured: true/false (few should be true)
- badge: one of: "new"|"rising"|"popular"|"top_rated"|"expert"|"elite" or null
- is_active: true

Available users to assign (use ONLY these user_ids — these are users with type="instructor"): ${JSON.stringify(usersToAssign.map((u: any) => ({ id: u.id, name: u.full_name })))}
${context.designations?.length ? `Available designations: ${JSON.stringify(context.designations.map((d: any) => ({ id: d.id, name: d.name })))}` : ''}
${context.departments?.length ? `Available departments: ${JSON.stringify(context.departments.map((d: any) => ({ id: d.id, name: d.name })))}` : ''}
${context.branches?.length ? `Available branches: ${JSON.stringify(context.branches.map((b: any) => ({ id: b.id, name: b.name })))}` : ''}
${context.specializations?.length ? `Available specializations: ${JSON.stringify(context.specializations.map((s: any) => ({ id: s.id, name: s.name })))}` : ''}
${context.languages?.length ? `Available languages: ${JSON.stringify(context.languages.map((l: any) => ({ id: l.id, name: l.name })))}` : ''}

Do NOT include: demo_video_url, intro_video_duration_sec, awards_and_recognition, available_from, available_until, preferred_time_slots, fixed_rate_per_course, approved_by, approved_at, rejection_reason.`,
        user: `Generate ${Math.min(count, usersToAssign.length)} instructor profiles for GrowUpMore. Create diverse profiles: mix of internal, external, guest, visiting instructors. Vary specializations, experience levels, teaching modes. Include realistic qualifications and performance metrics. Most should be "approved" status.`,
      };
    }

    case 'subjects':
      return {
        system: `${base}
FIELDS per record:
- code: (REQUIRED, UNIQUE, 1-100 chars) short uppercase code e.g. "MATH", "PHYSICS", "CS101", "ENG-LIT"
- slug: (REQUIRED, UNIQUE, 1-255 chars) URL-friendly lowercase slug e.g. "mathematics", "physics", "computer-science-101"
- difficulty_level: (REQUIRED) one of: "beginner"|"intermediate"|"advanced"|"expert"|"all_levels"
- estimated_hours: integer (estimated hours to complete the subject, 10-500)
- display_order: sequential integer starting from 1
- sort_order: sequential integer starting from 1
- is_active: true
Generate subjects relevant to an Indian educational platform covering academics, competitive exams, technology, and professional development.`,
        user: `Generate ${count} unique subjects. Include diverse topics: Mathematics, Physics, Chemistry, Biology, Computer Science, English Literature, Hindi, Data Structures & Algorithms, Web Development, Machine Learning, Digital Marketing, Aptitude & Reasoning, UPSC Preparation, CAT Preparation, GATE CS, JEE Maths, Accounting & Finance, etc. Use meaningful codes and URL-friendly slugs.`,
      };

    case 'chapters': {
      const subjects = context.subjects || [];
      return {
        system: `${base}
FIELDS per record:
- subject_id: (REQUIRED) must be a valid ID from available subjects below
- slug: (REQUIRED, UNIQUE per subject, 1-255 chars) URL-friendly lowercase slug e.g. "linear-algebra", "organic-chemistry"
- display_order: sequential integer per subject (1, 2, 3... within each subject)
- sort_order: sequential integer starting from 1
- is_active: true

Available subjects: ${JSON.stringify(subjects.map((s: any) => ({ id: s.id, code: s.code, slug: s.slug })))}
Distribute chapters across the available subjects. Each chapter slug must be unique within its subject.`,
        user: `Generate ${count} chapters distributed across the available subjects. For each subject, create logical chapter sequences. For example: Mathematics might have "linear-algebra", "calculus", "probability"; Computer Science might have "data-structures", "algorithms", "operating-systems". Use descriptive, URL-friendly slugs.`,
      };
    }

    case 'topics': {
      const chapters = context.chapters || [];
      return {
        system: `${base}
FIELDS per record:
- chapter_id: (REQUIRED) must be a valid ID from available chapters below
- slug: (REQUIRED, UNIQUE per chapter, 1-255 chars) URL-friendly lowercase slug e.g. "matrix-multiplication", "newtons-laws"
- display_order: sequential integer per chapter (1, 2, 3... within each chapter)
- sort_order: sequential integer starting from 1
- is_active: true

Available chapters: ${JSON.stringify(chapters.map((c: any) => ({ id: c.id, slug: c.slug, subject: (c as any).subjects?.code || c.subject_id })))}
Distribute topics across the available chapters. Each topic slug must be unique within its chapter.`,
        user: `Generate ${count} topics distributed across the available chapters. Each chapter should get 2-5 granular topics. For example: a "linear-algebra" chapter might have "vectors-and-scalars", "matrix-operations", "eigenvalues-eigenvectors". Use descriptive URL-friendly slugs.`,
      };
    }
  }
}

export async function generateMasterData(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { module, provider: reqProvider, count: reqCount, prompt } = req.body;
    if (!module || !VALID_MASTER_MODULES.includes(module)) return err(res, `Invalid module. Must be one of: ${VALID_MASTER_MODULES.join(', ')}`, 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const count = Math.min(Math.max(reqCount || 10, 1), 100);

    const [context, existingRecords] = await Promise.all([
      fetchMasterContext(module),
      fetchExistingMasterRecords(module),
    ]);
    const { system, user: userContent } = buildMasterDataPrompt(module, context, count, existingRecords);
    const finalUserContent = prompt ? `${userContent}\n\nAdditional instructions from user: ${prompt}` : userContent;

    const { text, inputTokens, outputTokens } = await callAI(provider, system, finalUserContent);

    let generated: any;
    try { generated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    // Ensure array
    if (!Array.isArray(generated)) {
      const keys = Object.keys(generated);
      if (keys.length === 1 && Array.isArray(generated[keys[0]])) {
        generated = generated[keys[0]];
      } else {
        generated = [generated];
      }
    }

    logAdmin({ actorId: userId, action: 'ai_sample_data_generated', targetType: `master_${module}`, targetId: 0, targetName: `master → ${module} (${provider}, ${generated.length} records)`, ip: getClientIp(req) });

    return ok(res, {
      module,
      provider,
      generated,
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, `${generated.length} ${module} records generated successfully`);
  } catch (error: any) {
    console.error('AI generateMasterData error:', error);
    return err(res, error.message || 'Master data generation failed', 500);
  }
}

// ─── AI MASTER DATA UPDATE ─────────────────────────────────────────

const MASTER_TABLE_MAP: Record<MasterModule, string> = {
  skills: 'skills',
  languages: 'languages',
  education_levels: 'education_levels',
  document_types: 'document_types',
  documents: 'documents',
  designations: 'designations',
  specializations: 'specializations',
  learning_goals: 'learning_goals',
  social_medias: 'social_medias',
  countries: 'countries',
  states: 'states',
  cities: 'cities',
  categories: 'categories',
  sub_categories: 'sub_categories',
  branches: 'branches',
  departments: 'departments',
  branch_departments: 'branch_departments',
  employee_profiles: 'employee_profiles',
  student_profiles: 'student_profiles',
  instructor_profiles: 'instructor_profiles',
  subjects: 'subjects',
  chapters: 'chapters',
  topics: 'topics',
};

// Columns to exclude from AI update payload (system-managed)
const SYSTEM_COLUMNS = ['id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by', 'deleted_by', 'flag_image', 'icon', 'icon_url', 'image'];

function stripSystemColumns(record: any): any {
  const cleaned: any = {};
  for (const [k, v] of Object.entries(record)) {
    if (!SYSTEM_COLUMNS.includes(k)) cleaned[k] = v;
  }
  return cleaned;
}

export async function updateMasterData(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { module, provider: reqProvider, prompt, record_ids } = req.body;
    if (!module || !VALID_MASTER_MODULES.includes(module)) return err(res, `Invalid module. Must be one of: ${VALID_MASTER_MODULES.join(', ')}`, 400);
    if (!prompt) return err(res, 'Prompt is required for update mode', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const table = MASTER_TABLE_MAP[module as MasterModule];

    // Fetch existing records
    let q = supabase.from(table).select('*').is('deleted_at', null).eq('is_active', true);
    if (record_ids && Array.isArray(record_ids) && record_ids.length > 0) {
      q = q.in('id', record_ids);
    }
    q = q.order('id').limit(100);

    const { data: existingRecords, error: fetchErr } = await q;
    if (fetchErr) return err(res, fetchErr.message, 500);
    if (!existingRecords || existingRecords.length === 0) return err(res, 'No existing records found to update', 404);

    // Build update prompt
    const recordsForAI = existingRecords.map(r => {
      const cleaned = stripSystemColumns(r);
      cleaned.id = r.id; // keep id so AI can map updates back
      return cleaned;
    });

    const systemPrompt = `You are a master data updater for an Indian educational platform called GrowUpMore.
You will receive existing records from the "${module}" table and a user instruction.
Your job is to UPDATE the existing records according to the user's instructions.

CRITICAL RULES:
1. Return ONLY valid JSON — a JSON array of objects.
2. Each object MUST include the "id" field with the EXACT same value from the input — this is used to map updates.
3. Only modify the fields that the user's instruction asks you to change. Keep other fields unchanged.
4. Do NOT add new records — only update the ones provided.
5. Do NOT remove any records — return ALL provided records.
6. Do NOT include system fields: created_at, updated_at, deleted_at, created_by, updated_by, deleted_by, flag_image, icon, icon_url, image.`;

    const userContent = `EXISTING RECORDS:\n${JSON.stringify(recordsForAI, null, 2)}\n\nUSER INSTRUCTION: ${prompt}`;

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);

    let updated: any;
    try { updated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    // Ensure array
    if (!Array.isArray(updated)) {
      const keys = Object.keys(updated);
      if (keys.length === 1 && Array.isArray(updated[keys[0]])) {
        updated = updated[keys[0]];
      } else {
        updated = [updated];
      }
    }

    // Validate all returned records have valid IDs from the original set
    const validIds = new Set(existingRecords.map(r => r.id));
    updated = updated.filter((r: any) => r.id && validIds.has(r.id));

    logAdmin({ actorId: userId, action: 'ai_master_data_updated', targetType: `master_${module}`, targetId: 0, targetName: `master → ${module} update (${provider}, ${updated.length} records)`, ip: getClientIp(req) });

    return ok(res, {
      module,
      provider,
      generated: updated,
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, `${updated.length} ${module} records updated by AI`);
  } catch (error: any) {
    console.error('AI updateMasterData error:', error);
    return err(res, error.message || 'Master data update failed', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ── Generate / Update Resume Content (Headline + Bio) ──
// ═══════════════════════════════════════════════════════════════════════

export async function generateResumeContent(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { provider: reqProvider, prompt, target_user_id, mode } = req.body;
    if (!target_user_id) return err(res, 'target_user_id is required', 400);
    if (!prompt?.trim()) return err(res, 'Prompt is required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const generateMode = mode === 'update' ? 'update' : 'generate';

    // Fetch user info
    const { data: targetUser } = await supabase.from('users').select('id, full_name, email').eq('id', target_user_id).single();
    if (!targetUser) return err(res, 'Target user not found', 404);

    // Fetch profile context (existing headline/bio + profile data)
    const { data: profile } = await supabase.from('user_profiles').select('headline, bio, gender, date_of_birth, marital_status').eq('user_id', target_user_id).maybeSingle();

    // Fetch skills, education, experience for richer context
    const [skillsRes, eduRes, expRes] = await Promise.all([
      supabase.from('user_skills').select('skill:skills(name), proficiency_level').eq('user_id', target_user_id).is('deleted_at', null).limit(20),
      supabase.from('user_education').select('institution_name, degree, field_of_study, start_year, end_year').eq('user_id', target_user_id).is('deleted_at', null).order('end_year', { ascending: false }).limit(5),
      supabase.from('user_experience').select('company_name, job_title, start_date, end_date, is_current').eq('user_id', target_user_id).is('deleted_at', null).order('start_date', { ascending: false }).limit(5),
    ]);

    const skills = (skillsRes.data || []).map((s: any) => s.skill?.name).filter(Boolean);
    const education = (eduRes.data || []).map((e: any) => `${e.degree || ''} in ${e.field_of_study || ''} from ${e.institution_name || ''} (${e.start_year || ''}–${e.end_year || 'present'})`).filter((s: string) => s.trim().length > 10);
    const experience = (expRes.data || []).map((e: any) => `${e.job_title || ''} at ${e.company_name || ''} (${e.start_date?.slice(0, 7) || ''}–${e.is_current ? 'present' : e.end_date?.slice(0, 7) || ''})`).filter((s: string) => s.trim().length > 10);

    let contextBlock = `User: ${targetUser.full_name || targetUser.email}`;
    if (skills.length > 0) contextBlock += `\nSkills: ${skills.join(', ')}`;
    if (education.length > 0) contextBlock += `\nEducation:\n- ${education.join('\n- ')}`;
    if (experience.length > 0) contextBlock += `\nExperience:\n- ${experience.join('\n- ')}`;

    const systemPrompt = `You are a professional resume writer for an Indian educational/professional platform called GrowUpMore.
Generate a professional resume headline and bio for the user based on their profile data and the user's instructions.

RULES:
- headline: max 200 characters. A punchy, professional tagline. Use "|" or "·" as separators. e.g. "Senior Software Engineer | React & Node.js | Cloud Architecture"
- bio: max 2000 characters. A compelling 3rd-person professional summary. 2-4 sentences. Highlight key skills, experience, and aspirations.
- Return ONLY valid JSON: { "headline": "...", "bio": "..." }
- Do NOT include any markdown, code blocks, or extra text — ONLY the JSON object.
${generateMode === 'update' && profile?.headline ? `\nCurrent headline: "${profile.headline}"` : ''}
${generateMode === 'update' && profile?.bio ? `\nCurrent bio: "${profile.bio}"` : ''}`;

    const userContent = `${contextBlock}\n\nUser instructions: ${prompt.trim()}`;

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);

    let generated: any;
    try { generated = parseJSON(text); } catch { return err(res, 'AI returned invalid JSON. Please try again.', 500); }

    // Validate output
    if (!generated.headline && !generated.bio) return err(res, 'AI did not generate headline or bio. Please try again.', 500);
    if (generated.headline && generated.headline.length > 200) generated.headline = generated.headline.slice(0, 200);
    if (generated.bio && generated.bio.length > 2000) generated.bio = generated.bio.slice(0, 2000);

    logAdmin({ actorId: userId, action: 'ai_resume_content_generated', targetType: 'user_profile', targetId: target_user_id, targetName: `${targetUser.full_name} → resume (${provider})`, ip: getClientIp(req) });

    return ok(res, {
      generated,
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, 'Resume content generated');
  } catch (error: any) {
    console.error('AI generateResumeContent error:', error);
    return err(res, error.message || 'Resume content generation failed', 500);
  }
}

// ─── Auto Sub Topics from HTML file ───
export async function autoSubTopics(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { topic_id, language_id, prompt, provider: reqProvider, sub_topic_id: existingSubTopicId } = req.body;
    if (!topic_id) return err(res, 'topic_id is required', 400);
    if (!language_id) return err(res, 'language_id is required', 400);

    const file = (req as any).file;
    if (!file) return err(res, 'HTML file is required', 400);
    const origName = (file.originalname || '').toLowerCase();
    if (!origName.endsWith('.html') && !origName.endsWith('.htm')) return err(res, 'Only .html/.htm files are allowed', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Strip HTML helper
    function stripHtml(html: string): string {
      return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const htmlContent = file.buffer.toString('utf-8');
    const plainText = stripHtml(htmlContent);
    if (!plainText || plainText.length < 50) return err(res, 'HTML file has insufficient text content', 400);

    // Look up topic with parent chain for folder path (names + orders for sanitized CDN paths)
    const { data: topic } = await supabase
      .from('topics')
      .select('id, slug, name, display_order, chapter_id, chapters(slug, name, display_order, subject_id, subjects(slug, name))')
      .eq('id', topic_id)
      .single();
    if (!topic) return err(res, 'Topic not found', 404);

    // Build Bunny folder path using sanitized names (matching scaffold convention)
    // Falls back to slug when name is null (sanitizeName normalizes both to same result)
    const chapterData = (topic as any).chapters;
    const subjectRef = chapterData?.subjects?.name || chapterData?.subjects?.slug;
    const chapterRef = chapterData?.name || chapterData?.slug;
    const topicRef = topic.name || topic.slug;
    const materialBasePath = (subjectRef && chapterRef && topicRef)
      ? `materials/${buildCourseFolderName(subjectRef)}/${buildCdnName(chapterData.display_order ?? 0, chapterRef)}/${buildCdnName(topic.display_order ?? 0, topicRef)}`
      : null;

    // Look up language
    const { data: language } = await supabase.from('languages').select('id, iso_code, name').eq('id', language_id).single();
    if (!language) return err(res, 'Language not found', 404);

    const userPrompt = prompt || 'Analyze the content and break it into logical sub-topics for an educational platform.';

    const systemPrompt = `You are an expert educational content analyst for GrowUpMore — an online learning platform.
Analyze the provided text content and generate a SINGLE sub-topic representing this content as a learning unit.

Language: ${language.name} (${language.iso_code})
Topic slug: ${topic.slug}

Return ONLY a valid JSON object (no markdown, no code blocks, NOT an array — a single object).
The object must have these exact fields:
- "name": concise sub-topic title (in ${language.name})
- "slug": URL-friendly lowercase slug (English, kebab-case, max 80 chars)
- "short_intro": 1-2 sentence summary (in ${language.name}, max 300 chars)
- "long_intro": 2-4 sentence detailed description (in ${language.name}, max 1000 chars)
- "tags": array of 3-6 relevant keyword strings (in ${language.name})
- "difficulty_level": one of "beginner","intermediate","advanced","expert","all_levels"
- "estimated_minutes": number (estimated learning time)
- "video_title": engaging video title (in ${language.name}, max 100 chars)
- "video_description": video description (in ${language.name}, max 200 chars)
- "meta_title": SEO title (50-60 chars, in ${language.name})
- "meta_description": SEO description (150-160 chars, in ${language.name})
- "meta_keywords": comma-separated SEO keywords (in ${language.name})
- "og_title": Open Graph title (in ${language.name})
- "og_description": Open Graph description (100-150 chars, in ${language.name})
- "twitter_title": Twitter card title (in ${language.name})
- "twitter_description": Twitter description (70-100 chars, in ${language.name})
- "focus_keyword": primary SEO keyword (in ${language.name})

MOST IMPORTANT RULE — STRICTLY FOLLOW:
If the language is not English, do NOT write everything in pure ${language.name}. You MUST keep common and technical English words in English script (Latin letters) as they are — do NOT transliterate them into regional script.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names, and any word that sounds strange/unnatural/weird when translated.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें। Web Development में Semantic Elements को cover करता है।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें। आधुनिक वेब डेवलपमेंट..." — WRONG, technical words must stay in English script.

USER INSTRUCTIONS: ${userPrompt}`;

    const userContent = plainText.length > 15000 ? plainText.slice(0, 15000) : plainText;

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);

    let subTopicsData: any[];
    try {
      const parsed = parseJSON(text);
      // AI returns a single object; wrap in array for consistent processing
      subTopicsData = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return err(res, 'AI returned invalid JSON. Please try again.', 500);
    }

    if (!subTopicsData.length || !subTopicsData[0].name) return err(res, 'AI did not generate a sub-topic. Please try again.', 500);

    // Get current max display_order for this topic
    const { data: existingSubTopics } = await supabase
      .from('sub_topics')
      .select('id, slug, display_order')
      .eq('topic_id', topic_id)
      .is('deleted_at', null)
      .order('display_order', { ascending: false })
      .limit(1);

    let displayOrder = (existingSubTopics?.[0]?.display_order || 0) + 1;

    let createdSubTopics = 0;
    let updatedSubTopics = 0;
    let createdTranslations = 0;
    let updatedTranslations = 0;
    const resultDetails: any[] = [];

    for (const st of subTopicsData) {
      const slug = (st.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
      if (!slug) continue;

      let subTopicId: number;
      let isNewSubTopic = false;

      // If frontend passed an existing sub_topic_id, use it directly (prevents duplicate creation)
      if (existingSubTopicId) {
        const { data: directSt } = await supabase
          .from('sub_topics')
          .select('id, slug')
          .eq('id', Number(existingSubTopicId))
          .eq('topic_id', topic_id)
          .is('deleted_at', null)
          .single();

        if (directSt) {
          subTopicId = directSt.id;
          // Update slug if AI generated a better one and it doesn't conflict
          if (directSt.slug !== slug) {
            const { data: slugConflict } = await supabase
              .from('sub_topics')
              .select('id')
              .eq('topic_id', topic_id)
              .eq('slug', slug)
              .neq('id', directSt.id)
              .is('deleted_at', null)
              .single();
            if (!slugConflict) {
              await supabase.from('sub_topics').update({ slug }).eq('id', directSt.id);
            }
          }
          updatedSubTopics++;
        } else {
          // sub_topic_id was passed but not found — treat as new
          existingSubTopicId && console.warn(`sub_topic_id ${existingSubTopicId} not found, creating new`);
          const difficultyLevel = ['beginner', 'intermediate', 'advanced', 'expert', 'all_levels'].includes(st.difficulty_level)
            ? st.difficulty_level : 'all_levels';
          const estimatedMinutes = typeof st.estimated_minutes === 'number' ? st.estimated_minutes : 30;

          const { data: newSt, error: stErr } = await supabase
            .from('sub_topics')
            .insert({ topic_id, slug, display_order: displayOrder++, difficulty_level: difficultyLevel, estimated_minutes: estimatedMinutes, is_active: true, created_by: userId })
            .select('id')
            .single();

          if (stErr || !newSt) { console.error('Failed to create sub_topic:', stErr); continue; }
          subTopicId = newSt.id;
          isNewSubTopic = true;
          createdSubTopics++;
        }
      } else {
        // No sub_topic_id passed — match by slug (original behavior for new sub-topics)
        const { data: existingSt } = await supabase
          .from('sub_topics')
          .select('id, slug')
          .eq('topic_id', topic_id)
          .eq('slug', slug)
          .is('deleted_at', null)
          .single();

        if (existingSt) {
          subTopicId = existingSt.id;
          updatedSubTopics++;
        } else {
          const difficultyLevel = ['beginner', 'intermediate', 'advanced', 'expert', 'all_levels'].includes(st.difficulty_level)
            ? st.difficulty_level : 'all_levels';
          const estimatedMinutes = typeof st.estimated_minutes === 'number' ? st.estimated_minutes : 30;

          const { data: newSt, error: stErr } = await supabase
            .from('sub_topics')
            .insert({ topic_id, slug, display_order: displayOrder++, difficulty_level: difficultyLevel, estimated_minutes: estimatedMinutes, is_active: true, created_by: userId })
            .select('id')
            .single();

          if (stErr || !newSt) { console.error('Failed to create sub_topic:', stErr); continue; }
          subTopicId = newSt.id;
          isNewSubTopic = true;
          createdSubTopics++;
        }
      }

      // Check if translation exists (include page URL + name so we can preserve name on update)
      const { data: existingTrans } = await supabase
        .from('sub_topic_translations')
        .select('id, page, name')
        .eq('sub_topic_id', subTopicId)
        .eq('language_id', language_id)
        .is('deleted_at', null)
        .single();

      // Delete old page file from CDN if updating existing translation
      if (existingTrans?.page) {
        try {
          const oldPath = (existingTrans.page as string).replace(config.bunny.cdnUrl + '/', '').split('?')[0];
          await deleteImage(oldPath, existingTrans.page);
        } catch {}
      }

      // Upload HTML file to Bunny storage using original filename (topic-level path)
      let pageUrl: string | undefined;
      try {
        const originalName = file.originalname || `${slug}.html`;
        const pagePath = materialBasePath
          ? `${materialBasePath}/${language.iso_code}/${originalName}`
          : `sub-topic-translations/pages/${originalName}`;
        pageUrl = await uploadRawFile(file.buffer, pagePath);
      } catch (uploadErr) {
        console.error('Failed to upload page file to storage:', uploadErr);
      }

      const translationData: any = {
        sub_topic_id: subTopicId,
        language_id: Number(language_id),
        name: st.name || slug,
        short_intro: st.short_intro || '',
        long_intro: st.long_intro || '',
        tags: Array.isArray(st.tags) ? st.tags : (st.tags ? [st.tags] : []),
        video_title: st.video_title || '',
        video_description: st.video_description || '',
        meta_title: st.meta_title || '',
        meta_description: st.meta_description || '',
        meta_keywords: st.meta_keywords || '',
        og_title: st.og_title || '',
        og_description: st.og_description || '',
        twitter_title: st.twitter_title || '',
        twitter_description: st.twitter_description || '',
        focus_keyword: st.focus_keyword || '',
        is_active: true,
        created_by: userId,
      };
      if (pageUrl) translationData.page = pageUrl;

      if (existingTrans) {
        // Preserve existing translation name — never overwrite user-set names with AI-generated ones
        if (existingTrans.name) {
          translationData.name = existingTrans.name;
        }
        const { error: updErr } = await supabase
          .from('sub_topic_translations')
          .update({ ...translationData, updated_by: userId })
          .eq('id', existingTrans.id);

        if (updErr) console.error('Failed to update translation:', updErr);
        else updatedTranslations++;
      } else {
        const { error: insErr } = await supabase
          .from('sub_topic_translations')
          .insert(translationData);

        if (insErr) console.error('Failed to create translation:', insErr);
        else createdTranslations++;
      }

      resultDetails.push({
        sub_topic_id: subTopicId,
        slug,
        name: st.name || slug,
        is_new: isNewSubTopic,
        translation_action: existingTrans ? 'updated' : 'created',
        page_url: pageUrl || null,
      });
    }

    logAdmin({
      actorId: userId,
      action: 'ai_content_generated',
      targetType: 'topic',
      targetId: topic_id,
      targetName: `Auto sub-topics for topic ${topic.slug} (${language.iso_code}, ${provider})`,
      ip: getClientIp(req),
    });

    return ok(res, {
      created_sub_topics: createdSubTopics,
      updated_sub_topics: updatedSubTopics,
      created_translations: createdTranslations,
      updated_translations: updatedTranslations,
      sub_topics: resultDetails,
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }, 'Sub-topics generated successfully');
  } catch (error: any) {
    console.error('AI autoSubTopics error:', error);
    return err(res, error.message || 'Auto sub-topics generation failed', 500);
  }
}

// ─── Import Material Tree from TXT file ───
export async function importMaterialTree(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);

    const file = (req as any).file;
    if (!file) return err(res, 'TXT file is required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(req.body?.provider)) ? req.body.provider : 'gemini';
    const generateTranslations = req.body?.generate_translations !== 'false'; // default true

    // Parse the tab-indented file
    const content = file.buffer.toString('utf-8');
    const parsed = parseMaterialTree(content);

    if (parsed.errors.length > 0) {
      return err(res, `File parsing errors: ${parsed.errors.join('; ')}`, 400);
    }
    if (parsed.subjects.length === 0) {
      return err(res, 'No subjects found in file', 400);
    }

    const summary = treeSummary(parsed);

    // Fetch active languages for translations and folder creation
    const { data: languages } = await supabase
      .from('languages')
      .select('id, iso_code, name')
      .eq('is_active', true)
      .eq('for_material', true);
    const activeLangs = languages || [];

    // ─── Phase 1: Match existing & create new records ───
    const report = {
      created: { subjects: 0, chapters: 0, topics: 0, sub_topics: 0 },
      skipped: { subjects: 0, chapters: 0, topics: 0, sub_topics: 0 },
      errors: [] as string[],
      details: [] as any[],
    };

    // Build tree input for AI generator (tracks what's new vs existing)
    const aiTree: MaterialTreeInput = { subjects: [] };

    for (const parsedSubject of parsed.subjects) {
      const subjectMatch = await matchSubject(parsedSubject.name);
      let subjectId: number;
      let subjectSlug: string;
      let subjectIsNew = false;

      if (subjectMatch.found) {
        subjectId = subjectMatch.id!;
        subjectSlug = subjectMatch.slug!;
        report.skipped.subjects++;
        report.details.push({ type: 'subject', name: parsedSubject.name, action: 'skipped', id: subjectId });
      } else {
        // Create new subject
        const slug = await generateUniqueSlug(supabase, 'subjects', parsedSubject.name);
        const code = parsedSubject.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 20);
        const { data: newSubject, error: subErr } = await supabase
          .from('subjects')
          .insert({
            code,
            slug,
            name: parsedSubject.name,
            is_active: true,
            display_order: 1,
            sort_order: 1,
            created_by: userId,
          })
          .select()
          .single();

        if (subErr || !newSubject) {
          report.errors.push(`Failed to create subject "${parsedSubject.name}": ${subErr?.message || 'Unknown error'}`);
          continue;
        }

        subjectId = newSubject.id;
        subjectSlug = newSubject.slug;
        subjectIsNew = true;
        report.created.subjects++;
        report.details.push({ type: 'subject', name: parsedSubject.name, action: 'created', id: subjectId, slug });

        // Create Bunny folder using sanitized name (matching scaffold convention)
        createBunnyFolder(`materials/${buildCourseFolderName(parsedSubject.name)}`).catch(() => {});
      }

      const aiSubject: any = { name: parsedSubject.name, isNew: subjectIsNew, chapters: [] };

      // Process chapters
      for (let ci = 0; ci < parsedSubject.chapters.length; ci++) {
        const parsedChapter = parsedSubject.chapters[ci];
        const chapterMatch = await matchChapter(parsedChapter.name, subjectId);
        let chapterId: number;
        let chapterSlug: string;
        let chapterIsNew = false;

        if (chapterMatch.found) {
          chapterId = chapterMatch.id!;
          chapterSlug = chapterMatch.slug!;
          report.skipped.chapters++;
          report.details.push({ type: 'chapter', name: parsedChapter.name, action: 'skipped', id: chapterId, parent: parsedSubject.name });
        } else {
          // Create new chapter
          const slug = await generateUniqueSlug(supabase, 'chapters', parsedChapter.name, undefined, { column: 'subject_id', value: subjectId });
          const { data: newChapter, error: chErr } = await supabase
            .from('chapters')
            .insert({
              slug,
              name: parsedChapter.name,
              subject_id: subjectId,
              is_active: true,
              display_order: ci + 1,
              sort_order: ci + 1,
              created_by: userId,
            })
            .select()
            .single();

          if (chErr || !newChapter) {
            report.errors.push(`Failed to create chapter "${parsedChapter.name}": ${chErr?.message || 'Unknown error'}`);
            continue;
          }

          chapterId = newChapter.id;
          chapterSlug = newChapter.slug;
          chapterIsNew = true;
          report.created.chapters++;
          report.details.push({ type: 'chapter', name: parsedChapter.name, action: 'created', id: chapterId, slug, parent: parsedSubject.name });

          // Create Bunny folder using sanitized names (matching scaffold convention)
          const cdnSubject = buildCourseFolderName(parsedSubject.name);
          const cdnChapter = buildCdnName(ci + 1, parsedChapter.name);
          createBunnyFolder(`materials/${cdnSubject}/${cdnChapter}`).catch(() => {});
        }

        const aiChapter: any = { name: parsedChapter.name, isNew: chapterIsNew, topics: [] };

        // Process topics
        for (let ti = 0; ti < parsedChapter.topics.length; ti++) {
          const parsedTopic = parsedChapter.topics[ti];
          const topicMatch = await matchTopic(parsedTopic.name, chapterId);
          let topicId: number;
          let topicSlug: string;
          let topicIsNew = false;

          if (topicMatch.found) {
            topicId = topicMatch.id!;
            topicSlug = topicMatch.slug!;
            report.skipped.topics++;
            report.details.push({ type: 'topic', name: parsedTopic.name, action: 'skipped', id: topicMatch.id, parent: parsedChapter.name });
          } else {
            // Create new topic
            const slug = await generateUniqueSlug(supabase, 'topics', parsedTopic.name, undefined, { column: 'chapter_id', value: chapterId });
            const { data: newTopic, error: tErr } = await supabase
              .from('topics')
              .insert({
                slug,
                name: parsedTopic.name,
                chapter_id: chapterId,
                is_active: true,
                display_order: ti + 1,
                sort_order: ti + 1,
                created_by: userId,
              })
              .select()
              .single();

            if (tErr || !newTopic) {
              report.errors.push(`Failed to create topic "${parsedTopic.name}": ${tErr?.message || 'Unknown error'}`);
              aiChapter.topics.push({ name: parsedTopic.name, isNew: false });
              continue;
            }

            topicId = newTopic.id;
            topicSlug = newTopic.slug;
            topicIsNew = true;
            report.created.topics++;
            report.details.push({ type: 'topic', name: parsedTopic.name, action: 'created', id: newTopic.id, slug, parent: parsedChapter.name });

            // Create Bunny folders: topic + resources + language subfolders
            // Uses sanitized names (matching scaffold convention)
            const cdnSubject = buildCourseFolderName(parsedSubject.name);
            const cdnChapter = buildCdnName(ci + 1, parsedChapter.name);
            const cdnTopic = buildCdnName(ti + 1, parsedTopic.name);
            const basePath = `materials/${cdnSubject}/${cdnChapter}/${cdnTopic}`;
            const folders = [basePath, `${basePath}/resources`];
            for (const lang of activeLangs) {
              folders.push(`${basePath}/${lang.iso_code}`);
            }
            createBunnyFolders(folders).catch(() => {});
          }

          const aiTopic: any = { name: parsedTopic.name, isNew: topicIsNew, subTopics: [] };

          // Process sub-topics
          if (parsedTopic.subTopics && parsedTopic.subTopics.length > 0) {
            for (let sti = 0; sti < parsedTopic.subTopics.length; sti++) {
              const parsedSubTopic = parsedTopic.subTopics[sti];
              const stMatch = await matchSubTopic(parsedSubTopic.name, topicId);

              if (stMatch.found) {
                report.skipped.sub_topics++;
                report.details.push({ type: 'sub_topic', name: parsedSubTopic.name, action: 'skipped', id: stMatch.id, parent: parsedTopic.name });
                aiTopic.subTopics.push({ name: parsedSubTopic.name, isNew: false });
              } else {
                // Create new sub-topic
                const stSlug = await generateUniqueSlug(supabase, 'sub_topics', parsedSubTopic.name, undefined, { column: 'topic_id', value: topicId });
                const { data: newSubTopic, error: stErr } = await supabase
                  .from('sub_topics')
                  .insert({
                    slug: stSlug,
                    topic_id: topicId,
                    is_active: true,
                    display_order: sti + 1,
                    created_by: userId,
                  })
                  .select()
                  .single();

                if (stErr || !newSubTopic) {
                  report.errors.push(`Failed to create sub-topic "${parsedSubTopic.name}": ${stErr?.message || 'Unknown error'}`);
                  aiTopic.subTopics.push({ name: parsedSubTopic.name, isNew: false });
                  continue;
                }

                report.created.sub_topics++;
                report.details.push({ type: 'sub_topic', name: parsedSubTopic.name, action: 'created', id: newSubTopic.id, slug: stSlug, parent: parsedTopic.name });
                aiTopic.subTopics.push({ name: parsedSubTopic.name, isNew: true });
              }
            }
          }

          aiChapter.topics.push(aiTopic);
        }

        aiSubject.chapters.push(aiChapter);
      }

      aiTree.subjects.push(aiSubject);
    }

    // ─── Phase 2: Generate AI translations for all new items ───
    let aiGenerated = false;
    if (generateTranslations && activeLangs.length > 0) {
      const totalNew = report.created.subjects + report.created.chapters + report.created.topics + report.created.sub_topics;
      if (totalNew > 0) {
        try {
          const aiData = await generateMaterialData(
            aiTree,
            activeLangs.map(l => ({ iso_code: l.iso_code, name: l.name })),
            provider,
          );

          // Insert translations for new subjects
          for (const detail of report.details) {
            if (detail.action !== 'created') continue;

            const aiEntry =
              detail.type === 'subject' ? aiData.subjects[detail.name] :
              detail.type === 'chapter' ? aiData.chapters[detail.name] :
              detail.type === 'topic' ? aiData.topics[detail.name] :
              detail.type === 'sub_topic' ? aiData.sub_topics[detail.name] : null;

            if (!aiEntry || !aiEntry.translations) continue;

            // Update subject with AI-generated fields
            if (detail.type === 'subject' && 'difficulty_level' in aiEntry) {
              await supabase.from('subjects').update({
                difficulty_level: (aiEntry as any).difficulty_level,
                estimated_hours: (aiEntry as any).estimated_hours,
              }).eq('id', detail.id);
            }

            // Insert translations for each language
            for (const lang of activeLangs) {
              const trans = aiEntry.translations[lang.iso_code];
              if (!trans) continue;

              const tableName =
                detail.type === 'subject' ? 'subject_translations' :
                detail.type === 'chapter' ? 'chapter_translations' :
                detail.type === 'topic' ? 'topic_translations' :
                'sub_topic_translations';

              const fkField =
                detail.type === 'subject' ? 'subject_id' :
                detail.type === 'chapter' ? 'chapter_id' :
                detail.type === 'topic' ? 'topic_id' :
                'sub_topic_id';

              const translationRecord: any = {
                [fkField]: detail.id,
                language_id: lang.id,
                name: trans.name || detail.name,
                short_intro: trans.short_intro || '',
                long_intro: trans.long_intro || '',
                is_active: true,
                created_by: userId,
              };

              const { error: transErr } = await supabase.from(tableName).insert(translationRecord);
              if (transErr) {
                console.error(`Failed to insert ${tableName} for ${detail.name}/${lang.iso_code}:`, transErr.message);
              }
            }
          }
          aiGenerated = true;
        } catch (aiErr: any) {
          console.error('AI translation generation failed:', aiErr);
          report.errors.push(`AI translation generation failed: ${aiErr.message}. Records were created without translations.`);
        }
      }
    }

    logAdmin({
      actorId: userId,
      action: 'material_tree_imported',
      targetType: 'material',
      targetId: 0,
      targetName: `Imported ${report.created.subjects}S/${report.created.chapters}C/${report.created.topics}T/${report.created.sub_topics}ST (skipped ${report.skipped.subjects}S/${report.skipped.chapters}C/${report.skipped.topics}T/${report.skipped.sub_topics}ST)`,
      ip: getClientIp(req),
    });

    return ok(res, {
      parsed: summary,
      report,
      ai_translations_generated: aiGenerated,
      provider,
    }, 'Material tree imported successfully');
  } catch (error: any) {
    console.error('Import material tree error:', error);
    return err(res, error.message || 'Material tree import failed', 500);
  }
}

// ─── Translate HTML Page to All Languages ───

/**
 * POST /ai/translate-page
 * Takes an English HTML file + sub_topic_id, translates it to all other active languages,
 * uploads each translated file to CDN, and updates DB records.
 *
 * Body (multipart): file (HTML), sub_topic_id, provider (optional)
 * Returns per-language results with progress.
 */

/**
 * Reusable helper: Translate an HTML file to missing languages for a sub-topic.
 * Used by both the translatePage HTTP handler and importFromCdn Phase 3b.
 *
 * @param opts.subTopicId - The sub-topic DB ID
 * @param opts.htmlContent - The source HTML content to translate
 * @param opts.baseFileName - Base filename without extension or language suffix
 * @param opts.sourceLanguageIso - ISO code of the source language (e.g. 'hi', 'en')
 * @param opts.skipLanguageIsos - ISO codes of languages to skip (already have files)
 * @param opts.provider - AI provider to use ('gemini', 'anthropic', 'openai')
 * @param opts.userId - The acting user ID for audit
 * @param opts.materialBasePath - CDN folder path e.g. 'materials/C_Programming/01_Intro/01_Topic'
 * @param opts.subjectName - Subject name for translation context
 * @param opts.chapterName - Chapter name for translation context
 * @param opts.topicName - Topic name for translation context
 * @param opts.includeEnglish - Whether English should be a target language (default: false)
 */
async function translateHtmlToMissingLanguages(opts: {
  subTopicId: number;
  htmlContent: string;
  baseFileName: string;
  sourceLanguageIso: string;
  skipLanguageIsos: string[];
  provider: AIProvider;
  userId: string | number;
  materialBasePath: string;
  subjectName: string;
  chapterName: string;
  topicName: string;
  includeEnglish?: boolean;
}): Promise<{
  results: Array<{ language: string; iso_code: string; status: string; page_url?: string; error?: string }>;
  inputTokens: number;
  outputTokens: number;
}> {
  const {
    subTopicId, htmlContent, baseFileName, sourceLanguageIso,
    skipLanguageIsos, provider, userId, materialBasePath,
    subjectName, chapterName, topicName, includeEnglish = false,
  } = opts;

  // Get all active material languages
  const { data: allLangs } = await supabase
    .from('languages')
    .select('id, name, native_name, iso_code')
    .eq('is_active', true)
    .eq('for_material', true)
    .order('id');

  const skipSet = new Set(skipLanguageIsos.map(s => s.toLowerCase()));
  skipSet.add(sourceLanguageIso.toLowerCase());
  const targetLangs = (allLangs || []).filter(l => {
    if (skipSet.has(l.iso_code)) return false;
    if (!includeEnglish && l.iso_code === 'en') return false;
    return true;
  });

  if (targetLangs.length === 0) {
    return { results: [], inputTokens: 0, outputTokens: 0 };
  }

  // Find source language name for the translation prompt
  const sourceLang = (allLangs || []).find(l => l.iso_code === sourceLanguageIso);
  const sourceLangName = sourceLang?.name || 'English';

  const results: Array<{ language: string; iso_code: string; status: string; page_url?: string; error?: string }> = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Pre-fetch sub-topic slug once (needed if creating new translation records)
  let subTopicSlug: string | undefined;
  const { data: stSlugData } = await supabase.from('sub_topics').select('slug').eq('id', subTopicId).single();
  subTopicSlug = stSlugData?.slug;

  // Translate to ALL target languages in parallel (3× faster than sequential)
  const translationPromises = targetLangs.map(async (lang) => {
    try {
      const systemPrompt = `You are an expert translator. Translate the following HTML page from ${sourceLangName} to ${lang.name} (${lang.native_name}).

CRITICAL RULES:
1. Preserve ALL HTML tags, attributes, classes, IDs, styles, scripts EXACTLY as they are. Do NOT modify any HTML structure.
2. Only translate the visible text content between HTML tags.
3. Keep ALL technical terms, related programming and technical keywords, and code in English. 
4. Keep brand names and product names in English (Google, Microsoft, Apple, GitHub, Stack Overflow, VS Code, etc.)
5. Keep code snippets, code examples, and inline code EXACTLY in English - do not translate any code.
6. Do NOT translate content inside <code>, <pre>, <script>, <style> tags.
7. Do NOT add any explanation, comments, or wrapper - return ONLY the translated HTML.
8. The subject is "${subjectName}", chapter is "${chapterName}", topic is "${topicName}" - keep these and related technical terms in English where translation would sound unnatural or weird.
9. Use natural, easy-to-understand ${lang.name} for non-technical content. Mix English technical words naturally within ${lang.name} sentences.
10. Do NOT translate alt attributes of images if they contain technical terms.
11. STRICTLY IMPORTANT: When the source language is NOT English, ALL English words and phrases that already appear in the source text MUST be preserved EXACTLY as-is in the translation. Do NOT translate, transliterate, or replace any English word from the source into the target language. For example, if the Hindi source contains any english word — keep it in English in the ${lang.name} translation too. This rule applies to ALL English words found in the source, not just technical terms. And for subject name, chapter name, topic name and sub topic name, keep only those words in english which are strange, weird to translate into hindi or other regional languages.

Return ONLY the complete translated HTML document, nothing else.`;

      const estimatedTokens = Math.max(16384, Math.ceil(htmlContent.length / 2));
      const aiResult = await callAIRaw(provider, systemPrompt, htmlContent, estimatedTokens);

      // Clean up AI response — strip any markdown code fences
      let translatedHtml = aiResult.text.trim();
      if (translatedHtml.startsWith('```html')) {
        translatedHtml = translatedHtml.replace(/^```html\s*\n?/, '').replace(/\n?```\s*$/, '');
      } else if (translatedHtml.startsWith('```')) {
        translatedHtml = translatedHtml.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      if (!translatedHtml || translatedHtml.length < 50) {
        return { language: lang.name, iso_code: lang.iso_code, status: 'error' as const, error: 'AI returned empty or too short translation', inputTokens: aiResult.inputTokens, outputTokens: aiResult.outputTokens };
      }

      // Check if existing translation has a page file to delete
      const { data: existingTrans } = await supabase
        .from('sub_topic_translations')
        .select('id, page')
        .eq('sub_topic_id', subTopicId)
        .eq('language_id', lang.id)
        .is('deleted_at', null)
        .single();

      // Delete old file from CDN
      if (existingTrans?.page) {
        try {
          const oldPath = (existingTrans.page as string).replace(config.bunny.cdnUrl + '/', '').split('?')[0];
          await deleteImage(oldPath, existingTrans.page);
        } catch {}
      }

      // Upload translated HTML with language-suffixed filename
      const translatedFileName = `${baseFileName}_${lang.iso_code}.html`;
      const uploadPath = `${materialBasePath}/${lang.iso_code}/${translatedFileName}`;
      const pageUrl = await uploadRawFile(Buffer.from(translatedHtml, 'utf-8'), uploadPath);

      // Update or create DB record
      if (existingTrans) {
        const { error: updErr } = await supabase
          .from('sub_topic_translations')
          .update({ page: pageUrl, updated_by: userId })
          .eq('id', existingTrans.id);
        if (updErr) {
          return { language: lang.name, iso_code: lang.iso_code, status: 'error' as const, error: `DB update failed: ${updErr.message}`, inputTokens: aiResult.inputTokens, outputTokens: aiResult.outputTokens };
        }
      } else {
        const transName = subTopicSlug?.replace(/-/g, ' ') || `sub-topic-${subTopicId}`;
        const { error: insErr } = await supabase
          .from('sub_topic_translations')
          .insert({
            sub_topic_id: subTopicId,
            language_id: lang.id,
            name: transName,
            page: pageUrl,
            is_active: true,
            created_by: userId,
          });
        if (insErr) {
          return { language: lang.name, iso_code: lang.iso_code, status: 'error' as const, error: `DB insert failed: ${insErr.message}`, inputTokens: aiResult.inputTokens, outputTokens: aiResult.outputTokens };
        }
      }

      return { language: lang.name, iso_code: lang.iso_code, status: 'success' as const, page_url: pageUrl, inputTokens: aiResult.inputTokens, outputTokens: aiResult.outputTokens };
    } catch (langErr: any) {
      console.error(`Translation failed for ${lang.name}:`, langErr);
      return { language: lang.name, iso_code: lang.iso_code, status: 'error' as const, error: langErr.message || 'Translation failed', inputTokens: 0, outputTokens: 0 };
    }
  });

  // Wait for all parallel translations to complete
  const settled = await Promise.allSettled(translationPromises);
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      const r = outcome.value;
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
      results.push({ language: r.language, iso_code: r.iso_code, status: r.status, page_url: r.page_url, error: r.error });
    } else {
      // Should not happen since each promise has its own try/catch, but handle just in case
      results.push({ language: 'unknown', iso_code: 'unknown', status: 'error', error: outcome.reason?.message || 'Unexpected error' });
    }
  }

  return { results, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

export async function translatePage(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);

    const { sub_topic_id, provider: reqProvider } = req.body;
    if (!sub_topic_id) return err(res, 'sub_topic_id is required', 400);

    const file = (req as any).file;
    if (!file) return err(res, 'HTML file is required', 400);
    const origName = (file.originalname || '').toLowerCase();
    if (!origName.endsWith('.html') && !origName.endsWith('.htm')) return err(res, 'Only .html/.htm files are allowed', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const htmlContent = file.buffer.toString('utf-8');
    if (!htmlContent || htmlContent.length < 50) return err(res, 'HTML file has insufficient content', 400);

    // Get the base filename without extension for naming translated files.
    // Strip any trailing language suffix (e.g. _en, _hi, _gu) so translations
    // get clean names like "filename_gu.html" instead of "filename_en_gu.html".
    const baseFileName = file.originalname
      .replace(/\.(html|htm)$/i, '')
      .replace(/_(?:en|hi|gu|mr|ta|te|kn|ml|bn|pa|ur|or|as|ne|si|sd|ks|mai|doi|kok|bho|sa|mni)$/i, '');

    // Get sub-topic with full parent hierarchy for folder path (names + orders for sanitized CDN paths)
    const { data: subTopic } = await supabase
      .from('sub_topics')
      .select('id, slug, topic_id, topics(slug, name, display_order, chapter_id, chapters(slug, name, display_order, subject_id, subjects(slug, name)))')
      .eq('id', sub_topic_id)
      .single();
    if (!subTopic) return err(res, 'Sub-topic not found', 404);

    const parentTopic = (subTopic as any).topics;
    const parentChapter = parentTopic?.chapters;
    const parentSubject = parentChapter?.subjects;
    const subjectRef = parentSubject?.name || parentSubject?.slug;
    const chapterRef = parentChapter?.name || parentChapter?.slug;
    const topicRef = parentTopic?.name || parentTopic?.slug;
    const materialBasePath = (subjectRef && chapterRef && topicRef)
      ? `materials/${buildCourseFolderName(subjectRef)}/${buildCdnName(parentChapter.display_order ?? 0, chapterRef)}/${buildCdnName(parentTopic.display_order ?? 0, topicRef)}`
      : null;

    if (!materialBasePath) return err(res, 'Could not resolve CDN path for sub-topic', 400);

    const skipLanguages: string[] = [];
    if (req.body.skip_language) skipLanguages.push(req.body.skip_language);

    const subjectName = parentSubject?.slug?.replace(/-/g, ' ') || '';
    const chapterName = parentChapter?.slug?.replace(/-/g, ' ') || '';
    const topicName = parentTopic?.slug?.replace(/-/g, ' ') || '';

    // Delegate to reusable helper (translates from English to all other languages)
    const { results, inputTokens, outputTokens } = await translateHtmlToMissingLanguages({
      subTopicId: Number(sub_topic_id),
      htmlContent,
      baseFileName,
      sourceLanguageIso: 'en',
      skipLanguageIsos: skipLanguages,
      provider,
      userId,
      materialBasePath,
      subjectName,
      chapterName,
      topicName,
      includeEnglish: false,
    });

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    logAdmin({
      actorId: userId,
      action: 'page_translated',
      targetType: 'sub_topic_translation',
      targetId: Number(sub_topic_id),
      targetName: subTopic.slug,
      ip: getClientIp(req),
      metadata: { provider, languages: successCount, errors: errorCount, inputTokens, outputTokens },
    });

    return ok(res, {
      results,
      summary: { total: results.length, success: successCount, errors: errorCount },
      tokens: { input: inputTokens, output: outputTokens },
    }, `Translated to ${successCount}/${results.length} languages`);
  } catch (error: any) {
    console.error('Translate page error:', error);
    return err(res, error.message || 'Page translation failed', 500);
  }
}

// ─── Reverse Translate HTML Page to English ───

/**
 * POST /ai/reverse-translate-page
 * Takes an HTML file in any language and translates it to English.
 * Returns the English HTML as a string (not uploaded to CDN — caller decides what to do with it).
 *
 * Body (multipart): file (HTML), source_language (ISO code like 'gu', 'hi'), provider (optional)
 */
export async function reverseTranslatePage(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);

    const { source_language, provider: reqProvider } = req.body;
    if (!source_language) return err(res, 'source_language (ISO code) is required', 400);

    const file = (req as any).file;
    if (!file) return err(res, 'HTML file is required', 400);
    const origName = (file.originalname || '').toLowerCase();
    if (!origName.endsWith('.html') && !origName.endsWith('.htm')) return err(res, 'Only .html/.htm files are allowed', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const htmlContent = file.buffer.toString('utf-8');
    if (!htmlContent || htmlContent.length < 50) return err(res, 'HTML file has insufficient content', 400);

    // Look up the source language name
    const { data: sourceLang } = await supabase
      .from('languages')
      .select('id, name, native_name, iso_code')
      .eq('iso_code', source_language)
      .eq('is_active', true)
      .single();

    const sourceLangName = sourceLang?.name || source_language;
    const sourceLangNative = sourceLang?.native_name || source_language;

    const systemPrompt = `You are an expert translator. Translate the following HTML page from ${sourceLangName} (${sourceLangNative}) to English.

CRITICAL RULES:
1. Preserve ALL HTML tags, attributes, classes, IDs, styles, scripts EXACTLY as they are. Do NOT modify any HTML structure.
2. Only translate the visible text content between HTML tags.
3. Keep ALL technical terms, programming keywords, and code that are already in English — do NOT change them.
4. Keep brand names and product names in English.
5. Keep code snippets, code examples, and inline code EXACTLY as they are.
6. Do NOT translate content inside <code>, <pre>, <script>, <style> tags.
7. Do NOT add any explanation, comments, or wrapper — return ONLY the translated HTML.
8. Produce natural, clear, professional English. The translated text should read like it was originally written in English.
9. Do NOT translate alt attributes of images if they contain technical terms.

Return ONLY the complete translated HTML document in English, nothing else.`;

    const estimatedTokens = Math.max(16384, Math.ceil(htmlContent.length / 2));
    const aiResult = await callAIRaw(provider, systemPrompt, htmlContent, estimatedTokens);

    // Clean up AI response
    let translatedHtml = aiResult.text.trim();
    if (translatedHtml.startsWith('```html')) {
      translatedHtml = translatedHtml.replace(/^```html\s*\n?/, '').replace(/\n?```\s*$/, '');
    } else if (translatedHtml.startsWith('```')) {
      translatedHtml = translatedHtml.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    if (!translatedHtml || translatedHtml.length < 50) {
      return err(res, 'AI returned empty or too short translation', 500);
    }

    logAdmin({
      actorId: userId,
      action: 'page_reverse_translated',
      targetType: 'html_page',
      targetId: 0,
      targetName: file.originalname || 'unknown',
      ip: getClientIp(req),
      metadata: { provider, source_language, inputTokens: aiResult.inputTokens, outputTokens: aiResult.outputTokens },
    });

    return ok(res, {
      english_html: translatedHtml,
      original_filename: file.originalname,
      source_language,
      tokens: { input: aiResult.inputTokens, output: aiResult.outputTokens },
    }, 'Reverse translation to English completed');
  } catch (error: any) {
    console.error('Reverse translate page error:', error);
    return err(res, error.message || 'Reverse translation failed', 500);
  }
}

// ─── Scan CDN (Preview) ───
/**
 * Read-only scan of the Bunny CDN root. Downloads and parses each course's
 * .txt structure file and returns the full tree so the frontend can display
 * a checkbox picker before the actual import.
 */
export async function scanCdn(_req: Request, res: Response) {
  try {
    const rootItems = await listBunnyStorageRecursive('materials');
    const rootFolders = rootItems.filter(n => n.isDirectory);

    const courses: any[] = [];
    const errors: string[] = [];

    for (const courseFolder of rootFolders) {
      const children = courseFolder.children || [];
      const txtFileName = `${courseFolder.name}.txt`;
      const txtNode = children.find(n => !n.isDirectory && n.name === txtFileName);

      if (!txtNode) {
        errors.push(`"${courseFolder.name}" — no .txt file found (expected "${txtFileName}")`);
        continue;
      }

      let txtContent: string;
      try {
        txtContent = await downloadBunnyFile(txtNode.path);
      } catch (e: any) {
        errors.push(`Failed to download "${txtNode.path}": ${e.message}`);
        continue;
      }

      const parseResult = parseCourseStructure(txtContent);
      if (parseResult.errors.length > 0) {
        errors.push(...parseResult.errors.map(e => `[${courseFolder.name}] ${e}`));
      }
      if (!parseResult.course) {
        errors.push(`Failed to parse course structure from "${txtNode.path}"`);
        continue;
      }

      const c = parseResult.course;
      let totalTopics = 0;
      let totalSubTopics = 0;
      const chaptersOut: any[] = [];

      for (const ch of c.chapters) {
        const topicsOut: any[] = [];
        for (const tp of ch.topics) {
          totalTopics++;
          totalSubTopics += tp.subTopics.length;
          topicsOut.push({
            order: tp.order,
            name: tp.name,
            subTopics: tp.subTopics.map(st => ({ order: st.order, name: st.name })),
          });
        }
        chaptersOut.push({
          order: ch.order,
          name: ch.name,
          topics: topicsOut,
        });
      }

      courses.push({
        folderName: courseFolder.name,
        name: c.name,
        chapters: chaptersOut,
        totalChapters: c.chapters.length,
        totalTopics,
        totalSubTopics,
      });
    }

    return ok(res, { courses, errors }, 'CDN scan complete');
  } catch (e: any) {
    return err(res, e.message || 'CDN scan failed', 500);
  }
}

// ─── Import from CDN ───
/**
 * Scan the Bunny CDN `materials/` folder recursively and create missing
 * database records (subjects, chapters, topics, sub-topics, translations).
 * Optionally uses AI to generate SEO data (title, description, meta) for
 * each new record by downloading and analyzing the HTML files.
 *
 * Expected CDN structure:
 *   materials/{subject-slug}/{chapter-slug}/{topic-slug}/{lang-iso}/{file.html}
 *   materials/{subject-slug}/{chapter-slug}/{topic-slug}/resources/{file.*}
 */
export async function importFromCdn(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return err(res, 'Unauthorized', 401);

    const {
      provider = 'gemini',
      generate_seo = false,
      upload_videos = true,
      sync_mode = 'create_only',   // 'create_only' | 'sync' | 'dry_run'
      auto_delete = false,          // only applies in sync mode
      selected_courses,             // deprecated: string[] of folder names (kept for backward compat)
      selected_items,               // new: { course: string; chapters?: string[] }[]
    } = req.body;

    console.log('[importFromCdn] RAW selected_items:', JSON.stringify(selected_items, null, 2));

    const isDryRun = sync_mode === 'dry_run';
    const isSync = sync_mode === 'sync' || isDryRun;

    // ─── Fetch active languages ───
    const { data: languages } = await supabase
      .from('languages')
      .select('id, name, iso_code, is_active')
      .eq('is_active', true)
      .order('id');
    if (!languages?.length) return err(res, 'No active languages found', 400);

    const langByIso = new Map(languages.map(l => [l.iso_code, l]));

    // ─── Fetch existing DB records for lookup ───
    const [subjectsRes, chaptersRes, topicsRes, subTopicsRes] = await Promise.all([
      supabase.from('subjects').select('id, code, slug').is('deleted_at', null),
      supabase.from('chapters').select('id, slug, subject_id, sort_order, display_order').is('deleted_at', null),
      supabase.from('topics').select('id, slug, chapter_id, sort_order, display_order').is('deleted_at', null),
      supabase.from('sub_topics').select('id, slug, name, topic_id, display_order, video_id, video_source').is('deleted_at', null),
    ]);

    const existingSubjectsBySlug = new Map<string, any>((subjectsRes.data || []).map((s: any) => [s.slug, s]));
    const existingSubjectsByCode = new Map<string, any>((subjectsRes.data || []).map((s: any) => [(s.code || '').toLowerCase(), s]));
    const existingChapters = new Map<string, any>((chaptersRes.data || []).map((c: any) => [`${c.subject_id}:${c.slug}`, c]));
    const existingTopics = new Map<string, any>((topicsRes.data || []).map((t: any) => [`${t.chapter_id}:${t.slug}`, t]));
    const existingSubTopics = new Map<string, any>((subTopicsRes.data || []).map((st: any) => [`${st.topic_id}:${st.slug}`, st]));

    // Build lookup by parent ID for sync deletions
    const chaptersBySubject = new Map<number, any[]>();
    for (const c of chaptersRes.data || []) {
      const list = chaptersBySubject.get(c.subject_id) || [];
      list.push(c);
      chaptersBySubject.set(c.subject_id, list);
    }
    const topicsByChapter = new Map<number, any[]>();
    for (const t of topicsRes.data || []) {
      const list = topicsByChapter.get(t.chapter_id) || [];
      list.push(t);
      topicsByChapter.set(t.chapter_id, list);
    }
    const subTopicsByTopic = new Map<number, any[]>();
    for (const st of subTopicsRes.data || []) {
      const list = subTopicsByTopic.get(st.topic_id) || [];
      list.push(st);
      subTopicsByTopic.set(st.topic_id, list);
    }

    const report = {
      sync_mode,
      subjects: { found: 0, created: 0, existing: 0, updated: 0 },
      chapters: { found: 0, created: 0, existing: 0, updated: 0, deleted: 0, unchanged: 0 },
      topics: { found: 0, created: 0, existing: 0, updated: 0, deleted: 0, unchanged: 0 },
      sub_topics: { found: 0, created: 0, existing: 0, updated: 0, deleted: 0, unchanged: 0 },
      translations: { found: 0, created: 0, existing: 0, updated: 0, deactivated: 0 },
      file_translations: { generated: 0, errors: 0, skipped: 0 },
      ai_translations: { subjects: 0, chapters: 0, topics: 0, sub_topics: 0, total_generated: 0, errors: 0 },
      videos: { found: 0, matched: 0, uploaded: 0, replaced: 0, status_checked: 0, now_ready: 0, errors: 0 },
      errors: [] as string[],
    };

    // Track newly created entity IDs for AI translation generation (Phase 6)
    const newSubjectIds: number[] = [];
    const newChapterIds: number[] = [];
    const newTopicIds: number[] = [];
    const newSubTopicIds: number[] = [];

    // ─── Phase 1: Scan CDN root, find course folders + .txt files ───
    const rootItems = await listBunnyStorageRecursive('materials');

    let rootFolders = rootItems.filter(n => n.isDirectory);

    // Build selection map: courseFolderName → chapter selections (null = all chapters)
    // Each chapter selection: { name, topics?: Set<string> | null } (null topics = all topics)
    type ChapterSelection = { name: string; topics: Set<string> | null; subTopicSelections: Map<string, Set<string>> };
    const selectionMap = new Map<string, ChapterSelection[] | null>();

    // Sub-topic filter: topicName → Set<subTopicName> (absent key = all sub-topics)
    const globalSubTopicFilterMap = new Map<string, Set<string>>();

    if (Array.isArray(selected_items) && selected_items.length > 0) {
      // Granular selection: { course: "C_Programming", chapters?: [{ name: "ch1", topics?: [{ name: "tp1", subTopics?: ["st1"] }] }] }
      for (const item of selected_items) {
        if (item.chapters && item.chapters.length > 0) {
          const chapterSels: ChapterSelection[] = item.chapters.map((ch: any) => {
            // Support both old format (string) and new format ({ name, topics? })
            if (typeof ch === 'string') return { name: ch, topics: null, subTopicSelections: new Map() };
            if (!ch.topics || ch.topics.length === 0) return { name: ch.name, topics: null, subTopicSelections: new Map() };

            // Topics can be string[] (old) or { name, subTopics? }[] (new)
            const topicNames: string[] = ch.topics.map((tp: any) => typeof tp === 'string' ? tp : tp.name);
            const stSelections = new Map<string, Set<string>>();
            for (const tp of ch.topics) {
              if (typeof tp !== 'string' && tp.subTopics && tp.subTopics.length > 0) {
                stSelections.set(tp.name, new Set(tp.subTopics as string[]));
              }
            }
            return {
              name: ch.name,
              topics: new Set(topicNames),
              subTopicSelections: stSelections,
            };
          });
          selectionMap.set(item.course, chapterSels);
        } else {
          selectionMap.set(item.course, null); // null = all chapters
        }
      }
      // Debug: log parsed selection map
      for (const [course, chSels] of selectionMap) {
        if (chSels) {
          console.log(`[importFromCdn] selectionMap["${course}"] =`, chSels.map(cs => ({ name: cs.name, topics: cs.topics ? [...cs.topics] : 'ALL' })));
        } else {
          console.log(`[importFromCdn] selectionMap["${course}"] = ALL chapters`);
        }
      }
      rootFolders = rootFolders.filter(n => selectionMap.has(n.name));
    } else if (Array.isArray(selected_courses) && selected_courses.length > 0) {
      // Backward compat: old format = all chapters for selected courses
      const selectedSet = new Set(selected_courses.map((s: string) => s));
      rootFolders = rootFolders.filter(n => selectedSet.has(n.name));
    }

    for (const courseFolder of rootFolders) {
      const children = courseFolder.children || [];
      const txtFileName = `${courseFolder.name}.txt`;
      const txtNode = children.find(n => !n.isDirectory && n.name === txtFileName);

      if (!txtNode) {
        report.errors.push(`Course folder "${courseFolder.name}" has no matching .txt file (expected "${txtFileName}")`);
        continue;
      }

      let txtContent: string;
      try {
        txtContent = await downloadBunnyFile(txtNode.path);
      } catch (e: any) {
        report.errors.push(`Failed to download "${txtNode.path}": ${e.message}`);
        continue;
      }

      const parseResult = parseCourseStructure(txtContent);
      if (parseResult.errors.length > 0) {
        report.errors.push(...parseResult.errors.map(e => `[${courseFolder.name}] ${e}`));
      }
      if (!parseResult.course) {
        report.errors.push(`Failed to parse course structure from "${txtNode.path}"`);
        continue;
      }

      const parsedCourse = parseResult.course;
      report.subjects.found++;

      // ─── Phase 2: Create/find Subject ───
      const subjectSlug = nameToSlug(parsedCourse.name);
      const subjectCode = parsedCourse.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      let subject = existingSubjectsBySlug.get(subjectSlug)
        || existingSubjectsByCode.get(subjectCode.toLowerCase());

      if (!subject) {
        if (!isDryRun) {
          const newSlug = await generateUniqueSlug(supabase, 'subjects', subjectSlug);
          const { data: created, error: createErr } = await supabase
            .from('subjects')
            .insert({ code: subjectCode, slug: newSlug, name: parsedCourse.name, is_active: true, display_order: 1, sort_order: 1, created_by: userId })
            .select('id, code, slug')
            .single();

          if (createErr || !created) {
            report.errors.push(`Failed to create subject "${parsedCourse.name}": ${createErr?.message}`);
            continue;
          }
          subject = created;
          existingSubjectsBySlug.set(newSlug, created);
          existingSubjectsByCode.set(subjectCode.toLowerCase(), created);

          // Create English translation for subject
          const enLang = langByIso.get('en');
          if (enLang) {
            await supabase.from('subject_translations').upsert({
              subject_id: created.id,
              language_id: enLang.id,
              name: parsedCourse.name,
              is_active: true,
              created_by: userId,
            }, { onConflict: 'subject_id,language_id' });
          }
        }
        report.subjects.created++;
        if (subject.id > 0) newSubjectIds.push(subject.id);
      } else {
        report.subjects.existing++;
      }

      if (!subject && isDryRun) {
        // In dry run, create a placeholder for further processing
        subject = { id: -1, slug: subjectSlug, code: subjectCode };
      }

      const courseCdnChildren = children.filter(n => n.isDirectory && n.name.toLowerCase() !== 'assets');

      // ─── Create Bunny Stream collection hierarchy for this course ───
      let streamCollections = new Map<string, string>();
      if (upload_videos && !isDryRun) {
        try {
          streamCollections = await createCourseCollections(
            buildCourseFolderName(parsedCourse.name),
            parsedCourse.chapters.map(ch => ({
              name: buildCdnName(ch.order, ch.name),
              topics: ch.topics.map(tp => ({ name: buildCdnName(tp.order, tp.name) })),
            }))
          );
        } catch (collErr: any) {
          report.errors.push(`Failed to create Stream collections: ${collErr.message}`);
        }
      }

      // ─── Track which DB IDs are "seen" in the .txt (for sync deletions) ───
      const seenChapterIds = new Set<number>();
      const seenTopicIds = new Set<number>();
      const seenSubTopicIds = new Set<number>();

      // ─── Filter chapters based on granular selection ───
      const courseSelection = selectionMap.get(courseFolder.name); // null = all, array = specific chapters
      let chaptersToProcess = parsedCourse.chapters;
      // Map: chapterName → Set<topicName> | null (null = all topics for this chapter)
      const topicFilterMap = new Map<string, Set<string> | null>();
      // Map: topicName → Set<subTopicName> (absent = all sub-topics for this topic)
      const subTopicFilterMap = new Map<string, Set<string>>();

      if (courseSelection) {
        console.log(`Selection filter for "${courseFolder.name}":`, JSON.stringify(courseSelection.map(cs => ({ name: cs.name, topics: cs.topics ? [...cs.topics] : null, subTopicSelections: cs.subTopicSelections ? Object.fromEntries([...cs.subTopicSelections].map(([k, v]) => [k, [...v]])) : {} }))));
        console.log(`Parsed chapters:`, parsedCourse.chapters.map(ch => ch.name));
      }

      if (courseSelection) {
        // Frontend sends parsed names from scan (e.g. "Introduction to C Programming")
        // Match by: exact name, namesMatch (fuzzy), or slug comparison
        chaptersToProcess = parsedCourse.chapters.filter(ch => {
          const chSlug = nameToSlug(ch.name);
          for (const sel of courseSelection) {
            if (sel.name === ch.name || namesMatch(sel.name, ch.name) || nameToSlug(sel.name) === chSlug) {
              topicFilterMap.set(ch.name, sel.topics);
              // Populate sub-topic filter from this chapter's selections
              if (sel.subTopicSelections) {
                for (const [tpName, stSet] of sel.subTopicSelections) {
                  subTopicFilterMap.set(tpName, stSet);
                }
              }
              return true;
            }
          }
          // Also try matching against CDN folder names (backward compat)
          const chapterCdnName = courseCdnChildren.find(n => namesMatch(n.name, ch.name))?.name;
          if (chapterCdnName) {
            const chSel = courseSelection.find(cs => cs.name === chapterCdnName || namesMatch(cs.name, chapterCdnName));
            if (chSel) {
              topicFilterMap.set(ch.name, chSel.topics);
              if (chSel.subTopicSelections) {
                for (const [tpName, stSet] of chSel.subTopicSelections) {
                  subTopicFilterMap.set(tpName, stSet);
                }
              }
              return true;
            }
          }
          return false;
        });
      }

      // ─── Phase 2b: Create/Update Chapters, Topics, Sub-Topics from .txt ───
      for (const parsedChapter of chaptersToProcess) {
        report.chapters.found++;

        const chapterSlug = nameToSlug(parsedChapter.name);

        // Match: by slug (primary), then fuzzy ilike, then by position (rename detection)
        let chapter = existingChapters.get(`${subject.id}:${chapterSlug}`);
        let chapterMatchMethod = chapter ? 'exact-slug' : 'none';

        // Fuzzy match: try slug suffix and prefix matching in ALL modes (not just sync)
        // This prevents duplicates when existing chapters have suffixed slugs like intro-2
        if (!chapter && subject.id > 0) {
          const subjectChapters = chaptersBySubject.get(subject.id) || [];
          // Try exact slug match with -N suffix pattern
          const exactSuffix = subjectChapters.find(c => c.slug === chapterSlug || c.slug.match(new RegExp(`^${chapterSlug}-\\d+$`)));
          if (exactSuffix) { chapter = exactSuffix; chapterMatchMethod = 'suffix-pattern'; }
          // Try fuzzy slug prefix match — require at least 70% of the slug to match
          // (avoids false positives like "control-flow-loops" matching "control-flow-conditional-statements")
          if (!chapter) {
            const minLen = Math.max(15, Math.floor(chapterSlug.length * 0.7));
            const prefix = chapterSlug.slice(0, minLen);
            const fuzzy = subjectChapters.find(c => c.slug.startsWith(prefix) && Math.abs(c.slug.length - chapterSlug.length) <= 5);
            if (fuzzy) { chapter = fuzzy; chapterMatchMethod = 'fuzzy-prefix'; }
          }
          // Position-based match (rename detection) — sync mode only
          if (!chapter && isSync) {
            const byPos = subjectChapters.find(c => c.sort_order === parsedChapter.order);
            if (byPos) { chapter = byPos; chapterMatchMethod = 'position'; }
          }
        }
        if (chapter) {
          console.log(`[importFromCdn] Chapter "${parsedChapter.name}" (slug: ${chapterSlug}) matched existing DB chapter id=${chapter.id} slug="${chapter.slug}" via ${chapterMatchMethod}`);
        } else {
          console.log(`[importFromCdn] Chapter "${parsedChapter.name}" (slug: ${chapterSlug}) — no existing match, will create new`);
        }

        if (!chapter) {
          if (!isDryRun) {
            const newSlug = await generateUniqueSlug(supabase, 'chapters', chapterSlug, undefined, { column: 'subject_id', value: subject.id });
            const { data: created, error: createErr } = await supabase
              .from('chapters')
              .insert({
                slug: newSlug,
                name: parsedChapter.name,
                subject_id: subject.id,
                is_active: true,
                display_order: parsedChapter.order,
                sort_order: parsedChapter.order,
                created_by: userId,
              })
              .select('id, slug, subject_id, sort_order, display_order')
              .single();

            if (createErr || !created) {
              report.errors.push(`Failed to create chapter "${parsedChapter.name}": ${createErr?.message}`);
              continue;
            }
            chapter = created;
            existingChapters.set(`${subject.id}:${newSlug}`, created);
            const list = chaptersBySubject.get(subject.id) || [];
            list.push(created);
            chaptersBySubject.set(subject.id, list);

            // Create English translation for chapter
            const enLang = langByIso.get('en');
            if (enLang) {
              await supabase.from('chapter_translations').upsert({
                chapter_id: created.id,
                language_id: enLang.id,
                name: parsedChapter.name,
                is_active: true,
                created_by: userId,
              }, { onConflict: 'chapter_id,language_id' });
            }
          }
          report.chapters.created++;
          if (chapter.id > 0) newChapterIds.push(chapter.id);
        } else {
          // Sync mode: update sort_order if changed
          if (isSync && (chapter.sort_order !== parsedChapter.order || chapter.display_order !== parsedChapter.order)) {
            if (!isDryRun) {
              await supabase.from('chapters').update({
                sort_order: parsedChapter.order,
                display_order: parsedChapter.order,
              }).eq('id', chapter.id);
            }
            report.chapters.updated++;
          } else {
            report.chapters.unchanged++;
          }
          report.chapters.existing++;
        }

        if (!chapter && isDryRun) {
          chapter = { id: -1, slug: chapterSlug, subject_id: subject.id, sort_order: parsedChapter.order };
        }

        if (chapter.id > 0) seenChapterIds.add(chapter.id);

        // Match chapter to CDN folder
        const chapterCdnFolder = courseCdnChildren.find(n => namesMatch(n.name, parsedChapter.name));
        const chapterCdnChildren_items = chapterCdnFolder?.children?.filter(
          n => n.isDirectory && n.name.toLowerCase() !== 'assets'
        ) || [];

        // ─── Filter topics based on granular selection ───
        const selectedTopicSet = topicFilterMap.get(parsedChapter.name); // undefined/null = all, Set = specific
        let topicsToProcess = parsedChapter.topics;
        if (selectedTopicSet) {
          topicsToProcess = parsedChapter.topics.filter(tp => {
            // Frontend sends parsed names from scan (e.g. "Getting Started with C")
            // Check exact match first, then fuzzy
            if (selectedTopicSet.has(tp.name)) return true;
            for (const sel of selectedTopicSet) {
              if (namesMatch(sel, tp.name) || nameToSlug(sel) === nameToSlug(tp.name)) return true;
            }
            // Also try matching against CDN folder names (backward compat)
            const topicCdnName = chapterCdnChildren_items.find(n => namesMatch(n.name, tp.name))?.name;
            if (topicCdnName && selectedTopicSet.has(topicCdnName)) return true;
            return false;
          });
        }

        console.log(`Chapter "${parsedChapter.name}": ${parsedChapter.topics.length} total topics, ${topicsToProcess.length} after filter. TopicFilter:`, topicFilterMap.get(parsedChapter.name) ? [...topicFilterMap.get(parsedChapter.name)!] : 'null (all)');

        for (const parsedTopic of topicsToProcess) {
          report.topics.found++;

          const topicSlug = nameToSlug(parsedTopic.name);

          let topic = existingTopics.get(`${chapter.id}:${topicSlug}`);

          // Fuzzy match: try slug prefix and position-based matching in ALL modes (not just sync)
          // This prevents duplicates when existing topics have suffixed slugs like data-types-2
          if (!topic && chapter.id > 0) {
            const chapterTopics = topicsByChapter.get(chapter.id) || [];
            // Try exact slug match first (handles -2, -3 suffixed slugs)
            const exactSuffix = chapterTopics.find(t => t.slug === topicSlug || t.slug.match(new RegExp(`^${topicSlug}-\\d+$`)));
            if (exactSuffix) topic = exactSuffix;
            // Then try fuzzy slug prefix match — require at least 70% of the slug to match
            // (avoids false positives for topics with similar name prefixes)
            if (!topic) {
              const minLen = Math.max(15, Math.floor(topicSlug.length * 0.7));
              const prefix = topicSlug.slice(0, minLen);
              const fuzzy = chapterTopics.find(t => t.slug.startsWith(prefix) && Math.abs(t.slug.length - topicSlug.length) <= 5);
              if (fuzzy) topic = fuzzy;
            }
            // Position-based match (rename detection) — sync mode only
            if (!topic && isSync) {
              const byPos = chapterTopics.find(t => t.sort_order === parsedTopic.order);
              if (byPos) topic = byPos;
            }
          }

          if (!topic) {
            if (!isDryRun) {
              const newSlug = await generateUniqueSlug(supabase, 'topics', topicSlug, undefined, { column: 'chapter_id', value: chapter.id });
              const { data: created, error: createErr } = await supabase
                .from('topics')
                .insert({
                  slug: newSlug,
                  name: parsedTopic.name,
                  chapter_id: chapter.id,
                  is_active: true,
                  display_order: parsedTopic.order,
                  sort_order: parsedTopic.order,
                  created_by: userId,
                })
                .select('id, slug, chapter_id, sort_order, display_order')
                .single();

              if (createErr || !created) {
                report.errors.push(`Failed to create topic "${parsedTopic.name}": ${createErr?.message}`);
                continue;
              }
              topic = created;
              existingTopics.set(`${chapter.id}:${newSlug}`, created);
              const list = topicsByChapter.get(chapter.id) || [];
              list.push(created);
              topicsByChapter.set(chapter.id, list);

              // Create English translation for topic
              const enLang = langByIso.get('en');
              if (enLang) {
                await supabase.from('topic_translations').upsert({
                  topic_id: created.id,
                  language_id: enLang.id,
                  name: parsedTopic.name,
                  is_active: true,
                  created_by: userId,
                }, { onConflict: 'topic_id,language_id' });
              }
            }
            report.topics.created++;
            if (topic.id > 0) newTopicIds.push(topic.id);
          } else {
            if (isSync && (topic.sort_order !== parsedTopic.order || topic.display_order !== parsedTopic.order)) {
              if (!isDryRun) {
                await supabase.from('topics').update({
                  sort_order: parsedTopic.order,
                  display_order: parsedTopic.order,
                }).eq('id', topic.id);
              }
              report.topics.updated++;
            } else {
              report.topics.unchanged++;
            }
            report.topics.existing++;
          }

          if (!topic && isDryRun) {
            topic = { id: -1, slug: topicSlug, chapter_id: chapter.id, sort_order: parsedTopic.order };
          }

          if (topic.id > 0) seenTopicIds.add(topic.id);

          // Create/update sub-topics from parsed data
          const subTopicDbMap = new Map<string, { id: number; slug: string; display_order: number }>();

          // ─── Filter sub-topics based on granular selection ───
          const selectedSTSet = subTopicFilterMap.get(parsedTopic.name); // undefined = all, Set = specific
          let subTopicsToProcess = parsedTopic.subTopics;
          if (selectedSTSet) {
            subTopicsToProcess = parsedTopic.subTopics.filter(st => {
              if (selectedSTSet.has(st.name)) return true;
              for (const sel of selectedSTSet) {
                if (namesMatch(sel, st.name) || nameToSlug(sel) === nameToSlug(st.name)) return true;
              }
              return false;
            });
          }

          console.log(`Topic "${parsedTopic.name}": ${parsedTopic.subTopics.length} total sub-topics, ${subTopicsToProcess.length} after filter. STFilter:`, selectedSTSet ? [...selectedSTSet] : 'undefined (all)');

          for (const parsedST of subTopicsToProcess) {
            const stSlug = nameToSlug(parsedST.name);

            let subTopic = existingSubTopics.get(`${topic.id}:${stSlug}`);

            if (!subTopic && topic.id > 0) {
              // Fuzzy match: try exact slug with -N suffix first, then ilike prefix with length check
              const { data: fuzzyMatch } = await supabase
                .from('sub_topics')
                .select('id, slug, display_order, video_id, video_source')
                .eq('topic_id', topic.id)
                .is('deleted_at', null)
                .ilike('slug', `${stSlug}%`)
                .limit(5);

              if (fuzzyMatch?.length) {
                // Prefer exact match or -N suffix match; fall back to closest length match
                const exact = fuzzyMatch.find(m => m.slug === stSlug || m.slug.match(new RegExp(`^${stSlug}-\\d+$`)));
                const best = exact || fuzzyMatch.find(m => Math.abs(m.slug.length - stSlug.length) <= 5);
                if (best) {
                  subTopic = best;
                  existingSubTopics.set(`${topic.id}:${subTopic.slug}`, subTopic);
                }
              }
            }

            // Position-based match for sync (rename detection)
            if (!subTopic && isSync && topic.id > 0) {
              const topicSTs = subTopicsByTopic.get(topic.id) || [];
              const byPos = topicSTs.find(st => st.display_order === parsedST.order);
              if (byPos) {
                subTopic = byPos;
                existingSubTopics.set(`${topic.id}:${byPos.slug}`, byPos);
              }
            }

            if (!subTopic) {
              report.sub_topics.found++;
              if (!isDryRun) {
                const newSlug = await generateUniqueSlug(supabase, 'sub_topics', stSlug, undefined, { column: 'topic_id', value: topic.id });
                const { data: created, error: stErr } = await supabase
                  .from('sub_topics')
                  .insert({
                    slug: newSlug,
                    name: parsedST.name,
                    topic_id: topic.id,
                    display_order: parsedST.order,
                    difficulty_level: 'all_levels',
                    estimated_minutes: 30,
                    is_active: true,
                    created_by: userId,
                  })
                  .select('id, slug, display_order')
                  .single();

                if (stErr || !created) {
                  report.errors.push(`Failed to create sub-topic "${parsedST.name}": ${stErr?.message}`);
                  continue;
                }
                subTopic = created;
                existingSubTopics.set(`${topic.id}:${newSlug}`, created);
                const list = subTopicsByTopic.get(topic.id) || [];
                list.push(created);
                subTopicsByTopic.set(topic.id, list);

                // Create English translation for sub-topic
                const enLang = langByIso.get('en');
                if (enLang) {
                  await supabase.from('sub_topic_translations').upsert({
                    sub_topic_id: created.id,
                    language_id: enLang.id,
                    name: parsedST.name,
                    is_active: true,
                    created_by: userId,
                  }, { onConflict: 'sub_topic_id,language_id' });
                }
              }
              report.sub_topics.created++;
              if (subTopic.id > 0) newSubTopicIds.push(subTopic.id);
            } else {
              // Sync mode: update sort_order if changed
              if (isSync && subTopic.display_order !== parsedST.order) {
                if (!isDryRun) {
                  await supabase.from('sub_topics').update({
                    display_order: parsedST.order,
                  }).eq('id', subTopic.id);
                }
                report.sub_topics.updated++;
              } else {
                report.sub_topics.unchanged++;
              }
              report.sub_topics.existing++;
            }

            if (!subTopic && isDryRun) {
              subTopic = { id: -1, slug: stSlug, display_order: parsedST.order };
            }

            if (subTopic.id > 0) seenSubTopicIds.add(subTopic.id);

            const stRecord = { id: subTopic.id, slug: subTopic.slug, display_order: parsedST.order };
            subTopicDbMap.set(parsedST.name.toLowerCase(), stRecord);
            // Also key by normalizeTxtName so CDN names with special chars can match
            subTopicDbMap.set(normalizeTxtName(parsedST.name), stRecord);
            // Also key by DB slug (hyphens→spaces) so manually-named CDN files can match
            if (subTopic.slug) {
              subTopicDbMap.set(subTopic.slug.replace(/-/g, ' '), stRecord);
            }
          }

          // Build a reverse lookup from DB sub-topics for this topic (slug-based matching)
          // This catches CDN files that don't match any .txt name but DO match a DB sub-topic
          const dbSubTopicsBySlug = new Map<number, { id: number; slug: string; name?: string }>();
          if (topic.id > 0) {
            const topicSTs = subTopicsByTopic.get(topic.id) || [];
            for (const dbST of topicSTs) {
              dbSubTopicsBySlug.set(dbST.id, dbST);
            }
          }

          // Build a set of ALL known sub-topic names for this topic (including unselected ones)
          // Used in Phase 3 to silently skip CDN files belonging to unselected sub-topics
          // instead of reporting them as errors
          const allKnownSubTopicNames = new Set<string>();
          if (topic.id > 0) {
            const topicSTs = subTopicsByTopic.get(topic.id) || [];
            for (const dbST of topicSTs) {
              allKnownSubTopicNames.add(dbST.slug.replace(/-/g, ' ').toLowerCase());
              allKnownSubTopicNames.add(dbST.slug.replace(/-/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase());
              if (dbST.name) {
                allKnownSubTopicNames.add(dbST.name.toLowerCase());
                allKnownSubTopicNames.add(dbST.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
                // Also add normalizeTxtName form for names with special chars (C++, ::, etc.)
                allKnownSubTopicNames.add(normalizeTxtName(dbST.name));
                allKnownSubTopicNames.add(normalizeTxtName(dbST.name).replace(/[^a-z0-9]/g, ''));
              }
            }
          }
          // Also add all sub-topics from the .txt file (including unselected ones)
          for (const allST of parsedTopic.subTopics) {
            allKnownSubTopicNames.add(allST.name.toLowerCase());
            allKnownSubTopicNames.add(allST.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
            allKnownSubTopicNames.add(normalizeTxtName(allST.name));
            allKnownSubTopicNames.add(normalizeTxtName(allST.name).replace(/[^a-z0-9]/g, ''));
          }

          // ─── Phase 3: Scan CDN topic folder for language files ───
          const topicCdnFolder = chapterCdnChildren_items.find(n => namesMatch(n.name, parsedTopic.name));

          if (topicCdnFolder) {
            const topicChildren = topicCdnFolder.children || [];
            // Track which translation keys are "seen" on CDN
            const seenTransKeys = new Set<string>();
            // Track existing CDN file paths per sub-topic for Phase 3b auto-translation
            // Map: subTopicId -> { langIso, cdnPath, baseFileName }[]
            const existingFilesBySubTopic = new Map<number, { langIso: string; cdnPath: string; baseFileName: string }[]>();

            for (const childNode of topicChildren) {
              if (!childNode.isDirectory) continue;
              const folderName = childNode.name.toLowerCase();

              if (folderName === 'assets' || folderName === 'videos') continue;

              const lang = langByIso.get(folderName);
              if (!lang) continue;

              const langFiles = (childNode.children || []).filter(
                f => !f.isDirectory && (f.name.endsWith('.html') || f.name.endsWith('.htm'))
              );

              for (const fileNode of langFiles) {
                report.translations.found++;

                let fileBaseName = fileNode.name.replace(/\.(html|htm)$/i, '');
                // Strip trailing language suffix (e.g. _en, _hi, _gu) since files are already in language folders
                // This handles both file-upload naming (01_topic_name_en.html) and plain naming (topic_name.html)
                fileBaseName = fileBaseName.replace(new RegExp(`_${folderName}$`, 'i'), '');
                const normalized = normalizeCdnName(fileBaseName);

                let matchedST: { id: number; slug: string } | undefined;

                // Attempt 1: Direct lookup by normalizeCdnName
                matchedST = subTopicDbMap.get(normalized);

                // Attempt 2: Alphanumeric-only fuzzy match against all map keys
                if (!matchedST) {
                  const normalizedAlpha = normalized.replace(/[^a-z0-9]/g, '');
                  for (const [txtName, stRecord] of subTopicDbMap) {
                    if (normalizedAlpha === txtName.replace(/[^a-z0-9]/g, '')) {
                      matchedST = stRecord;
                      break;
                    }
                  }
                }

                // Attempt 3: Direct DB sub-topic slug match (handles manually-uploaded CDN files
                // whose names differ from .txt names, e.g. "devcpp" vs "Dev-C++")
                if (!matchedST && topic.id > 0) {
                  const normalizedAlpha = normalized.replace(/[^a-z0-9]/g, '');
                  const topicSTs = subTopicsByTopic.get(topic.id) || [];
                  for (const dbST of topicSTs) {
                    // Try slug with hyphens→spaces then alphanumeric compare
                    const slugNorm = dbST.slug.replace(/-/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
                    if (normalizedAlpha === slugNorm) {
                      // Only match if this sub-topic is in our selected set
                      const inMap = Array.from(subTopicDbMap.values()).find(v => v.id === dbST.id);
                      if (inMap) { matchedST = inMap; break; }
                    }
                    // Also try matching CDN name words as substring of slug or vice versa
                    // e.g. CDN "choosing an ide vs code codeblocks devcpp" contains most words from
                    // slug "choosing-setting-up-c-programming-ides"
                    if (dbST.name) {
                      const dbNameNorm = normalizeCdnName(dbST.name.replace(/-/g, '_').replace(/\s+/g, '_'));
                      if (dbNameNorm === normalized) {
                        const inMap = Array.from(subTopicDbMap.values()).find(v => v.id === dbST.id);
                        if (inMap) { matchedST = inMap; break; }
                      }
                    }
                  }
                }

                // Attempt 4: Word-overlap heuristic — if >70% of CDN words appear in a DB sub-topic name
                if (!matchedST && topic.id > 0) {
                  const cdnWords = normalized.split(/\s+/).filter(w => w.length > 1);
                  if (cdnWords.length >= 3) {
                    let bestMatch: { id: number; slug: string } | undefined;
                    let bestOverlap = 0;
                    const topicSTs = subTopicsByTopic.get(topic.id) || [];
                    for (const dbST of topicSTs) {
                      if (!dbST.name) continue;
                      const inMap = Array.from(subTopicDbMap.values()).find(v => v.id === dbST.id);
                      if (!inMap) continue;
                      const dbWords = new Set(normalizeTxtName(dbST.name).split(/\s+/).filter(w => w.length > 1));
                      const overlap = cdnWords.filter(w => dbWords.has(w)).length;
                      const ratio = overlap / cdnWords.length;
                      if (ratio > 0.7 && overlap > bestOverlap) {
                        bestOverlap = overlap;
                        bestMatch = inMap;
                      }
                    }
                    if (bestMatch) matchedST = bestMatch;
                  }
                }

                if (!matchedST) {
                  // Check if this file belongs to a known sub-topic that wasn't selected
                  // If so, skip silently instead of reporting an error
                  const isKnownUnselected = allKnownSubTopicNames.has(normalized)
                    || allKnownSubTopicNames.has(normalized.replace(/[^a-z0-9]/g, ''));
                  if (!isKnownUnselected) {
                    report.errors.push(`No matching sub-topic for file "${fileNode.name}" in ${topicCdnFolder.name}/${folderName}/`);
                  }
                  continue;
                }

                seenTransKeys.add(`${matchedST.id}:${lang.id}`);

                // Track file for Phase 3b auto-translation
                if (!existingFilesBySubTopic.has(matchedST.id)) existingFilesBySubTopic.set(matchedST.id, []);
                existingFilesBySubTopic.get(matchedST.id)!.push({
                  langIso: folderName,
                  cdnPath: fileNode.path,
                  baseFileName: fileBaseName,
                });

                const cdnUrl = `${config.bunny.cdnUrl}/${fileNode.path}`;
                if (isDryRun) {
                  report.translations.created++;
                  continue;
                }

                const { data: existingTrans } = await supabase
                  .from('sub_topic_translations')
                  .select('id, page')
                  .eq('sub_topic_id', matchedST.id)
                  .eq('language_id', lang.id)
                  .is('deleted_at', null)
                  .limit(1);

                if (existingTrans?.length) {
                  if (existingTrans[0].page !== cdnUrl) {
                    await supabase
                      .from('sub_topic_translations')
                      .update({ page: cdnUrl })
                      .eq('id', existingTrans[0].id);
                    report.translations.updated++;
                  } else {
                    report.translations.existing++;
                  }
                } else {
                  const transName = [...subTopicDbMap.entries()].find(
                    ([, v]) => v.id === matchedST!.id
                  )?.[0] || matchedST.slug.replace(/-/g, ' ');

                  const { error: transErr } = await supabase
                    .from('sub_topic_translations')
                    .insert({
                      sub_topic_id: matchedST.id,
                      language_id: lang.id,
                      name: transName,
                      page: cdnUrl,
                      is_active: true,
                      created_by: userId,
                    });

                  if (transErr) {
                    report.errors.push(`Failed to create translation for "${fileNode.name}" in ${folderName}: ${transErr.message}`);
                  } else {
                    report.translations.created++;
                  }
                }
              }
            }

            // ─── Sync: Deactivate translations that are no longer on CDN ───
            if (isSync && !isDryRun) {
              for (const [, stRec] of subTopicDbMap) {
                if (stRec.id <= 0) continue;
                const { data: allTrans } = await supabase
                  .from('sub_topic_translations')
                  .select('id, language_id')
                  .eq('sub_topic_id', stRec.id)
                  .eq('is_active', true)
                  .is('deleted_at', null);

                for (const t of allTrans || []) {
                  if (!seenTransKeys.has(`${stRec.id}:${t.language_id}`)) {
                    if (auto_delete) {
                      await supabase.from('sub_topic_translations')
                        .update({ is_active: false })
                        .eq('id', t.id);
                    }
                    report.translations.deactivated++;
                  }
                }
              }
            }

            // ─── Phase 3b: Auto-translate missing language files via AI ───
            // For each sub-topic that has files in SOME languages but not ALL,
            // download one existing file, translate to the missing languages, upload to CDN
            if (!isDryRun && existingFilesBySubTopic.size > 0) {
              const allLangIsos = [...langByIso.keys()]; // all active material language ISOs
              const materialBasePath = `materials/${buildCourseFolderName(parsedCourse.name)}/${buildCdnName(parsedChapter.order, parsedChapter.name)}/${buildCdnName(parsedTopic.order, parsedTopic.name)}`;

              for (const [stId, files] of existingFilesBySubTopic) {
                if (stId <= 0) continue;

                // Determine which languages already have files
                const existingIsos = new Set(files.map(f => f.langIso.toLowerCase()));

                // Find missing languages
                const missingIsos = allLangIsos.filter(iso => !existingIsos.has(iso));
                if (missingIsos.length === 0) {
                  report.file_translations.skipped++;
                  continue; // All languages covered
                }

                // Pick the source file: prefer English, else first available
                const sourceFile = files.find(f => f.langIso === 'en') || files[0];
                if (!sourceFile) continue;

                try {
                  // Download the source HTML from CDN
                  const htmlContent = await downloadBunnyFile(sourceFile.cdnPath);
                  if (!htmlContent || htmlContent.length < 50) {
                    report.errors.push(`Phase 3b: Source file too small for sub-topic ${stId} (${sourceFile.cdnPath})`);
                    report.file_translations.errors++;
                    continue;
                  }

                  console.log(`Phase 3b: Translating "${sourceFile.baseFileName}" from ${sourceFile.langIso} to ${missingIsos.length} missing languages for sub-topic ${stId}`);

                  const { results: transResults } = await translateHtmlToMissingLanguages({
                    subTopicId: stId,
                    htmlContent,
                    baseFileName: sourceFile.baseFileName,
                    sourceLanguageIso: sourceFile.langIso,
                    skipLanguageIsos: [...existingIsos], // skip languages that already have files
                    provider: 'gemini' as AIProvider,
                    userId,
                    materialBasePath,
                    subjectName: parsedCourse.name,
                    chapterName: parsedChapter.name,
                    topicName: parsedTopic.name,
                    includeEnglish: !existingIsos.has('en'), // include English if it's missing
                  });

                  const successCount = transResults.filter(r => r.status === 'success').length;
                  const errorCount = transResults.filter(r => r.status === 'error').length;
                  report.file_translations.generated += successCount;
                  report.file_translations.errors += errorCount;

                  if (successCount > 0) {
                    console.log(`Phase 3b: Generated ${successCount} file translations for sub-topic ${stId}`);
                  }
                } catch (transErr: any) {
                  report.errors.push(`Phase 3b: Failed to translate files for sub-topic ${stId}: ${transErr.message}`);
                  report.file_translations.errors++;
                }
              }
            }

            // ─── Phase 4: Scan videos/ folder and fetch into Bunny Stream ───
            if (upload_videos) {
              const videosFolder = topicChildren.find(
                n => n.isDirectory && n.name.toLowerCase() === 'videos'
              );

              if (videosFolder) {
                const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
                const videoFiles = (videosFolder.children || []).filter(
                  f => !f.isDirectory && videoExts.some(ext => f.name.toLowerCase().endsWith(ext))
                );

                const topicCollName = buildCollectionName(
                  buildCourseFolderName(parsedCourse.name),
                  buildCdnName(parsedChapter.order, parsedChapter.name),
                  buildCdnName(parsedTopic.order, parsedTopic.name)
                );
                const topicCollId = streamCollections.get(topicCollName);

                for (const videoNode of videoFiles) {
                  report.videos.found++;

                  const videoBaseName = videoNode.name.replace(/\.\w+$/i, '');
                  const normalizedVideo = normalizeCdnName(videoBaseName);

                  let matchedST: { id: number; slug: string; display_order: number } | undefined;
                  matchedST = subTopicDbMap.get(normalizedVideo);

                  if (!matchedST) {
                    for (const [txtName, stRecord] of subTopicDbMap) {
                      if (normalizedVideo.replace(/[^a-z0-9]/g, '') === txtName.replace(/[^a-z0-9]/g, '')) {
                        matchedST = stRecord;
                        break;
                      }
                    }
                  }

                  if (!matchedST) {
                    report.errors.push(`No matching sub-topic for video "${videoNode.name}" in ${videosFolder.path}`);
                    continue;
                  }

                  report.videos.matched++;

                  if (isDryRun) {
                    report.videos.uploaded++;
                    continue;
                  }

                  // Check if sub-topic already has a video
                  const { data: existingST } = await supabase
                    .from('sub_topics')
                    .select('video_id, video_source')
                    .eq('id', matchedST.id)
                    .single();

                  if (existingST?.video_id && existingST?.video_source === 'bunny') {
                    // In sync mode, allow re-upload (replacement)
                    if (!isSync) continue;
                    // Skip if not explicitly replacing
                    report.videos.matched--;
                    continue;
                  }

                  // Fetch video into Bunny Stream directly from CDN storage URL
                  try {
                    const storageUrl = buildStorageUrl(videoNode.path);
                    const videoTitle = buildCdnName(matchedST.display_order, parsedTopic.name);
                    await fetchVideoFromUrl(storageUrl, videoTitle, topicCollId);

                    await supabase
                      .from('sub_topics')
                      .update({
                        video_source: 'bunny_pending',
                      })
                      .eq('id', matchedST.id);

                    report.videos.uploaded++;
                  } catch (videoErr: any) {
                    report.videos.errors++;
                    report.errors.push(`Failed to fetch video "${videoNode.name}": ${videoErr.message}`);
                  }
                }
              }
            }
          }

          // ─── Phase 4b: Detect existing Bunny Stream videos and link to sub-topics ───
          // This handles videos already in Stream (e.g. retained after delete, or manually uploaded)
          if (upload_videos && !isDryRun && subTopicDbMap.size > 0) {
            const topicCollName = buildCollectionName(
              buildCourseFolderName(parsedCourse.name),
              buildCdnName(parsedChapter.order, parsedChapter.name),
              buildCdnName(parsedTopic.order, parsedTopic.name)
            );

            // Try to find the collection — use the map built earlier, or search for it
            let topicCollId = streamCollections.get(topicCollName);
            if (!topicCollId) {
              try {
                // Search for existing collection without creating one
                const { items: colls } = await listStreamCollections(topicCollName, 1, 10);
                const exactMatch = colls.find((c: any) => c.name === topicCollName);
                if (exactMatch) topicCollId = exactMatch.guid;
              } catch {}
            }

            if (topicCollId) {
              try {
                const { items: streamVideos } = await listStreamVideos({ collectionId: topicCollId });

                for (const video of streamVideos) {
                  if (!video.guid || !video.title) continue;
                  // Only consider fully encoded videos (status 4 = finished)
                  // Also accept status 3 (processing) and 1 (queued) so pending videos get linked
                  if (video.status === 5 || video.status === 6) continue; // failed/error statuses

                  const videoNormalized = normalizeCdnName(video.title);

                  let matchedST: { id: number; slug: string; display_order: number } | undefined;
                  matchedST = subTopicDbMap.get(videoNormalized);

                  if (!matchedST) {
                    for (const [txtName, stRecord] of subTopicDbMap) {
                      if (videoNormalized.replace(/[^a-z0-9]/g, '') === txtName.replace(/[^a-z0-9]/g, '')) {
                        matchedST = stRecord;
                        break;
                      }
                    }
                  }

                  if (!matchedST || matchedST.id <= 0) continue;

                  // Check if sub-topic already has a video linked
                  const { data: currentST } = await supabase
                    .from('sub_topics')
                    .select('video_id, video_source')
                    .eq('id', matchedST.id)
                    .single();

                  if (currentST?.video_id) continue; // Already has a video, skip

                  // Determine video_source based on encoding status
                  const videoSource = (video.status === 4) ? 'bunny' : 'bunny_pending';

                  // Build embed + thumbnail URLs (same format as uploadVideoToStream)
                  const libId = config.bunny.streamLibraryId;
                  const embedUrl = `https://iframe.mediadelivery.net/embed/${libId}/${video.guid}`;
                  const thumbnailUrl = config.bunny.streamCdn
                    ? `${config.bunny.streamCdn}/${video.guid}/thumbnail.jpg`
                    : `https://vz-cdn.b-cdn.net/${video.guid}/thumbnail.jpg`;

                  // Link the Stream video to the sub-topic
                  const { error: linkErr } = await supabase
                    .from('sub_topics')
                    .update({
                      video_id: video.guid,
                      video_url: embedUrl,
                      video_thumbnail_url: thumbnailUrl,
                      video_status: (video.status === 4) ? 'ready' : 'processing',
                      video_source: videoSource,
                    })
                    .eq('id', matchedST.id);

                  if (!linkErr) {
                    report.videos.found++;
                    report.videos.matched++;
                    console.log(`[Phase 4b] Linked Stream video "${video.title}" (${video.guid}) → sub-topic ${matchedST.id} (${matchedST.slug})`);
                  } else {
                    report.videos.errors++;
                    report.errors.push(`Failed to link Stream video "${video.title}" to sub-topic ${matchedST.slug}: ${linkErr.message}`);
                  }
                }
              } catch (streamErr: any) {
                report.errors.push(`Failed to scan Stream collection "${topicCollName}": ${streamErr.message}`);
              }
            }
          }

          // ─── Phase 4c: Restore archived YouTube URLs ───
          // Check the youtube_url_archive table for URLs that were saved before a previous
          // permanent delete, and re-link them to the matching newly-created sub-topics.
          if (!isDryRun && subTopicDbMap.size > 0 && subject.slug) {
            try {
              const archivedUrls = await getArchivedYoutubeUrls(subject.slug, chapterSlug, topicSlug);

              if (archivedUrls.length > 0) {
                const restoredArchiveIds: number[] = [];

                for (const archived of archivedUrls) {
                  // Match by slug (normalized comparison)
                  const normalizedArchived = archived.sub_topic_slug.toLowerCase().replace(/[^a-z0-9]/g, '');

                  let matchedST: { id: number; slug: string; display_order: number } | undefined;

                  // Try exact slug match first
                  for (const [, stRecord] of subTopicDbMap) {
                    if (stRecord.slug === archived.sub_topic_slug) {
                      matchedST = stRecord;
                      break;
                    }
                  }

                  // Fallback: normalized match
                  if (!matchedST) {
                    for (const [, stRecord] of subTopicDbMap) {
                      if (stRecord.slug.replace(/[^a-z0-9]/g, '') === normalizedArchived) {
                        matchedST = stRecord;
                        break;
                      }
                    }
                  }

                  // Fallback: display_order match
                  if (!matchedST && archived.sub_topic_display_order != null) {
                    for (const [, stRecord] of subTopicDbMap) {
                      if (stRecord.display_order === archived.sub_topic_display_order) {
                        matchedST = stRecord;
                        break;
                      }
                    }
                  }

                  if (!matchedST) continue;

                  // Check if sub-topic already has a video linked (don't overwrite)
                  const { data: currentST } = await supabase
                    .from('sub_topics')
                    .select('video_id, video_source, youtube_url')
                    .eq('id', matchedST.id)
                    .single();

                  if (currentST?.youtube_url || currentST?.video_id) continue; // Already has video, skip

                  // Restore the YouTube URL
                  const { error: restoreErr } = await supabase
                    .from('sub_topics')
                    .update({
                      youtube_url: archived.youtube_url,
                      video_source: archived.video_source || 'youtube',
                    })
                    .eq('id', matchedST.id);

                  if (!restoreErr) {
                    restoredArchiveIds.push(archived.id);
                    report.videos.found++;
                    report.videos.matched++;
                    console.log(`[Phase 4c] Restored YouTube URL for sub-topic ${matchedST.slug} from archive`);
                  }
                }

                // Mark restored entries so they won't match again
                if (restoredArchiveIds.length > 0) {
                  await markArchiveRestored(restoredArchiveIds);
                }
              }
            } catch (archiveErr: any) {
              report.errors.push(`Phase 4c: Failed to restore YouTube URLs: ${archiveErr.message}`);
            }
          }
        }
      }

      // ─── Phase 5: Sync deletions (soft delete items not in .txt) ───
      // Only delete if ALL chapters were selected (no granular selection) to avoid
      // deleting chapters that simply weren't in the selection scope
      const isFullCourseSync = !courseSelection; // null = all chapters selected
      if (isSync && subject.id > 0 && isFullCourseSync) {
        const subjectChapters = chaptersBySubject.get(subject.id) || [];
        for (const ch of subjectChapters) {
          if (!seenChapterIds.has(ch.id)) {
            if (auto_delete && !isDryRun) {
              await supabase.from('chapters').update({ deleted_at: new Date().toISOString() }).eq('id', ch.id);
            }
            report.chapters.deleted++;
          }
          // Check topics within seen chapters
          if (seenChapterIds.has(ch.id)) {
            const chTopics = topicsByChapter.get(ch.id) || [];
            for (const tp of chTopics) {
              if (!seenTopicIds.has(tp.id)) {
                if (auto_delete && !isDryRun) {
                  await supabase.from('topics').update({ deleted_at: new Date().toISOString() }).eq('id', tp.id);
                }
                report.topics.deleted++;
              }
              if (seenTopicIds.has(tp.id)) {
                const tpSTs = subTopicsByTopic.get(tp.id) || [];
                for (const st of tpSTs) {
                  if (!seenSubTopicIds.has(st.id)) {
                    if (auto_delete && !isDryRun) {
                      await supabase.from('sub_topics').update({ deleted_at: new Date().toISOString() }).eq('id', st.id);
                    }
                    report.sub_topics.deleted++;
                  }
                }
              }
            }
          }
        }
      }
    }

    // ─── Phase 6: Generate AI translations for all newly created entities ───
    // Uses concurrent batches of 3 to reduce wall-clock time by ~3x
    if (!isDryRun) {
      const aiProvider: AIProvider = 'gemini';
      const totalNew = newSubjectIds.length + newChapterIds.length + newTopicIds.length + newSubTopicIds.length;
      const PHASE6_CONCURRENCY = 3;

      if (totalNew > 0) {
        console.log(`Phase 6: Generating AI translations for ${totalNew} new entities (concurrency: ${PHASE6_CONCURRENCY})...`);

        // Helper to process a list of entity IDs with concurrency
        const processEntityBatch = async (entityType: MaterialEntityType, ids: number[], reportKey: 'subjects' | 'chapters' | 'topics' | 'sub_topics') => {
          for (let i = 0; i < ids.length; i += PHASE6_CONCURRENCY) {
            const batch = ids.slice(i, i + PHASE6_CONCURRENCY);
            const settled = await Promise.allSettled(
              batch.map(id => generateAllTranslationsForEntity(entityType, id, userId, aiProvider))
            );
            for (let j = 0; j < settled.length; j++) {
              if (settled[j].status === 'fulfilled') {
                const { results } = (settled[j] as PromiseFulfilledResult<any>).value;
                const success = results.filter((r: any) => r.status === 'success').length;
                (report.ai_translations as any)[reportKey]++;
                report.ai_translations.total_generated += success;
                report.ai_translations.errors += results.filter((r: any) => r.status === 'error').length;
              } else {
                const reason = (settled[j] as PromiseRejectedResult).reason;
                report.errors.push(`AI translation for ${entityType} ${batch[j]}: ${reason?.message || 'Unknown error'}`);
                report.ai_translations.errors++;
              }
            }
          }
        };

        // Process each entity type (subjects first since they're fewest)
        await processEntityBatch('subject', newSubjectIds, 'subjects');
        await processEntityBatch('chapter', newChapterIds, 'chapters');
        await processEntityBatch('topic', newTopicIds, 'topics');
        await processEntityBatch('sub_topic', newSubTopicIds, 'sub_topics');

        console.log(`Phase 6 complete: ${report.ai_translations.total_generated} translations generated, ${report.ai_translations.errors} errors`);
      }
    }

    // Clean up collection cache after import
    clearCollectionCache();

    logAdmin({
      actorId: userId,
      action: 'ai_content_generated',
      targetType: 'cdn_import',
      targetId: 0,
      targetName: `Import from CDN (${sync_mode})`,
      ip: getClientIp(req),
      metadata: { report },
    });

    return ok(res, { report }, isDryRun ? 'Dry run completed — no changes made' : 'CDN import completed');
  } catch (error: any) {
    console.error('Import from CDN error:', error);
    return err(res, error.message || 'CDN import failed', 500);
  }
}

/**
 * Scaffold CDN folder structure from a .txt course file.
 * Creates all folders on Bunny CDN following the naming convention.
 */
export async function scaffoldCdn(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return err(res, 'Unauthorized', 401);

    const { txt_content } = req.body;
    if (!txt_content) return err(res, 'txt_content is required', 400);

    // Fetch active languages for creating language folders
    const { data: languages } = await supabase
      .from('languages')
      .select('iso_code')
      .eq('is_active', true)
      .eq('for_material', true)
      .order('id');

    const langCodes = (languages || []).map(l => l.iso_code);
    if (!langCodes.length) langCodes.push('en'); // fallback

    // Parse the .txt content
    const parseResult = parseCourseStructure(txt_content);
    if (!parseResult.course) {
      return err(res, `Failed to parse: ${parseResult.errors.join('; ')}`, 400);
    }

    // Build all CDN folder paths with order-prefixed names (01_Name, 02_Name, ...)
    // Course level: sanitized name without order prefix (e.g. "C_Programming")
    // Chapter/Topic level: zero-padded order + sanitized name (e.g. "01_Introduction_to_C")
    const course = parseResult.course;
    const courseFolder = buildCourseFolderName(course.name);
    const paths: string[] = [`materials/${courseFolder}`];

    for (const chapter of course.chapters) {
      const chapterFolder = buildCdnName(chapter.order, chapter.name);
      const chapterPath = `materials/${courseFolder}/${chapterFolder}`;
      paths.push(chapterPath);

      for (const topic of chapter.topics) {
        const topicFolder = buildCdnName(topic.order, topic.name);
        const topicPath = `${chapterPath}/${topicFolder}`;
        paths.push(topicPath);
        paths.push(`${topicPath}/resources`);

        // Language folders under each topic
        for (const iso of langCodes) {
          paths.push(`${topicPath}/${iso}`);
        }
      }
    }

    // Create folders in batches
    const batchSize = 10;
    let created = 0;
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      await createBunnyFolders(batch);
      created += batch.length;
    }

    // Also create the .txt file on CDN (using folder-based path)
    const txtPath = `materials/${courseFolder}/${courseFolder}.txt`;
    await uploadRawFile(Buffer.from(txt_content, 'utf-8'), txtPath);

    // Create matching Bunny Stream collection hierarchy for videos
    // Use the same order-prefixed folder names so CDN and Stream match
    let streamCollectionsCreated = 0;
    try {
      const collections = await createCourseCollections(
        courseFolder,
        course.chapters.map(ch => ({
          name: buildCdnName(ch.order, ch.name),
          topics: ch.topics.map(tp => ({ name: buildCdnName(tp.order, tp.name) })),
        }))
      );
      streamCollectionsCreated = collections.size;
      clearCollectionCache();
    } catch (collErr: any) {
      // Non-fatal — CDN folders are created, Stream collections failed
      console.warn('Stream collection creation failed:', collErr.message);
    }

    logAdmin({
      actorId: userId,
      action: 'cdn_scaffold_created',
      targetType: 'cdn_import',
      targetId: 0,
      targetName: `Scaffold: ${parseResult.course.name}`,
      ip: getClientIp(req),
      metadata: { folders: created, course: parseResult.course.name, streamCollections: streamCollectionsCreated },
    });

    return ok(res, {
      course: parseResult.course.name,
      folders_created: created,
      stream_collections_created: streamCollectionsCreated,
      txt_uploaded: txtPath,
      folder_paths: paths,
    }, 'CDN structure scaffolded');
  } catch (error: any) {
    console.error('Scaffold CDN error:', error);
    return err(res, error.message || 'CDN scaffold failed', 500);
  }
}

/**
 * Check status of pending Bunny Stream videos.
 * Finds all sub-topics with video_source = 'bunny_pending',
 * queries Stream for their status, and updates records that are now ready.
 */
export async function checkVideoStatus(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return err(res, 'Unauthorized', 401);

    // Find all sub-topics with videos still processing
    // uploadVideo() sets video_source='bunny' with video_status='processing',
    // so we must check both 'bunny_pending' and 'bunny' with status='processing'
    const { data: pendingSTs, error: fetchErr } = await supabase
      .from('sub_topics')
      .select('id, slug, video_id, video_source')
      .in('video_source', ['bunny_pending', 'bunny'])
      .eq('video_status', 'processing')
      .is('deleted_at', null);

    if (fetchErr) return err(res, fetchErr.message, 500);
    if (!pendingSTs?.length) return ok(res, { checked: 0, ready: 0, still_pending: 0, failed: 0 }, 'No pending videos');

    const report = { checked: 0, ready: 0, still_pending: 0, failed: 0, errors: [] as string[] };

    for (const st of pendingSTs) {
      report.checked++;

      if (!st.video_id) {
        report.still_pending++;
        continue;
      }

      try {
        const status = await getVideoStatus(st.video_id);
        // Bunny Stream status codes: 0=created, 1=uploaded, 2=processing, 3=transcoding, 4=finished, 5=error
        if (status.status === 4) {
          // Video is ready
          const libId = config.bunny.streamLibraryId;
          const embedUrl = `https://iframe.mediadelivery.net/embed/${libId}/${st.video_id}`;
          const thumbnailUrl = config.bunny.streamCdn
            ? `${config.bunny.streamCdn}/${st.video_id}/thumbnail.jpg`
            : `https://vz-cdn.b-cdn.net/${st.video_id}/thumbnail.jpg`;

          await supabase.from('sub_topics').update({
            video_source: 'bunny',
            video_url: embedUrl,
            thumbnail_url: thumbnailUrl,
          }).eq('id', st.id);

          report.ready++;
        } else if (status.status === 5) {
          // Video failed
          await supabase.from('sub_topics').update({
            video_source: 'bunny_error',
          }).eq('id', st.id);
          report.failed++;
          report.errors.push(`Video for sub-topic "${st.slug}" failed transcoding`);
        } else {
          report.still_pending++;
        }
      } catch (e: any) {
        report.still_pending++;
        report.errors.push(`Failed to check status for "${st.slug}": ${e.message}`);
      }
    }

    logAdmin({
      actorId: userId,
      action: 'video_status_check',
      targetType: 'cdn_import',
      targetId: 0,
      targetName: 'Check Video Status',
      ip: getClientIp(req),
      metadata: { report },
    });

    return ok(res, { report }, `Checked ${report.checked} videos: ${report.ready} ready, ${report.still_pending} pending, ${report.failed} failed`);
  } catch (error: any) {
    console.error('Check video status error:', error);
    return err(res, error.message || 'Video status check failed', 500);
  }
}

// ─── Clean Orphaned Videos ─────────────────────────────────────
// POST /ai/clean-orphaned-videos
// Lists all Bunny Stream videos, compares with DB sub_topics.video_id,
// deletes any video that has no matching DB record. Also removes empty collections.

export async function cleanOrphanedVideos(req: Request, res: Response) {
  try {
    const { dry_run = false } = req.body;

    // 1. Get all videos from Bunny Stream
    const allVideos = await listAllStreamVideos();

    // 2. Get all video_ids from DB
    const { data: dbSubTopics, error: dbErr } = await supabase
      .from('sub_topics')
      .select('video_id')
      .not('video_id', 'is', null);
    if (dbErr) return err(res, dbErr.message, 500);

    const dbVideoIds = new Set((dbSubTopics || []).map((st: any) => st.video_id));

    // 3. Find orphaned videos (in Bunny but not in DB)
    const orphanedVideos = allVideos.filter(v => !dbVideoIds.has(v.guid));

    // 4. Delete orphaned videos (unless dry_run)
    const deleted: string[] = [];
    const failedDeletes: { guid: string; error: string }[] = [];

    if (!dry_run) {
      for (const v of orphanedVideos) {
        try {
          await deleteVideoFromStream(v.guid);
          deleted.push(v.guid);
        } catch (e: any) {
          failedDeletes.push({ guid: v.guid, error: e.message });
        }
      }
    }

    // 5. Get all collections and find empty ones
    const allCollections = await listAllStreamCollections();
    const emptyCollections = allCollections.filter(c => c.videoCount === 0);
    const deletedCollections: string[] = [];
    const failedCollectionDeletes: { guid: string; error: string }[] = [];

    if (!dry_run) {
      for (const c of emptyCollections) {
        try {
          await deleteStreamCollection(c.guid);
          deletedCollections.push(c.guid);
        } catch (e: any) {
          failedCollectionDeletes.push({ guid: c.guid, error: e.message });
        }
      }
    }

    const report = {
      total_stream_videos: allVideos.length,
      db_video_ids: dbVideoIds.size,
      orphaned_found: orphanedVideos.length,
      orphaned_videos: orphanedVideos.map(v => ({ guid: v.guid, title: v.title, sizeMB: Math.round(v.storageSize / 1024 / 1024 * 100) / 100 })),
      videos_deleted: deleted.length,
      video_delete_failures: failedDeletes,
      total_collections: allCollections.length,
      empty_collections_found: emptyCollections.length,
      empty_collections: emptyCollections.map(c => ({ guid: c.guid, name: c.name })),
      collections_deleted: deletedCollections.length,
      collection_delete_failures: failedCollectionDeletes,
      dry_run,
    };

    await logAdmin({
      actorId: req.user!.id,
      action: 'clean_orphaned_videos',
      targetType: 'cdn_import',
      targetId: 0,
      targetName: 'Clean Orphaned Videos',
      ip: getClientIp(req),
      metadata: { orphaned: report.orphaned_found, deleted: report.videos_deleted, collections_deleted: report.collections_deleted, dry_run },
    });

    const msg = dry_run
      ? `Dry run: found ${report.orphaned_found} orphaned videos and ${report.empty_collections_found} empty collections`
      : `Deleted ${report.videos_deleted} orphaned videos and ${report.collections_deleted} empty collections`;
    return ok(res, { report }, msg);
  } catch (error: any) {
    console.error('Clean orphaned videos error:', error);
    return err(res, error.message || 'Clean orphaned videos failed', 500);
  }
}

// ─── YouTube Description Generator ───────────────────────────────
/**
 * Generate YouTube video title + description for one or more sub-topics.
 * Reads the English HTML file from BunnyCDN, sends to AI, saves to youtube_descriptions table.
 *
 * Body: { sub_topic_ids: number[], provider?: 'openai'|'anthropic'|'gemini' }
 * Also accepts: { subject_id, chapter_id, topic_id } to resolve all sub-topics under them.
 */
export async function generateYoutubeDescription(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const provider: AIProvider = (req.body.provider as AIProvider) || 'openai';
    let subTopicIds: number[] = req.body.sub_topic_ids || [];

    // Resolve sub-topic IDs from higher-level selection (supports single ID or arrays)
    if (subTopicIds.length === 0) {
      const { subject_id, chapter_id, topic_id, subject_ids, chapter_ids, topic_ids } = req.body;
      const resolvedTopicIds: number[] = topic_ids || (topic_id ? [topic_id] : []);
      const resolvedChapterIds: number[] = chapter_ids || (chapter_id ? [chapter_id] : []);
      const resolvedSubjectIds: number[] = subject_ids || (subject_id ? [subject_id] : []);

      if (resolvedTopicIds.length > 0) {
        const { data } = await supabase.from('sub_topics').select('id').in('topic_id', resolvedTopicIds).is('deleted_at', null);
        subTopicIds = (data || []).map((r: any) => r.id);
      } else if (resolvedChapterIds.length > 0) {
        const { data: topics } = await supabase.from('topics').select('id').in('chapter_id', resolvedChapterIds).is('deleted_at', null);
        if (topics && topics.length > 0) {
          const tIds = topics.map((t: any) => t.id);
          const { data } = await supabase.from('sub_topics').select('id').in('topic_id', tIds).is('deleted_at', null);
          subTopicIds = (data || []).map((r: any) => r.id);
        }
      } else if (resolvedSubjectIds.length > 0) {
        const { data: chapters } = await supabase.from('chapters').select('id').in('subject_id', resolvedSubjectIds).is('deleted_at', null);
        if (chapters && chapters.length > 0) {
          const cIds = chapters.map((c: any) => c.id);
          const { data: topics } = await supabase.from('topics').select('id').in('chapter_id', cIds).is('deleted_at', null);
          if (topics && topics.length > 0) {
            const tIds = topics.map((t: any) => t.id);
            const { data } = await supabase.from('sub_topics').select('id').in('topic_id', tIds).is('deleted_at', null);
            subTopicIds = (data || []).map((r: any) => r.id);
          }
        }
      }
    }

    if (subTopicIds.length === 0) return err(res, 'No sub-topics specified or found', 400);

    // Fetch material languages for the description template
    const { data: materialLangs } = await supabase
      .from('languages')
      .select('name')
      .eq('is_active', true)
      .eq('for_material', true)
      .order('id');
    const langNames = (materialLangs || []).map((l: any) => l.name);
    const langCheckboxes = langNames.map((n: string) => `✅ ${n}`).join(' ');

    // Fetch all sub-topics with their hierarchy
    const { data: subTopics } = await supabase
      .from('sub_topics')
      .select(`
        id, slug, display_order, youtube_url,
        topics!inner(id, slug, display_order,
          chapters!inner(id, slug, display_order,
            subjects!inner(id, slug, code, name)
          )
        )
      `)
      .in('id', subTopicIds)
      .is('deleted_at', null);

    if (!subTopics || subTopics.length === 0) return err(res, 'No valid sub-topics found', 404);

    // Fetch English language ID
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (!enLang) return err(res, 'English language not configured', 500);

    const results: Array<{
      sub_topic_id: number;
      slug: string;
      status: 'success' | 'skipped' | 'error';
      video_title?: string;
      error?: string;
    }> = [];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // ── Phase 1: Pre-fetch all English translations and HTML content in parallel ──
    const enTransIds = subTopicIds;
    const { data: allEnTrans } = await supabase
      .from('sub_topic_translations')
      .select('sub_topic_id, name, page, short_intro, long_intro')
      .in('sub_topic_id', enTransIds)
      .eq('language_id', enLang.id)
      .is('deleted_at', null);
    const enTransMap = new Map((allEnTrans || []).map((t: any) => [t.sub_topic_id, t]));

    // Pre-process each sub-topic: download HTML and extract text content
    interface PreparedSubTopic {
      st: any;
      subTopicName: string;
      subjectName: string;
      chapterSlug: string;
      topicSlug: string;
      fileContent: string;
      sourceFilePath: string;
    }
    const prepared: PreparedSubTopic[] = [];

    for (const st of subTopics) {
      const topic = (st as any).topics;
      const chapter = topic.chapters;
      const subject = chapter.subjects;
      const enTrans = enTransMap.get(st.id);
      const subTopicName = enTrans?.name || st.slug;
      const subjectName = subject.name || subject.code || subject.slug;

      let fileContent = '';
      let sourceFilePath = '';
      if (enTrans?.page) {
        try {
          sourceFilePath = (enTrans.page as string).replace(config.bunny.cdnUrl + '/', '').split('?')[0];
          const rawHtml = await downloadBunnyFile(sourceFilePath);
          fileContent = rawHtml
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
        } catch (downloadErr) {
          console.error(`Failed to download CDN file for sub-topic ${st.slug}:`, downloadErr);
        }
      }

      if (!fileContent) {
        const parts: string[] = [];
        if (enTrans?.short_intro) parts.push(enTrans.short_intro);
        if (enTrans?.long_intro) parts.push(enTrans.long_intro);
        if (parts.length > 0) {
          fileContent = parts.join('\n\n');
        } else {
          fileContent = `Topic: ${subTopicName} (part of ${subjectName} course)`;
        }
      }

      prepared.push({ st, subTopicName, subjectName, chapterSlug: chapter.slug, topicSlug: topic.slug, fileContent, sourceFilePath });
    }

    // ── Phase 2: Batch AI generation — 5 sub-topics per AI call ──
    const BATCH_SIZE = 5;
    // Truncate content per sub-topic to fit multiple in one prompt (2500 chars each vs 12000 solo)
    const CONTENT_LIMIT_PER_ITEM = 2500;

    for (let batchStart = 0; batchStart < prepared.length; batchStart += BATCH_SIZE) {
      const batch = prepared.slice(batchStart, batchStart + BATCH_SIZE);

      // Build batched user content with numbered items
      const itemsBlock = batch.map((item, idx) => {
        return `--- ITEM ${idx + 1} (sub_topic_id: ${item.st.id}) ---
Subject/Course: ${item.subjectName}
Chapter: ${item.chapterSlug}
Topic: ${item.topicSlug}
Sub-Topic Name: ${item.subTopicName}

Content from the lesson file:
${item.fileContent.substring(0, CONTENT_LIMIT_PER_ITEM)}`;
      }).join('\n\n');

      // Use first item's subject for template placeholders (all should be same subject in typical usage)
      const refSubjectName = batch[0].subjectName;

      const systemPrompt = `You are a YouTube content strategist and SEO expert. Generate YouTube video titles and descriptions for ${batch.length} educational videos.

STRICT RULES:
1. Return a JSON object with key "items" containing an ARRAY of ${batch.length} objects
2. Each object MUST have keys: "sub_topic_id" (number), "video_title" (string), "description" (string)
3. The total description for EACH item MUST be strictly under 5000 English characters
4. Follow the EXACT template structure provided below FOR EACH item
5. VIDEO TITLE FORMAT: "[Sub-Topic Name]? [Key Aspects & Descriptive Words] | [Subject] Course"
   Example: "What is C Programming? History, Evolution & Complete Beginner Guide | C Programming Course"
   - Must include the sub-topic name, a few descriptive/SEO-rich words, and the course name separated by |
6. NEVER write "In this video," or "In this tutorial," anywhere in any description
7. The FIRST LINE of each description must be an extremely catchy, attention-grabbing hook
8. Use appropriate icons/emojis throughout ALL sections
9. Use the actual content provided per item to generate relevant learning points
10. Generate relevant SEO keywords and hashtags based on actual content per item

TEMPLATE STRUCTURE FOR EACH DESCRIPTION:
---
🔥 [Extremely catchy first line — a bold statement, surprising fact, or thought-provoking question that hooks the reader instantly. NO "In this video" type phrases.]

[2-3 sentence paragraph explaining what this lesson covers and why it matters, mentioning the course name. Use a conversational, energetic tone. Add relevant icons.]

📖 What You'll Learn:
✅ [Point 1 based on actual content]
✅ [Point 2]
✅ [Point 3]
✅ [Point 4]
✅ [Point 5]
✅ [Point 6]
(Generate 5-10 relevant points from the content)

📚 Course Material Available In Multiple Languages
🌍 Get complete learning material in:
${langCheckboxes}

📦 Along with:
📝 Quizzes
📌 Assignments
💻 Practical Projects
📚 Notes
🎯 Beginner-friendly explanations

💡 Whether you're a student, beginner, job seeker, or aspiring developer — this course helps you master programming concepts clearly and practically.

🌐 Connect With Us
🔗 Website: [Add Website Link]
📧 Email: [Add Email Link]
📱 WhatsApp: [Add WhatsApp Link]
✈️ Telegram: [Add Telegram Link]
📸 Instagram: [Add Instagram Link]
👍 Facebook: [Add Facebook Link]
💼 LinkedIn: [Add LinkedIn Link]

🎬 Explore More Playlists
▶️ ${refSubjectName} Complete Course: [Add Playlist Link]
▶️ Full Stack Development Playlist: [Add Playlist Link]
▶️ Flutter Development Playlist: [Add Playlist Link]

🎯 Who Should Watch This?
👨‍💻 [Target audience 1]
🎓 [Target audience 2]
🚀 [Target audience 3]
💼 [Target audience 4]
🔰 [Target audience 5]
(Generate 5-7 relevant target audience points with appropriate icons)

🔔 Don't Forget!
👉 If you found this helpful — smash that Like 👍, Share with friends 🔄, drop a Comment 💬, and Subscribe 🔔 for more programming tutorials and career-focused tech content!

💬 Comment below: Which language do you want the course material in — ${langNames.join(', ')}? 🌏

🔍 SEO Keywords
[Generate 20-30 comma-separated relevant SEO keywords]

🏷️ Tags
[Generate 15-25 relevant hashtags starting with #]
---`;

      try {
        const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, itemsBlock, 8192 * batch.length);
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        const parsed = parseJSON(text);
        const items: any[] = parsed.items || (Array.isArray(parsed) ? parsed : [parsed]);

        // Build a map of sub_topic_id → result for easy lookup
        const resultMap = new Map<number, any>();
        for (const item of items) {
          if (item.sub_topic_id) resultMap.set(item.sub_topic_id, item);
        }

        // Save each result
        for (const bItem of batch) {
          const aiResult = resultMap.get(bItem.st.id);
          if (aiResult && (aiResult.video_title || aiResult.description)) {
            const videoTitle = aiResult.video_title || `${bItem.subTopicName} | ${bItem.subjectName}`;
            const description = aiResult.description || '';

            const { error: upsertErr } = await supabase
              .from('youtube_descriptions')
              .upsert({
                sub_topic_id: bItem.st.id,
                video_title: videoTitle,
                description: description,
                source_file_path: bItem.sourceFilePath || null,
                generated_by: userId,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'sub_topic_id' });

            if (upsertErr) {
              console.error(`Failed to save youtube description for sub-topic ${bItem.st.id}:`, upsertErr);
              results.push({ sub_topic_id: bItem.st.id, slug: bItem.st.slug, status: 'error', error: upsertErr.message });
            } else {
              results.push({ sub_topic_id: bItem.st.id, slug: bItem.st.slug, status: 'success', video_title: videoTitle });
            }
          } else {
            // Batch didn't return this item — fallback to individual call
            console.warn(`Batch missing result for sub-topic ${bItem.st.id}, falling back to individual call`);
            try {
              const soloSystem = `You are a YouTube content strategist and SEO expert. Generate a YouTube video title and description for an educational video.

STRICT RULES:
1. The total description MUST be strictly under 5000 English characters
2. Follow the EXACT template structure provided in the user content
3. Return valid JSON with keys: "video_title" and "description"
4. VIDEO TITLE FORMAT: "${bItem.subTopicName}? [Key Aspects & Descriptive Words] | ${bItem.subjectName} Course"
5. NEVER write "In this video," or "In this tutorial," anywhere in the description
6. The FIRST LINE must be an extremely catchy, attention-grabbing hook
7. Use appropriate icons/emojis throughout ALL sections
8. Use the actual content provided to generate relevant learning points`;

              const soloUser = `Subject/Course: ${bItem.subjectName}
Chapter: ${bItem.chapterSlug}
Topic: ${bItem.topicSlug}
Sub-Topic Name: ${bItem.subTopicName}

Content from the lesson file:
${bItem.fileContent.substring(0, 12000)}`;

              const { text: soloText, inputTokens: soloIn, outputTokens: soloOut } = await callAI(provider, soloSystem, soloUser, 8192);
              totalInputTokens += soloIn;
              totalOutputTokens += soloOut;
              const soloParsed = parseJSON(soloText);
              const videoTitle = soloParsed.video_title || `${bItem.subTopicName} | ${bItem.subjectName}`;
              const description = soloParsed.description || '';

              const { error: upsertErr } = await supabase
                .from('youtube_descriptions')
                .upsert({
                  sub_topic_id: bItem.st.id,
                  video_title: videoTitle,
                  description: description,
                  source_file_path: bItem.sourceFilePath || null,
                  generated_by: userId,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'sub_topic_id' });

              if (upsertErr) {
                results.push({ sub_topic_id: bItem.st.id, slug: bItem.st.slug, status: 'error', error: upsertErr.message });
              } else {
                results.push({ sub_topic_id: bItem.st.id, slug: bItem.st.slug, status: 'success', video_title: videoTitle });
              }
            } catch (soloErr: any) {
              results.push({ sub_topic_id: bItem.st.id, slug: bItem.st.slug, status: 'error', error: soloErr.message });
            }
          }
        }
      } catch (batchErr: any) {
        // Entire batch failed — fall back to individual calls for each item
        console.error(`Batch AI call failed, falling back to individual calls:`, batchErr);
        for (const bItem of batch) {
          try {
            const soloSystem = `You are a YouTube content strategist and SEO expert. Generate a YouTube video title and description for an educational video.

STRICT RULES:
1. The total description MUST be strictly under 5000 English characters
2. Return valid JSON with keys: "video_title" and "description"
3. VIDEO TITLE FORMAT: "${bItem.subTopicName}? [Key Aspects & Descriptive Words] | ${bItem.subjectName} Course"
4. NEVER write "In this video," or "In this tutorial," anywhere in the description
5. The FIRST LINE must be an extremely catchy, attention-grabbing hook
6. Use appropriate icons/emojis throughout ALL sections`;

            const soloUser = `Subject/Course: ${bItem.subjectName}
Chapter: ${bItem.chapterSlug}
Topic: ${bItem.topicSlug}
Sub-Topic Name: ${bItem.subTopicName}

Content from the lesson file:
${bItem.fileContent.substring(0, 12000)}`;

            const { text: soloText, inputTokens: soloIn, outputTokens: soloOut } = await callAI(provider, soloSystem, soloUser, 8192);
            totalInputTokens += soloIn;
            totalOutputTokens += soloOut;
            const soloParsed = parseJSON(soloText);
            const videoTitle = soloParsed.video_title || `${bItem.subTopicName} | ${bItem.subjectName}`;
            const description = soloParsed.description || '';

            const { error: upsertErr } = await supabase
              .from('youtube_descriptions')
              .upsert({
                sub_topic_id: bItem.st.id,
                video_title: videoTitle,
                description: description,
                source_file_path: bItem.sourceFilePath || null,
                generated_by: userId,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'sub_topic_id' });

            if (upsertErr) {
              results.push({ sub_topic_id: bItem.st.id, slug: bItem.st.slug, status: 'error', error: upsertErr.message });
            } else {
              results.push({ sub_topic_id: bItem.st.id, slug: bItem.st.slug, status: 'success', video_title: videoTitle });
            }
          } catch (soloErr: any) {
            results.push({ sub_topic_id: bItem.st.id, slug: bItem.st.slug, status: 'error', error: soloErr.message });
          }
        }
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    logAdmin({
      actorId: userId,
      action: 'youtube_description_generated',
      targetType: 'youtube_description',
      targetId: 0,
      targetName: `Generated ${successCount} YouTube descriptions (${provider})`,
      ip: getClientIp(req),
      metadata: { provider, total: subTopicIds.length, success: successCount, errors: errorCount },
    });

    return ok(res, {
      results,
      summary: { total: subTopicIds.length, success: successCount, errors: errorCount },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Generated ${successCount} YouTube description(s)`);
  } catch (error: any) {
    console.error('generateYoutubeDescription error:', error);
    return err(res, error.message || 'Failed to generate YouTube descriptions', 500);
  }
}

// ─── Bulk generate missing content for multiple entities ───────────────────────
// POST /ai/bulk-generate-missing-content
// Accepts { entity_type, entity_ids?: number[], generate_all?: boolean, provider, prompt }
// If generate_all is true, auto-discovers ALL entities of that type with missing/empty translations.
// Otherwise processes the given entity_ids.
export async function bulkGenerateMissingContent(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { entity_type, entity_ids: rawIds, generate_all, prompt, provider: reqProvider, force_regenerate } = req.body;

    // Validate entity_type
    const validTypes: MaterialEntityType[] = ['subject', 'chapter', 'topic', 'sub_topic', 'course', 'course_module', 'bundle'];
    if (!entity_type || !validTypes.includes(entity_type)) {
      return err(res, `entity_type must be one of: ${validTypes.join(', ')}`, 400);
    }

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';
    const cfg = ENTITY_CONFIG[entity_type as MaterialEntityType];

    // Determine which entity IDs to process
    let entity_ids: number[] = [];

    if (generate_all) {
      // Auto-discover: fetch all active entities and find those with missing/empty translations
      const allEntities = await fetchAll<{ id: number }>(cfg.table, 'id', {
        filters: q => q.eq('is_active', true).is('deleted_at', null),
        order: 'id',
      });

      if (!allEntities || allEntities.length === 0) {
        return ok(res, { results: [], summary: { total: 0, success: 0, skipped: 0, errors: 0 } }, 'No active entities found');
      }

      // Check which entities have missing or empty translations
      const { data: allLangs } = await supabase.from('languages').select('id').eq('is_active', true).eq('for_material', true);
      const totalLangs = allLangs?.length || 0;
      if (totalLangs === 0) {
        return ok(res, { results: [], summary: { total: 0, success: 0, skipped: 0, errors: 0 } }, 'No active for_material languages');
      }

      // Fetch all translations to find entities needing content
      const bulkNameField = cfg.nameField || 'name';
      const contentFields = cfg.fields.filter(f => f !== bulkNameField);
      const selectFields = [cfg.idField, 'language_id', ...contentFields].join(', ');
      const allTranslations = await fetchAll<Record<string, any>>(cfg.translationTable, selectFields, {
        filters: q => q.is('deleted_at', null),
      });

      const transMap = new Map<number, number>(); // entity_id → count of translations with content
      const totalTransMap = new Map<number, number>(); // entity_id → total translation count
      for (const t of allTranslations) {
        const eid = t[cfg.idField];
        totalTransMap.set(eid, (totalTransMap.get(eid) || 0) + 1);
        const hasContent = contentFields.some((f: string) => {
          const val = t[f];
          if (Array.isArray(val)) return val.length > 0;
          return val && typeof val === 'string' && val.trim().length > 0;
        });
        if (hasContent) transMap.set(eid, (transMap.get(eid) || 0) + 1);
      }

      // Entity needs content if: missing translations OR has translations with empty content
      for (const entity of allEntities) {
        const totalTrans = totalTransMap.get(entity.id) || 0;
        const withContent = transMap.get(entity.id) || 0;
        if (totalTrans < totalLangs || withContent < totalTrans) {
          entity_ids.push(entity.id);
        }
      }

      if (entity_ids.length === 0) {
        return ok(res, { results: [], summary: { total: 0, success: 0, skipped: 0, errors: 0 } }, 'All entities already have complete content');
      }
    } else {
      // Use provided entity_ids
      if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) {
        return err(res, 'entity_ids must be a non-empty array of numbers (or set generate_all: true)', 400);
      }
      if (rawIds.length > 50) {
        return err(res, 'Maximum 50 entities per request', 400);
      }
      entity_ids = rawIds;
    }

    const results: { entity_id: number; status: 'success' | 'skipped' | 'error'; languages_generated: number; error?: string }[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Process entities in parallel batches of 3 for cost-effective concurrency
    // Each entity still makes 1-2 AI calls internally, but running 3 concurrently
    // reduces wall-clock time by ~3x without increasing API cost.
    const CONCURRENCY = 3;
    for (let i = 0; i < entity_ids.length; i += CONCURRENCY) {
      const batch = entity_ids.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (entityId) => {
          const { results: langResults, totalInputTokens: inTok, totalOutputTokens: outTok } =
            await generateAllTranslationsForEntity(entity_type, entityId, String(userId), provider, prompt || undefined, !!force_regenerate);
          return { entityId, langResults, inTok, outTok };
        })
      );

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          const { entityId, langResults, inTok, outTok } = settled.value;
          totalInputTokens += inTok;
          totalOutputTokens += outTok;

          if (langResults.length === 0) {
            results.push({ entity_id: entityId, status: 'skipped', languages_generated: 0 });
            skippedCount++;
          } else {
            const generated = langResults.filter((r: any) => r.status === 'created' || r.status === 'restored' || r.status === 'updated').length;
            results.push({ entity_id: entityId, status: 'success', languages_generated: generated });
            successCount++;
          }
        } else {
          // Promise.allSettled rejection — extract entityId from the batch
          const idx = batchResults.indexOf(settled);
          const entityId = batch[idx];
          const error = settled.reason;
          results.push({ entity_id: entityId, status: 'error', languages_generated: 0, error: error?.message || 'Unknown error' });
          errorCount++;
        }
      }
    }

    // Log admin activity
    logAdmin({
      actorId: userId,
      action: 'ai_bulk_content_generated',
      targetType: cfg.table,
      targetId: 0,
      targetName: `Bulk generated content for ${entity_ids.length} ${cfg.entityLabel}(s) (${provider})`,
      ip: getClientIp(req),
      metadata: { entity_type, provider, total: entity_ids.length, success: successCount, skipped: skippedCount, errors: errorCount, generate_all: !!generate_all },
    });

    return ok(res, {
      results,
      summary: { total: entity_ids.length, success: successCount, skipped: skippedCount, errors: errorCount },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Generated content for ${successCount} ${cfg.entityLabel}(s), ${skippedCount} already complete`);
  } catch (error: any) {
    console.error('bulkGenerateMissingContent error:', error);
    return err(res, error.message || 'Failed to bulk generate content', 500);
  }
}

// ─── Auto-Generate MCQ Questions from Tutorial Content ───────────────────────
/**
 * POST /ai/auto-generate-mcq
 * Reads English tutorial HTML files for sub-topics under a topic,
 * sends content to AI, generates MCQ questions + options + translations.
 *
 * Body: {
 *   topic_id: number (required),
 *   sub_topic_id?: number (optional - single sub-topic mode),
 *   num_questions?: number (default 0 = auto; AI decides based on content richness),
 *   difficulty_mix?: 'auto' | 'mixed' | 'easy' | 'medium' | 'hard',
 *   mcq_types?: string[] (e.g. ['single_choice','multiple_choice','true_false']),
 *   provider?: 'anthropic' | 'openai' | 'gemini',
 *   auto_translate?: boolean (default false - also generate translations)
 * }
 */
export async function autoGenerateMcq(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const {
      topic_id,
      sub_topic_id,
      num_questions = 0,
      difficulty_mix,
      mcq_types = ['single_choice', 'multiple_choice', 'true_false'],
      provider: reqProvider,
      auto_translate = false,
    } = req.body;

    if (!topic_id) return err(res, 'topic_id is required', 400);
    const rawNumQ = parseInt(num_questions) || 0;
    const isAutoCount = rawNumQ <= 0; // 0 or unset = AI decides
    const numQ = isAutoCount ? 0 : Math.max(1, rawNumQ); // no upper cap
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Validate topic exists
    const { data: topic } = await supabase.from('topics').select('id, slug, name').eq('id', topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);

    // Find sub-topics with English tutorial pages
    let subTopicQuery = supabase
      .from('sub_topic_translations')
      .select('sub_topic_id, page, sub_topics!inner(id, slug, name, topic_id)')
      .eq('language_id', 7) // English
      .eq('sub_topics.topic_id', topic_id)
      .not('page', 'is', null)
      .is('deleted_at', null);

    if (sub_topic_id) {
      subTopicQuery = subTopicQuery.eq('sub_topic_id', sub_topic_id);
    }

    const { data: subTopicTranslations, error: stErr } = await subTopicQuery;
    if (stErr) return err(res, stErr.message, 500);
    if (!subTopicTranslations || subTopicTranslations.length === 0) {
      return err(res, 'No sub-topics with English tutorial pages found for this topic', 404);
    }

    // Helper to strip HTML
    function stripHtml(html: string): string {
      return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Get max display_order for existing questions in this topic
    const { data: existingQs } = await supabase
      .from('mcq_questions')
      .select('display_order')
      .eq('topic_id', topic_id)
      .is('deleted_at', null)
      .order('display_order', { ascending: false })
      .limit(1);
    let nextDisplayOrder = ((existingQs?.[0]?.display_order) || 0) + 1;

    // Get material languages for translation
    let materialLangs: any[] = [];
    if (auto_translate) {
      const { data: langs } = await supabase
        .from('languages')
        .select('id, iso_code, name')
        .eq('is_active', true)
        .eq('for_material', true)
        .neq('id', 7) // exclude English
        .order('id');
      materialLangs = langs || [];
    }

    const results: any[] = [];
    let totalQuestionsCreated = 0;
    let totalOptionsCreated = 0;
    let totalTranslationsCreated = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Process each sub-topic
    for (const st of subTopicTranslations) {
      const subTopic = (st as any).sub_topics;
      const pageUrl = st.page;
      if (!pageUrl) continue;

      // Download HTML from Bunny CDN
      const cdnPath = pageUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
      let htmlContent: string;
      try {
        htmlContent = await downloadBunnyFile(cdnPath);
      } catch (downloadErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `Failed to download HTML: ${downloadErr.message}` });
        continue;
      }

      const plainText = stripHtml(htmlContent);
      if (!plainText || plainText.length < 50) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'skipped', error: 'Tutorial content too short' });
        continue;
      }
      const contentForAI = plainText.length > 30000 ? plainText.slice(0, 30000) : plainText;

      // Build difficulty instruction
      const diffMode = typeof difficulty_mix === 'string' ? difficulty_mix : 'auto';
      let difficultyInstruction = '';
      if (diffMode === 'easy') difficultyInstruction = 'ALL questions should be EASY difficulty (factual recall, basic definitions).';
      else if (diffMode === 'medium') difficultyInstruction = 'ALL questions should be MEDIUM difficulty (understanding concepts, applying knowledge).';
      else if (diffMode === 'hard') difficultyInstruction = 'ALL questions should be HARD difficulty (analysis, comparison, deeper reasoning).';
      else if (diffMode === 'mixed' && !isAutoCount) {
        const easyCount = Math.round(numQ * 0.3);
        const hardCount = Math.round(numQ * 0.2);
        const mediumCount = numQ - easyCount - hardCount;
        difficultyInstruction = `Distribute difficulty: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard.`;
      } else {
        // auto mode
        difficultyInstruction = 'Automatically distribute difficulty (easy/medium/hard) based on content complexity — more easy questions for introductory content, more hard for advanced/complex content. Use your best judgment.';
      }

      const typesList = Array.isArray(mcq_types) && mcq_types.length > 0 ? mcq_types : ['single_choice', 'multiple_choice', 'true_false'];

      // Build type distribution instruction
      const hasSingle = typesList.includes('single_choice');
      const hasMultiple = typesList.includes('multiple_choice');
      const hasTrueFalse = typesList.includes('true_false');
      let typeDistribution = '';
      if (hasSingle && hasMultiple && hasTrueFalse) {
        typeDistribution = `You MUST use ALL THREE question types with this approximate distribution:
- single_choice: ~50-60% of questions (this is the PRIMARY type — use for most concept/knowledge questions)
- multiple_choice: ~25-35% of questions (use when a question naturally has 2-3 correct answers)
- true_false: ~10-15% of questions (use SPARINGLY — only for clear factual statements)
DO NOT generate only one type. You MUST mix all three types.`;
      } else if (hasSingle && hasMultiple) {
        typeDistribution = `Use BOTH question types: ~65% single_choice, ~35% multiple_choice. DO NOT use only one type.`;
      } else if (hasSingle && hasTrueFalse) {
        typeDistribution = `Use BOTH question types: ~75% single_choice, ~25% true_false. DO NOT use only one type.`;
      } else if (hasMultiple && hasTrueFalse) {
        typeDistribution = `Use BOTH question types: ~70% multiple_choice, ~30% true_false. DO NOT use only one type.`;
      } else if (hasSingle) {
        typeDistribution = `Generate ONLY single_choice questions.`;
      } else if (hasMultiple) {
        typeDistribution = `Generate ONLY multiple_choice questions.`;
      } else {
        typeDistribution = `Generate ONLY true_false questions.`;
      }

      const quantityInstruction = isAutoCount
        ? `Generate ALL possible meaningful MCQ questions from the content. There is NO LIMIT — generate as many as the content supports.

YOUR GOAL IS EXHAUSTIVE, COMPREHENSIVE COVERAGE:
- Create questions for EVERY concept, definition, rule, syntax element, example, and important detail
- Include INTERVIEW-LEVEL questions that test deep understanding, not just surface recall
- Cover ALL cognitive levels: recall, understanding, application, analysis, comparison, evaluation
- For code/programming content: test syntax, output prediction, error identification, debugging, best practices, edge cases, "what happens if..." scenarios
- For theoretical content: test definitions, differences/comparisons, advantages/disadvantages, real-world applications, common misconceptions
- Do NOT skip ANY teachable point — if it's mentioned in the tutorial, create questions about it
- Create multiple questions from different angles for important concepts
- Include tricky/nuanced questions that interviewers would ask
- Each question must be UNIQUE — different angle, different depth, or different aspect
- Generate 20-50+ questions for rich content — DO NOT artificially limit yourself
- More content = more questions. Short tutorials = 15-20, medium = 25-40, long/detailed = 40-60+`
        : `Generate EXACTLY ${numQ} MCQ questions based on the content.`;

      const systemPrompt = `You are an expert educational content analyst for GrowUpMore — an online learning platform.
Read the provided tutorial content and generate MCQ (Multiple Choice Question) questions based on it.

Sub-topic: "${subTopic?.name || subTopic?.slug}"
Topic: "${topic.name || topic.slug}"

QUANTITY: ${quantityInstruction}

DIFFICULTY: ${difficultyInstruction}

QUESTION TYPE DISTRIBUTION (STRICTLY FOLLOW):
${typeDistribution}

RULES FOR EACH QUESTION TYPE:
- "single_choice": Generate 4 options, exactly 1 correct. Use for concept testing, definitions, syntax, output questions.
- "multiple_choice": Generate 4-6 options, 2-3 correct. Mark ALL correct ones. Use when multiple answers apply (e.g., "Which of the following are valid...").
- "true_false": Generate exactly 2 options: "True" and "False". One is correct. Use ONLY for clear-cut factual statements. NEVER prefix the question_text with "True or False:" or any similar prefix — the type field already indicates it.

IMPORTANT GUIDELINES:
- STRICTLY CONTENT-BOUND: Every question MUST come directly from the provided tutorial content. Do NOT introduce any theory, concept, term, syntax, function, example, or fact that is NOT explicitly mentioned or demonstrated in the provided content. If something is not in the tutorial text, do NOT ask about it — even if it is related to the topic. The tutorial content is the ONLY source of truth.
- Questions must test real understanding, not just trivial facts — think like a teacher preparing an exam AND an interviewer testing candidates
- Include conceptual, practical, tricky, and application-based questions
- Each question must be clearly answerable from the provided content
- Options should be highly plausible — avoid obviously wrong distractors; include common misconceptions as wrong options
- For "single_choice": create 4 strong options where at least 2 look correct but only 1 is right
- For "multiple_choice": create 4-6 options where multiple are correct — test thorough understanding
- Always generate a helpful hint that nudges toward the answer without revealing it
- Always generate a detailed explanation of WHY the correct answer(s) is/are correct AND why wrong ones are wrong
- Auto-assign points: easy=1, medium=2, hard=3
- Generate a short unique code for each question (e.g., "q-html-basics-01")
- CRITICAL: Vary question types throughout — do NOT cluster same types together
- DO NOT hold back — generate every meaningful question the content supports

CODE FORMATTING RULE:
- When including code snippets in question_text or option_text, ALWAYS wrap them in markdown triple backtick fences with the language tag (e.g. \`\`\`c, \`\`\`python, \`\`\`java, \`\`\`html, \`\`\`javascript, etc.).
- For inline code references (variable names, function names, keywords), wrap them in single backticks (e.g. \`printf\`, \`int\`, \`main()\`).
- Example GOOD: "What is the output of the following code?\n\n\`\`\`c\n#include <stdio.h>\nint main() {\n  printf(\\"Hello\\");\n  return 0;\n}\n\`\`\`"
- Example BAD: "What is the output of the following code?\n\n#include <stdio.h>\nint main() {\n  printf(\\"Hello\\");\n  return 0;\n}"

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "questions": [
    {
      "code": "short-unique-code",
      "question_text": "The question text in English",
      "mcq_type": "single_choice|multiple_choice|true_false",
      "difficulty_level": "easy|medium|hard",
      "points": 1,
      "hint_text": "A helpful hint without giving away the answer",
      "explanation_text": "Detailed explanation of the correct answer, referencing the tutorial content",
      "options": [
        { "option_text": "Option A text", "is_correct": false },
        { "option_text": "Option B text", "is_correct": true },
        { "option_text": "Option C text", "is_correct": false },
        { "option_text": "Option D text", "is_correct": false }
      ]
    }
  ]
}`;

      let aiResult;
      try {
        aiResult = await callAI(provider, systemPrompt, contentForAI, isAutoCount ? 65536 : Math.max(8192, numQ * 2048));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;
      } catch (aiErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `AI call failed: ${aiErr.message}` });
        continue;
      }

      let parsed: any;
      try {
        parsed = parseJSON(aiResult.text);
      } catch (parseErr: any) {
        console.error(`MCQ JSON parse error for sub-topic ${st.sub_topic_id}:`, parseErr.message, 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned invalid JSON' });
        continue;
      }

      const questions = parsed.questions || (Array.isArray(parsed) ? parsed : []);
      if (!questions.length) {
        console.error(`MCQ no questions for sub-topic ${st.sub_topic_id}. Parsed keys:`, Object.keys(parsed || {}), 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned no questions' });
        continue;
      }

      console.log(`MCQ: AI generated ${questions.length} questions for sub-topic ${st.sub_topic_id} (${subTopic?.name}). Types: ${questions.map((q: any) => q.mcq_type).join(', ')}`);

      let stQuestionsCreated = 0;
      let stOptionsCreated = 0;
      let stTranslationsCreated = 0;
      const createdQuestionIds: number[] = [];
      const stTranslationsCreatedLangs: string[] = [];

      // ─── BATCH PHASE 1: Prepare all questions and generate slugs ───
      const validQuestions: any[] = [];
      for (const q of questions) {
        if (!q.question_text || !q.options || !Array.isArray(q.options) || q.options.length < 2) continue;
        // Strip any "True or False:" prefix from question text — the mcq_type field handles this
        q.question_text = q.question_text.replace(/^(True\s*(or|\/)\s*False\s*[:.\-–—]\s*)/i, '').trim();
        // Map AI type names to DB enum values: single_choice→single, multiple_choice→multiple, true_false stays
        const typeMap: Record<string, string> = { single_choice: 'single', multiple_choice: 'multiple', true_false: 'true_false', single: 'single', multiple: 'multiple' };
        const mcqType = typeMap[q.mcq_type] || 'single';
        const diffLevel = ['easy', 'medium', 'hard'].includes(q.difficulty_level) ? q.difficulty_level : 'medium';
        const code = (q.code || `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 80);
        const slug = await generateUniqueSlug(supabase, 'mcq_questions', code, undefined, { column: 'topic_id', value: topic_id });
        validQuestions.push({ ...q, _mcqType: mcqType, _diffLevel: diffLevel, _code: code, _slug: slug, _displayOrder: nextDisplayOrder++ });
      }

      if (validQuestions.length === 0) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'No valid questions generated' });
        continue;
      }

      // ─── BATCH PHASE 2: Bulk insert all mcq_questions at once ───
      const questionInserts = validQuestions.map(q => ({
        topic_id,
        code: q._code,
        slug: q._slug,
        mcq_type: q._mcqType,
        difficulty_level: q._diffLevel,
        points: q.points || (q._diffLevel === 'easy' ? 1 : q._diffLevel === 'medium' ? 2 : 3),
        display_order: q._displayOrder,
        is_mandatory: false,
        is_active: true,
        created_by: userId,
      }));

      const { data: newQuestions, error: bulkQErr } = await supabase
        .from('mcq_questions')
        .insert(questionInserts)
        .select('id, code, display_order');

      if (bulkQErr || !newQuestions || newQuestions.length === 0) {
        console.error(`MCQ bulk insert failed for sub-topic ${st.sub_topic_id}:`, bulkQErr?.message, 'First insert:', JSON.stringify(questionInserts[0]));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `DB insert failed: ${bulkQErr?.message || 'unknown'}` });
        continue;
      }

      // Map new question IDs back to validQuestions by display_order
      const questionIdMap = new Map<number, number>(); // display_order -> id
      for (const nq of newQuestions) {
        questionIdMap.set(nq.display_order, nq.id);
        createdQuestionIds.push(nq.id);
      }
      stQuestionsCreated = newQuestions.length;

      // ─── BATCH PHASE 3: Bulk insert English question translations ───
      const qTransInserts: any[] = [];
      for (const q of validQuestions) {
        const qId = questionIdMap.get(q._displayOrder);
        if (!qId) continue;
        qTransInserts.push({
          mcq_question_id: qId,
          language_id: 7,
          question_text: q.question_text,
          hint_text: q.hint_text || null,
          explanation_text: q.explanation_text || null,
          is_active: true,
          created_by: userId,
        });
      }
      if (qTransInserts.length > 0) {
        await supabase.from('mcq_question_translations').insert(qTransInserts);
      }

      // ─── BATCH PHASE 4: Bulk insert all options + English option translations ───
      // We need to insert options per-question to get IDs back, but we can batch the translations
      const allOptionTransInserts: any[] = [];
      // Track option IDs per question for translation phase
      const questionOptionIds: Map<number, { id: number; optionText: string; displayOrder: number }[]> = new Map();

      for (const q of validQuestions) {
        const qId = questionIdMap.get(q._displayOrder);
        if (!qId) continue;

        // Batch insert all options for this question
        // Enforce single correct answer for single_choice and true_false
        let filteredOpts = q.options.filter((o: any) => o.option_text);
        if ((q.mcq_type === 'single_choice' || q.mcq_type === 'true_false') && filteredOpts.filter((o: any) => o.is_correct).length > 1) {
          // Keep only the first correct option as correct, set rest to false
          let foundFirst = false;
          filteredOpts = filteredOpts.map((o: any) => {
            if (o.is_correct && !foundFirst) { foundFirst = true; return o; }
            if (o.is_correct && foundFirst) return { ...o, is_correct: false };
            return o;
          });
        }
        const optInserts = filteredOpts
          .map((o: any, oi: number) => ({
            mcq_question_id: qId,
            is_correct: !!o.is_correct,
            display_order: oi + 1,
            is_active: true,
            created_by: userId,
          }));

        if (optInserts.length === 0) continue;

        const { data: newOpts, error: optErr } = await supabase
          .from('mcq_options')
          .insert(optInserts)
          .select('id, display_order');

        if (optErr || !newOpts) continue;
        stOptionsCreated += newOpts.length;

        // Build English option translations for batch insert
        const optIdList: { id: number; optionText: string; displayOrder: number }[] = [];
        const validOpts = q.options.filter((o: any) => o.option_text);
        for (const no of newOpts) {
          const matchingOpt = validOpts[no.display_order - 1];
          if (matchingOpt) {
            allOptionTransInserts.push({
              mcq_option_id: no.id,
              language_id: 7,
              option_text: matchingOpt.option_text,
              is_active: true,
              created_by: userId,
            });
            optIdList.push({ id: no.id, optionText: matchingOpt.option_text, displayOrder: no.display_order });
          }
        }
        questionOptionIds.set(qId, optIdList);
      }

      // Bulk insert all English option translations at once
      if (allOptionTransInserts.length > 0) {
        await supabase.from('mcq_option_translations').insert(allOptionTransInserts);
      }

      // ─── BATCH PHASE 5: BATCH translate ALL questions in ONE AI call ───
      if (auto_translate && materialLangs.length > 0 && validQuestions.length > 0) {
        try {
          // Build a batch of all questions to translate in a single call
          const batchItems = validQuestions.map((q, idx) => {
            const validOpts = q.options.filter((o: any) => o.option_text).map((o: any) => o.option_text);
            return {
              index: idx + 1,
              question_text: q.question_text,
              hint_text: q.hint_text || '',
              explanation_text: q.explanation_text || '',
              options: validOpts,
            };
          });

          const batchTranslatePrompt = `Translate ALL ${batchItems.length} MCQ questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${materialLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
hint_text: "${item.hint_text}"
explanation_text: "${item.explanation_text}"
options: ${JSON.stringify(item.options)}`).join('\n')}

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें।" — WRONG

ADDITIONAL RULE: NEVER translate the option text "True" or "False". These MUST remain exactly as "True" and "False" in ALL languages.

CODE FORMATTING RULE: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks (\`code\`).

Return ONLY valid JSON with this EXACT structure (array of translations, one per question, in the SAME ORDER):
{
  "translations": [
    {
      "index": 1,
      "${materialLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "hint_text": "...",
        "explanation_text": "...",
        "options": ["opt1", "opt2", "opt3", "opt4"]
      }
    },
    {
      "index": 2,
      "${materialLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "hint_text": "...",
        "explanation_text": "...",
        "options": ["opt1", "opt2", "opt3", "opt4"]
      }
    }
  ]
}`;

          // Scale tokens based on question count — more questions need more output tokens
          const transMaxTokens = Math.max(8192, validQuestions.length * materialLangs.length * 1024);
          const transResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
          totalInputTokens += transResult.inputTokens;
          totalOutputTokens += transResult.outputTokens;

          const transData = parseJSON(transResult.text);
          const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

          // Process each translated question
          const allQTransInserts: any[] = [];
          const allOptTransInserts: any[] = [];

          for (let qi = 0; qi < validQuestions.length; qi++) {
            const q = validQuestions[qi];
            const qId = questionIdMap.get(q._displayOrder);
            if (!qId) continue;

            // Find matching translation entry by index
            const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
            if (!transEntry) continue;

            const optIds = questionOptionIds.get(qId) || [];

            for (const lang of materialLangs) {
              const langData = transEntry[lang.iso_code];
              if (!langData) continue;

              // Queue question translation
              allQTransInserts.push({
                mcq_question_id: qId,
                language_id: lang.id,
                question_text: langData.question_text || q.question_text,
                hint_text: langData.hint_text || null,
                explanation_text: langData.explanation_text || null,
                is_active: true,
                created_by: userId,
              });
              stTranslationsCreated++;
              if (!stTranslationsCreatedLangs.includes(lang.name)) stTranslationsCreatedLangs.push(lang.name);

              // Queue option translations
              if (langData.options && Array.isArray(langData.options)) {
                for (let oi = 0; oi < Math.min(langData.options.length, optIds.length); oi++) {
                  allOptTransInserts.push({
                    mcq_option_id: optIds[oi].id,
                    language_id: lang.id,
                    option_text: langData.options[oi],
                    is_active: true,
                    created_by: userId,
                  });
                }
              }
            }
          }

          // Bulk insert all translated question translations
          if (allQTransInserts.length > 0) {
            // Insert in batches of 100 to avoid Supabase payload limits
            for (let bi = 0; bi < allQTransInserts.length; bi += 100) {
              await supabase.from('mcq_question_translations').insert(allQTransInserts.slice(bi, bi + 100));
            }
          }

          // Bulk insert all translated option translations
          if (allOptTransInserts.length > 0) {
            for (let bi = 0; bi < allOptTransInserts.length; bi += 100) {
              await supabase.from('mcq_option_translations').insert(allOptTransInserts.slice(bi, bi + 100));
            }
          }
        } catch (transErr: any) {
          console.error('MCQ batch translation error:', transErr.message);
        }
      }

      totalQuestionsCreated += stQuestionsCreated;
      totalOptionsCreated += stOptionsCreated;
      totalTranslationsCreated += stTranslationsCreated;

      results.push({
        sub_topic_id: st.sub_topic_id,
        sub_topic_name: subTopic?.name || subTopic?.slug,
        status: 'success',
        questions_created: stQuestionsCreated,
        options_created: stOptionsCreated,
        translations_created: stTranslationsCreated,
        translations_languages: stTranslationsCreatedLangs,
        question_ids: createdQuestionIds,
      });
    }

    // Clear MCQ caches
    await redis.del('mcq_questions:all');
    await redis.del('mcq_question_translations:all');

    // Collect all created question IDs across sub-topics
    const allCreatedIds = results.flatMap((r: any) => r.question_ids || []);

    // Fetch full question details for the response
    let questions: any[] = [];
    if (allCreatedIds.length > 0) {
      const { data: qRows } = await supabase
        .from('mcq_questions')
        .select('id, code, slug, mcq_type, difficulty_level, points, display_order')
        .in('id', allCreatedIds)
        .order('display_order');

      for (const qr of (qRows || [])) {
        // Get English translation
        const { data: engTrans } = await supabase
          .from('mcq_question_translations')
          .select('question_text, hint_text, explanation_text')
          .eq('mcq_question_id', qr.id)
          .eq('language_id', 7)
          .single();

        // Get options with English text
        const { data: opts } = await supabase
          .from('mcq_options')
          .select('id, is_correct, display_order')
          .eq('mcq_question_id', qr.id)
          .is('deleted_at', null)
          .order('display_order');

        const optionDetails: any[] = [];
        for (const opt of (opts || [])) {
          const { data: optTrans } = await supabase
            .from('mcq_option_translations')
            .select('option_text')
            .eq('mcq_option_id', opt.id)
            .eq('language_id', 7)
            .single();
          optionDetails.push({
            id: opt.id,
            option_text: optTrans?.option_text || '',
            is_correct: opt.is_correct,
          });
        }

        // Get which languages have translations
        const { data: langTrans } = await supabase
          .from('mcq_question_translations')
          .select('language_id, languages(name)')
          .eq('mcq_question_id', qr.id)
          .neq('language_id', 7)
          .is('deleted_at', null);
        const translatedLangs = (langTrans || []).map((lt: any) => lt.languages?.name || '').filter(Boolean);

        questions.push({
          mcq_question_id: qr.id,
          code: qr.code,
          slug: qr.slug,
          question_type: qr.mcq_type,
          difficulty_level: qr.difficulty_level,
          points: qr.points,
          question_text: engTrans?.question_text || '',
          hint_text: engTrans?.hint_text || null,
          explanation_text: engTrans?.explanation_text || null,
          options: optionDetails,
          translations_created: translatedLangs,
        });
      }
    }

    // Log admin activity (non-blocking — never let this kill the response)
    try {
      logAdmin({
        actorId: userId,
        action: 'mcq_auto_generated',
        targetType: 'mcq_question',
        targetId: topic_id,
        targetName: topic.name || topic.slug,
        changes: { questions_created: totalQuestionsCreated, options_created: totalOptionsCreated, translations_created: totalTranslationsCreated },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('MCQ logAdmin error (non-fatal):', logErr.message);
    }

    console.log(`MCQ generation complete: ${totalQuestionsCreated} questions, ${totalOptionsCreated} options, ${totalTranslationsCreated} translations`);

    return ok(res, {
      questions,
      results,
      summary: {
        sub_topics_processed: results.length,
        sub_topics_success: results.filter((r: any) => r.status === 'success').length,
        sub_topics_error: results.filter((r: any) => r.status === 'error').length,
        total_questions_created: totalQuestionsCreated,
        total_options_created: totalOptionsCreated,
        total_translations_created: totalTranslationsCreated,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Generated ${totalQuestionsCreated} MCQ questions with ${totalOptionsCreated} options`);
  } catch (error: any) {
    console.error('autoGenerateMcq error:', error);
    return err(res, error.message || 'Failed to auto-generate MCQ questions', 500);
  }
}

// ─── Auto-Translate Existing MCQ Questions ───────────────────────────────────
/**
 * POST /ai/auto-translate-mcq
 * Translates existing English MCQ questions + options to all material languages.
 *
 * Body: {
 *   topic_id?: number (translate all questions under topic),
 *   question_ids?: number[] (translate specific questions),
 *   provider?: 'anthropic' | 'openai' | 'gemini'
 * }
 */
export async function autoTranslateMcq(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { topic_id, question_ids, provider: reqProvider } = req.body;
    if (!topic_id && (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0)) {
      return err(res, 'topic_id or question_ids[] is required', 400);
    }
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Get target languages (non-English material languages)
    const { data: materialLangs } = await supabase
      .from('languages')
      .select('id, iso_code, name')
      .eq('is_active', true)
      .eq('for_material', true)
      .neq('id', 7)
      .order('id');
    if (!materialLangs || materialLangs.length === 0) return err(res, 'No target languages found', 404);

    // Find questions to translate
    let questionsQuery = supabase
      .from('mcq_questions')
      .select('id, code, slug, topic_id')
      .is('deleted_at', null)
      .eq('is_active', true);

    if (question_ids && question_ids.length > 0) {
      questionsQuery = questionsQuery.in('id', question_ids);
    } else {
      questionsQuery = questionsQuery.eq('topic_id', topic_id);
    }

    const { data: questions, error: qErr } = await questionsQuery;
    if (qErr) return err(res, qErr.message, 500);
    if (!questions || questions.length === 0) return err(res, 'No questions found to translate', 404);

    let totalTranslated = 0;
    let totalErrors = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const results: any[] = [];

    // ─── PHASE 1: Gather all question data and find missing languages ───
    type QueuedQuestion = {
      question_id: number;
      engText: string;
      engHint: string;
      engExplanation: string;
      engOptions: string[];
      options: { id: number; display_order: number }[];
      missingLangs: typeof materialLangs;
      incompleteLangIds: Set<number>;
    };
    const translationQueue: QueuedQuestion[] = [];

    for (const question of questions) {
      // Get English question translation
      const { data: engQTrans } = await supabase
        .from('mcq_question_translations')
        .select('question_text, hint_text, explanation_text')
        .eq('mcq_question_id', question.id)
        .eq('language_id', 7)
        .is('deleted_at', null)
        .single();

      if (!engQTrans || !engQTrans.question_text) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'No English translation' });
        continue;
      }

      // Find which languages are missing OR incomplete (hint/explanation null when English has them)
      const { data: existingTrans } = await supabase
        .from('mcq_question_translations')
        .select('language_id, hint_text, explanation_text')
        .eq('mcq_question_id', question.id)
        .is('deleted_at', null);
      const existingLangMap = new Map((existingTrans || []).map(t => [t.language_id, t]));
      const missingLangs = materialLangs.filter(l => !existingLangMap.has(l.id));
      // Also find languages that exist but are missing hint/explanation when English has them
      const hasEngHint = !!(engQTrans.hint_text);
      const hasEngExplanation = !!(engQTrans.explanation_text);
      const incompleteLangs = materialLangs.filter(l => {
        if (l.id === 7) return false; // skip English
        const existing = existingLangMap.get(l.id);
        if (!existing) return false; // already in missingLangs
        return (hasEngHint && !existing.hint_text) || (hasEngExplanation && !existing.explanation_text);
      });
      const langsToTranslate = [...missingLangs, ...incompleteLangs];
      if (langsToTranslate.length === 0) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'All languages complete' });
        continue;
      }

      // Get English option texts
      const { data: options } = await supabase
        .from('mcq_options')
        .select('id, display_order')
        .eq('mcq_question_id', question.id)
        .is('deleted_at', null)
        .order('display_order');

      const optionIds = (options || []).map(o => o.id);
      let engOptionTexts: string[] = [];
      if (optionIds.length > 0) {
        const { data: engOTrans } = await supabase
          .from('mcq_option_translations')
          .select('mcq_option_id, option_text')
          .in('mcq_option_id', optionIds)
          .eq('language_id', 7)
          .is('deleted_at', null);
        engOptionTexts = (options || []).map(o => {
          const t = (engOTrans || []).find(t => t.mcq_option_id === o.id);
          return t?.option_text || '';
        });
      }

      const incompleteLangIds = new Set(incompleteLangs.map(l => l.id));
      translationQueue.push({
        question_id: question.id,
        engText: engQTrans.question_text,
        engHint: engQTrans.hint_text || '',
        engExplanation: engQTrans.explanation_text || '',
        engOptions: engOptionTexts,
        options: options || [],
        missingLangs: langsToTranslate,
        incompleteLangIds,
      });
    }

    // ─── PHASE 2: Batch translate in chunks (max 10 questions per AI call) ───
    const BATCH_SIZE = 10;
    for (let bi = 0; bi < translationQueue.length; bi += BATCH_SIZE) {
      const batch = translationQueue.slice(bi, bi + BATCH_SIZE);
      // All questions need the same set of languages (use union)
      const allMissingLangs = materialLangs; // translate to all, we'll skip inserts for existing

      try {
        const batchItems = batch.map((item, idx) => ({
          index: idx + 1,
          question_text: item.engText,
          hint_text: item.engHint,
          explanation_text: item.engExplanation,
          options: item.engOptions,
        }));

        const batchTranslatePrompt = `Translate ALL ${batchItems.length} MCQ questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${allMissingLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
hint_text: "${item.hint_text}"
explanation_text: "${item.explanation_text}"
options: ${JSON.stringify(item.options)}`).join('\n')}

MOST IMPORTANT RULES:
1. Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
GOOD (Hindi): "HTML5 की Fundamentals सीखें।"
BAD (Hindi): "एचटीएमएल5 की मूल बातें।"


2. NEVER translate the option text "True" or "False". These MUST remain exactly as "True" and "False" in ALL languages. Do NOT convert them to local language equivalents.

3. CODE FORMATTING: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks.
Return ONLY valid JSON:
{
  "translations": [
    {
      "index": 1,
      "${allMissingLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "hint_text": "...",
        "explanation_text": "...",
        "options": ["opt1", "opt2", ...]
      }
    }
  ]
}`;

        const transMaxTokens = Math.max(8192, batch.length * allMissingLangs.length * 1024);
        const aiResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;

        const transData = parseJSON(aiResult.text);
        const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

        // Process each question's translations — INSERT for missing, UPDATE for incomplete
        const allQTransInserts: any[] = [];
        const allOptTransInserts: any[] = [];
        const allQTransUpdates: { question_id: number; language_id: number; hint_text: string | null; explanation_text: string | null }[] = [];

        for (let qi = 0; qi < batch.length; qi++) {
          const item = batch[qi];
          const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
          if (!transEntry) {
            results.push({ question_id: item.question_id, status: 'error', error: 'No translation returned' });
            totalErrors++;
            continue;
          }

          let langsDone = 0;

          for (const lang of item.missingLangs) {
            const langData = transEntry[lang.iso_code];
            if (!langData) continue;

            const isIncomplete = item.incompleteLangIds.has(lang.id);

            if (isIncomplete) {
              // UPDATE existing record — only fill in missing hint/explanation
              allQTransUpdates.push({
                question_id: item.question_id,
                language_id: lang.id,
                hint_text: langData.hint_text || null,
                explanation_text: langData.explanation_text || null,
              });
            } else {
              // INSERT new record
              allQTransInserts.push({
                mcq_question_id: item.question_id,
                language_id: lang.id,
                question_text: langData.question_text || item.engText,
                hint_text: langData.hint_text || null,
                explanation_text: langData.explanation_text || null,
                is_active: true,
                created_by: userId,
              });

              if (langData.options && Array.isArray(langData.options)) {
                for (let oi = 0; oi < Math.min(langData.options.length, item.options.length); oi++) {
                  allOptTransInserts.push({
                    mcq_option_id: item.options[oi].id,
                    language_id: lang.id,
                    option_text: langData.options[oi],
                    is_active: true,
                    created_by: userId,
                  });
                }
              }
            }
            langsDone++;
          }

          totalTranslated += langsDone;
          results.push({ question_id: item.question_id, status: 'success', languages_added: langsDone });
        }

        // Bulk insert new translations
        if (allQTransInserts.length > 0) {
          for (let ci = 0; ci < allQTransInserts.length; ci += 100) {
            await supabase.from('mcq_question_translations').insert(allQTransInserts.slice(ci, ci + 100));
          }
        }
        if (allOptTransInserts.length > 0) {
          for (let ci = 0; ci < allOptTransInserts.length; ci += 100) {
            await supabase.from('mcq_option_translations').insert(allOptTransInserts.slice(ci, ci + 100));
          }
        }
        // Update incomplete translations with missing hint/explanation
        for (const upd of allQTransUpdates) {
          const updateData: any = {};
          if (upd.hint_text) updateData.hint_text = upd.hint_text;
          if (upd.explanation_text) updateData.explanation_text = upd.explanation_text;
          if (Object.keys(updateData).length > 0) {
            await supabase.from('mcq_question_translations')
              .update(updateData)
              .eq('mcq_question_id', upd.question_id)
              .eq('language_id', upd.language_id)
              .is('deleted_at', null);
          }
        }
      } catch (batchErr: any) {
        console.error('Batch translation error:', batchErr.message);
        for (const item of batch) {
          totalErrors++;
          results.push({ question_id: item.question_id, status: 'error', error: batchErr.message });
        }
      }
    }

    // Clear caches
    await redis.del('mcq_question_translations:all');
    await redis.del('mcq_questions:all');

    try {
      logAdmin({
        actorId: userId,
        action: 'mcq_auto_translated',
        targetType: 'mcq_question',
        targetId: topic_id || 0,
        targetName: `${questions.length} questions`,
        changes: { total_translated: totalTranslated, errors: totalErrors },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('MCQ translate logAdmin error (non-fatal):', logErr.message);
    }

    return ok(res, {
      results,
      summary: {
        questions_processed: questions.length,
        translations_created: totalTranslated,
        errors: totalErrors,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Translated ${totalTranslated} question translations across ${questions.length} questions`);
  } catch (error: any) {
    console.error('autoTranslateMcq error:', error);
    return err(res, error.message || 'Failed to auto-translate MCQ questions', 500);
  }
}

// ─── Auto-Generate One Word Questions ───────────────────────────────────────
/**
 * POST /ai/auto-generate-ow
 * Reads sub-topic tutorial HTML from Bunny CDN, sends to AI, and bulk-creates
 * one_word_questions + translations + synonyms.
 *
 * Body: {
 *   topic_id: number,
 *   sub_topic_id?: number,
 *   num_questions?: number (0 = AI decides),
 *   difficulty_mix?: 'auto' | 'easy' | 'medium' | 'hard' | 'mixed',
 *   question_types?: ('one_word' | 'fill_in_the_blank' | 'code_output')[],
 *   provider?: 'anthropic' | 'openai' | 'gemini',
 *   auto_translate?: boolean
 * }
 */
export async function autoGenerateOw(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const {
      topic_id,
      sub_topic_id,
      num_questions = 0,
      difficulty_mix,
      question_types = ['one_word', 'fill_in_the_blank', 'code_output'],
      provider: reqProvider,
      auto_translate = false,
    } = req.body;

    if (!topic_id) return err(res, 'topic_id is required', 400);
    const rawNumQ = parseInt(num_questions) || 0;
    const isAutoCount = rawNumQ <= 0;
    const numQ = isAutoCount ? 0 : Math.max(1, rawNumQ);
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Validate topic exists
    const { data: topic } = await supabase.from('topics').select('id, slug, name').eq('id', topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);

    // Find sub-topics with English tutorial pages
    let subTopicQuery = supabase
      .from('sub_topic_translations')
      .select('sub_topic_id, page, sub_topics!inner(id, slug, name, topic_id)')
      .eq('language_id', 7)
      .eq('sub_topics.topic_id', topic_id)
      .not('page', 'is', null)
      .is('deleted_at', null);

    if (sub_topic_id) {
      subTopicQuery = subTopicQuery.eq('sub_topic_id', sub_topic_id);
    }

    const { data: subTopicTranslations, error: stErr } = await subTopicQuery;
    if (stErr) return err(res, stErr.message, 500);
    if (!subTopicTranslations || subTopicTranslations.length === 0) {
      return err(res, 'No sub-topics with English tutorial pages found for this topic', 404);
    }

    // Helper to strip HTML
    function stripHtml(html: string): string {
      return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Get max display_order for existing questions in this topic
    const { data: existingQs } = await supabase
      .from('one_word_questions')
      .select('display_order')
      .eq('topic_id', topic_id)
      .is('deleted_at', null)
      .order('display_order', { ascending: false })
      .limit(1);
    let nextDisplayOrder = ((existingQs?.[0]?.display_order) || 0) + 1;

    // Get material languages for translation
    let materialLangs: any[] = [];
    if (auto_translate) {
      const { data: langs } = await supabase
        .from('languages')
        .select('id, iso_code, name')
        .eq('is_active', true)
        .eq('for_material', true)
        .neq('id', 7)
        .order('id');
      materialLangs = langs || [];
    }

    const results: any[] = [];
    let totalQuestionsCreated = 0;
    let totalSynonymsCreated = 0;
    let totalTranslationsCreated = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Process each sub-topic
    for (const st of subTopicTranslations) {
      const subTopic = (st as any).sub_topics;
      const pageUrl = st.page;
      if (!pageUrl) continue;

      // Download HTML from Bunny CDN
      const cdnPath = pageUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
      let htmlContent: string;
      try {
        htmlContent = await downloadBunnyFile(cdnPath);
      } catch (downloadErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `Failed to download HTML: ${downloadErr.message}` });
        continue;
      }

      const plainText = stripHtml(htmlContent);
      if (!plainText || plainText.length < 50) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'skipped', error: 'Tutorial content too short' });
        continue;
      }
      const contentForAI = plainText.length > 30000 ? plainText.slice(0, 30000) : plainText;

      // Build difficulty instruction
      const diffMode = typeof difficulty_mix === 'string' ? difficulty_mix : 'auto';
      let difficultyInstruction = '';
      if (diffMode === 'easy') difficultyInstruction = 'ALL questions should be EASY difficulty (factual recall, basic definitions).';
      else if (diffMode === 'medium') difficultyInstruction = 'ALL questions should be MEDIUM difficulty (understanding concepts, applying knowledge).';
      else if (diffMode === 'hard') difficultyInstruction = 'ALL questions should be HARD difficulty (analysis, comparison, deeper reasoning).';
      else if (diffMode === 'mixed' && !isAutoCount) {
        const easyCount = Math.round(numQ * 0.3);
        const hardCount = Math.round(numQ * 0.2);
        const mediumCount = numQ - easyCount - hardCount;
        difficultyInstruction = `Distribute difficulty: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard.`;
      } else {
        difficultyInstruction = 'Automatically distribute difficulty (easy/medium/hard) based on content complexity — more easy questions for introductory content, more hard for advanced/complex content. Use your best judgment.';
      }

      const typesList = Array.isArray(question_types) && question_types.length > 0 ? question_types : ['one_word', 'fill_in_the_blank', 'code_output'];

      // Build type distribution instruction
      const hasOneWord = typesList.includes('one_word');
      const hasFillBlank = typesList.includes('fill_in_the_blank');
      const hasCodeOutput = typesList.includes('code_output');
      let typeDistribution = '';
      if (hasOneWord && hasFillBlank && hasCodeOutput) {
        typeDistribution = `You MUST use ALL THREE question types with this approximate distribution:
- one_word: ~60% of questions (simple factual answers — keywords, names, values, single-word or short answers)
- fill_in_the_blank: ~25% of questions (sentence with ___ blank, answer fills the gap)
- code_output: ~15% of questions (what is the output of this code snippet — answer is the exact output)
DO NOT generate only one type. You MUST mix all three types.`;
      } else if (hasOneWord && hasFillBlank) {
        typeDistribution = `Use BOTH question types: ~70% one_word, ~30% fill_in_the_blank. DO NOT use only one type.`;
      } else if (hasOneWord && hasCodeOutput) {
        typeDistribution = `Use BOTH question types: ~80% one_word, ~20% code_output. DO NOT use only one type.`;
      } else if (hasFillBlank && hasCodeOutput) {
        typeDistribution = `Use BOTH question types: ~60% fill_in_the_blank, ~40% code_output. DO NOT use only one type.`;
      } else if (hasOneWord) {
        typeDistribution = `Generate ONLY one_word questions.`;
      } else if (hasFillBlank) {
        typeDistribution = `Generate ONLY fill_in_the_blank questions.`;
      } else {
        typeDistribution = `Generate ONLY code_output questions.`;
      }

      const quantityInstruction = isAutoCount
        ? `Generate ALL possible meaningful one-word/short-answer questions from the content. There is NO LIMIT — generate as many as the content supports.

YOUR GOAL IS EXHAUSTIVE, COMPREHENSIVE COVERAGE:
- Create questions for EVERY concept, definition, rule, syntax element, example, and important detail
- Include INTERVIEW-LEVEL questions that test deep understanding, not just surface recall
- Cover ALL cognitive levels: recall, understanding, application, analysis
- For code/programming content: test syntax, output prediction, keyword knowledge, function names, return values
- For theoretical content: test definitions, key terms, important values, acronyms
- Do NOT skip ANY teachable point — if it's mentioned in the tutorial, create questions about it
- Create multiple questions from different angles for important concepts
- Each question must be UNIQUE — different angle, different depth, or different aspect
- Generate 20-50+ questions for rich content — DO NOT artificially limit yourself
- More content = more questions. Short tutorials = 15-20, medium = 25-40, long/detailed = 40-60+`
        : `Generate EXACTLY ${numQ} one-word/short-answer questions based on the content.`;

      const systemPrompt = `You are an expert educational content analyst for GrowUpMore — an online learning platform.
Read the provided tutorial content and generate one-word/short-answer questions based on it.

Sub-topic: "${subTopic?.name || subTopic?.slug}"
Topic: "${topic.name || topic.slug}"

QUANTITY: ${quantityInstruction}

DIFFICULTY: ${difficultyInstruction}

QUESTION TYPE DISTRIBUTION (STRICTLY FOLLOW):
${typeDistribution}

RULES FOR EACH QUESTION TYPE:
- "one_word": Simple factual answers — keywords, names, values. The answer should be a single word or very short phrase.
- "fill_in_the_blank": The question_text MUST contain "___" (three underscores) as a blank placeholder. The correct_answer fills that blank.
- "code_output": Ask "What is the output of the following code?" with a code snippet in the question. The correct_answer is the exact output.

IMPORTANT GUIDELINES:
- STRICTLY CONTENT-BOUND: Every question MUST come directly from the provided tutorial content. Do NOT introduce any theory, concept, term, syntax, function, example, or fact that is NOT explicitly mentioned or demonstrated in the provided content. If something is not in the tutorial text, do NOT ask about it — even if it is related to the topic. The tutorial content is the ONLY source of truth.
- Questions must test real understanding, not just trivial facts
- Include conceptual, practical, and application-based questions
- Each question must be clearly answerable from the provided content
- The correct_answer should be SHORT (1-3 words max for one_word, exact output for code_output)
- Provide synonyms (alternative accepted answers) when applicable — e.g., if answer is "int", synonyms could be ["INT", "Int"]
- Synonyms are alternative spellings, capitalizations, or equivalent terms that should also be accepted
- Always generate a helpful hint that nudges toward the answer without revealing it
- Always generate a detailed explanation of WHY the correct answer is correct
- Auto-assign points: easy=1, medium=2, hard=3
- Generate a short unique code for each question (e.g., "ow-c-data-types-01")
- is_case_sensitive: set to false for most questions (accept any case), true only when exact casing matters (e.g., code output)
- CRITICAL: Vary question types throughout — do NOT cluster same types together

CODE FORMATTING RULE:
- When including code snippets in question_text, hint, or explanation, ALWAYS wrap them in markdown triple backtick fences with the language tag (e.g. \`\`\`c, \`\`\`python, \`\`\`java).
- For inline code references (variable names, function names, keywords), wrap them in single backticks (e.g. \`printf\`, \`int\`).
- For correct_answer field, do NOT use backticks — keep it as plain text since it must be matched exactly.

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "questions": [
    {
      "code": "ow-short-unique-code",
      "question_text": "The question text in English",
      "question_type": "one_word",
      "difficulty_level": "easy",
      "points": 1,
      "correct_answer": "int",
      "synonyms": ["INT", "Int"],
      "hint": "A helpful hint without giving away the answer",
      "explanation": "Detailed explanation of the correct answer",
      "is_case_sensitive": false
    }
  ]
}`;

      let aiResult;
      try {
        aiResult = await callAI(provider, systemPrompt, contentForAI, isAutoCount ? 65536 : Math.max(8192, numQ * 2048));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;
      } catch (aiErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `AI call failed: ${aiErr.message}` });
        continue;
      }

      let parsed: any;
      try {
        parsed = parseJSON(aiResult.text);
      } catch (parseErr: any) {
        console.error(`OW JSON parse error for sub-topic ${st.sub_topic_id}:`, parseErr.message, 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned invalid JSON' });
        continue;
      }

      const questions = parsed.questions || (Array.isArray(parsed) ? parsed : []);
      if (!questions.length) {
        console.error(`OW no questions for sub-topic ${st.sub_topic_id}. Parsed keys:`, Object.keys(parsed || {}), 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned no questions' });
        continue;
      }

      console.log(`OW: AI generated ${questions.length} questions for sub-topic ${st.sub_topic_id} (${subTopic?.name}). Types: ${questions.map((q: any) => q.question_type).join(', ')}`);

      let stQuestionsCreated = 0;
      let stSynonymsCreated = 0;
      let stTranslationsCreated = 0;
      const createdQuestionIds: number[] = [];
      const stTranslationsCreatedLangs: string[] = [];

      // ─── BATCH PHASE 1: Prepare all questions and generate slugs ───
      const validQuestions: any[] = [];
      for (const q of questions) {
        if (!q.question_text || !q.correct_answer) continue;
        const questionType = ['one_word', 'fill_in_the_blank', 'code_output'].includes(q.question_type) ? q.question_type : 'one_word';
        const diffLevel = ['easy', 'medium', 'hard'].includes(q.difficulty_level) ? q.difficulty_level : 'medium';
        const code = (q.code || `ow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 80);
        const slug = await generateUniqueSlug(supabase, 'one_word_questions', code, undefined, { column: 'topic_id', value: topic_id });
        validQuestions.push({ ...q, _questionType: questionType, _diffLevel: diffLevel, _code: code, _slug: slug, _displayOrder: nextDisplayOrder++ });
      }

      if (validQuestions.length === 0) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'No valid questions generated' });
        continue;
      }

      // ─── BATCH PHASE 2: Bulk insert all one_word_questions at once ───
      const questionInserts = validQuestions.map(q => ({
        topic_id,
        code: q._code,
        slug: q._slug,
        question_type: q._questionType,
        difficulty_level: q._diffLevel,
        points: q.points || (q._diffLevel === 'easy' ? 1 : q._diffLevel === 'medium' ? 2 : 3),
        display_order: q._displayOrder,
        is_mandatory: false,
        is_active: true,
        is_case_sensitive: q.is_case_sensitive === true,
        is_trim_whitespace: true,
        created_by: userId,
      }));

      const { data: newQuestions, error: bulkQErr } = await supabase
        .from('one_word_questions')
        .insert(questionInserts)
        .select('id, code, display_order');

      if (bulkQErr || !newQuestions || newQuestions.length === 0) {
        console.error(`OW bulk insert failed for sub-topic ${st.sub_topic_id}:`, bulkQErr?.message, 'First insert:', JSON.stringify(questionInserts[0]));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `DB insert failed: ${bulkQErr?.message || 'unknown'}` });
        continue;
      }

      // Map new question IDs back to validQuestions by display_order
      const questionIdMap = new Map<number, number>();
      for (const nq of newQuestions) {
        questionIdMap.set(nq.display_order, nq.id);
        createdQuestionIds.push(nq.id);
      }
      stQuestionsCreated = newQuestions.length;

      // ─── BATCH PHASE 3: Bulk insert English one_word_question_translations (with correct_answer) ───
      const qTransInserts: any[] = [];
      for (const q of validQuestions) {
        const qId = questionIdMap.get(q._displayOrder);
        if (!qId) continue;
        qTransInserts.push({
          one_word_question_id: qId,
          language_id: 7,
          question_text: q.question_text,
          correct_answer: q.correct_answer,
          hint: q.hint || null,
          explanation: q.explanation || null,
          is_active: true,
          created_by: userId,
        });
      }
      if (qTransInserts.length > 0) {
        const { error: qTransErr } = await supabase.from('one_word_question_translations').insert(qTransInserts);
        if (qTransErr) console.error('OW question translation insert error:', qTransErr.message);
      }

      // ─── BATCH PHASE 4: Bulk insert synonyms + English synonym translations ───
      const questionSynonymIds: Map<number, { id: number; synonymText: string; displayOrder: number }[]> = new Map();

      for (const q of validQuestions) {
        const qId = questionIdMap.get(q._displayOrder);
        if (!qId) continue;
        if (!q.synonyms || !Array.isArray(q.synonyms) || q.synonyms.length === 0) continue;

        // Batch insert all synonyms for this question
        const synInserts = q.synonyms
          .filter((s: any) => typeof s === 'string' && s.trim())
          .map((s: any, si: number) => ({
            one_word_question_id: qId,
            display_order: si + 1,
            is_active: true,
            created_by: userId,
          }));

        if (synInserts.length === 0) continue;

        const { data: newSyns, error: synErr } = await supabase
          .from('one_word_synonyms')
          .insert(synInserts)
          .select('id, display_order');

        if (synErr || !newSyns) continue;
        stSynonymsCreated += newSyns.length;

        // Build English synonym translations for batch insert
        const synIdList: { id: number; synonymText: string; displayOrder: number }[] = [];
        const validSyns = q.synonyms.filter((s: any) => typeof s === 'string' && s.trim());
        const allSynTransInserts: any[] = [];
        for (const ns of newSyns) {
          const matchingSyn = validSyns[ns.display_order - 1];
          if (matchingSyn) {
            allSynTransInserts.push({
              one_word_synonym_id: ns.id,
              language_id: 7,
              synonym_text: matchingSyn,
              is_active: true,
              created_by: userId,
            });
            synIdList.push({ id: ns.id, synonymText: matchingSyn, displayOrder: ns.display_order });
          }
        }
        if (allSynTransInserts.length > 0) {
          await supabase.from('one_word_synonym_translations').insert(allSynTransInserts);
        }
        questionSynonymIds.set(qId, synIdList);
      }

      // ─── BATCH PHASE 5: BATCH translate ALL questions in ONE AI call ───
      if (auto_translate && materialLangs.length > 0 && validQuestions.length > 0) {
        try {
          const batchItems = validQuestions.map((q, idx) => {
            const validSyns = (q.synonyms || []).filter((s: any) => typeof s === 'string' && s.trim());
            return {
              index: idx + 1,
              question_text: q.question_text,
              correct_answer: q.correct_answer,
              hint_text: q.hint || '',
              explanation_text: q.explanation || '',
              synonyms: validSyns,
            };
          });

          const batchTranslatePrompt = `Translate ALL ${batchItems.length} one-word/short-answer questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${materialLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
correct_answer: "${item.correct_answer}"
hint_text: "${item.hint_text}"
explanation_text: "${item.explanation_text}"
synonyms: ${JSON.stringify(item.synonyms)}`).join('\n')}

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें।" — WRONG

IMPORTANT: For correct_answer and synonyms — if the answer is a technical keyword, code term, or programming construct, keep it EXACTLY as-is in ALL languages (do NOT translate "int", "printf", "void", etc.). Only translate if the answer is a natural language word.

CODE FORMATTING RULE: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks (\`code\`).

Return ONLY valid JSON with this EXACT structure (array of translations, one per question, in the SAME ORDER):
{
  "translations": [
    {
      "index": 1,
      "${materialLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "correct_answer": "...",
        "hint_text": "...",
        "explanation_text": "...",
        "synonyms": ["syn1", "syn2"]
      }
    },
    {
      "index": 2,
      "${materialLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "correct_answer": "...",
        "hint_text": "...",
        "explanation_text": "...",
        "synonyms": ["syn1"]
      }
    }
  ]
}`;

          const transMaxTokens = Math.max(8192, validQuestions.length * materialLangs.length * 1024);
          const transResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
          totalInputTokens += transResult.inputTokens;
          totalOutputTokens += transResult.outputTokens;

          const transData = parseJSON(transResult.text);
          const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

          // Process each translated question
          const allQTransInserts: any[] = [];
          const allSynTransInserts: any[] = [];

          for (let qi = 0; qi < validQuestions.length; qi++) {
            const q = validQuestions[qi];
            const qId = questionIdMap.get(q._displayOrder);
            if (!qId) continue;

            const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
            if (!transEntry) continue;

            const synIds = questionSynonymIds.get(qId) || [];

            for (const lang of materialLangs) {
              const langData = transEntry[lang.iso_code];
              if (!langData) continue;

              // Queue question translation
              allQTransInserts.push({
                one_word_question_id: qId,
                language_id: lang.id,
                question_text: langData.question_text || q.question_text,
                correct_answer: langData.correct_answer || q.correct_answer,
                hint: langData.hint_text || langData.hint || null,
                explanation: langData.explanation_text || langData.explanation || null,
                is_active: true,
                created_by: userId,
              });
              stTranslationsCreated++;
              if (!stTranslationsCreatedLangs.includes(lang.name)) stTranslationsCreatedLangs.push(lang.name);

              // Queue synonym translations
              if (langData.synonyms && Array.isArray(langData.synonyms)) {
                for (let si = 0; si < Math.min(langData.synonyms.length, synIds.length); si++) {
                  allSynTransInserts.push({
                    one_word_synonym_id: synIds[si].id,
                    language_id: lang.id,
                    synonym_text: langData.synonyms[si],
                    is_active: true,
                    created_by: userId,
                  });
                }
              }
            }
          }

          // Bulk insert all translated question translations
          if (allQTransInserts.length > 0) {
            for (let bi = 0; bi < allQTransInserts.length; bi += 100) {
              await supabase.from('one_word_question_translations').insert(allQTransInserts.slice(bi, bi + 100));
            }
          }

          // Bulk insert all translated synonym translations
          if (allSynTransInserts.length > 0) {
            for (let bi = 0; bi < allSynTransInserts.length; bi += 100) {
              await supabase.from('one_word_synonym_translations').insert(allSynTransInserts.slice(bi, bi + 100));
            }
          }
        } catch (transErr: any) {
          console.error('OW batch translation error:', transErr.message);
        }
      }

      totalQuestionsCreated += stQuestionsCreated;
      totalSynonymsCreated += stSynonymsCreated;
      totalTranslationsCreated += stTranslationsCreated;

      results.push({
        sub_topic_id: st.sub_topic_id,
        sub_topic_name: subTopic?.name || subTopic?.slug,
        status: 'success',
        questions_created: stQuestionsCreated,
        synonyms_created: stSynonymsCreated,
        translations_created: stTranslationsCreated,
        translations_languages: stTranslationsCreatedLangs,
        question_ids: createdQuestionIds,
      });
    }

    // Clear OW caches
    await redis.del('one_word_questions:all');
    await redis.del('one_word_question_translations:all');

    // Collect all created question IDs across sub-topics
    const allCreatedIds = results.flatMap((r: any) => r.question_ids || []);

    // Fetch full question details for the response
    let questions: any[] = [];
    if (allCreatedIds.length > 0) {
      const { data: qRows } = await supabase
        .from('one_word_questions')
        .select('id, code, slug, question_type, difficulty_level, points, display_order, is_case_sensitive, is_trim_whitespace')
        .in('id', allCreatedIds)
        .order('display_order');

      for (const qr of (qRows || [])) {
        // Get English translation
        const { data: engTrans } = await supabase
          .from('one_word_question_translations')
          .select('question_text, correct_answer, hint, explanation')
          .eq('one_word_question_id', qr.id)
          .eq('language_id', 7)
          .single();

        // Get synonyms with English text
        const { data: syns } = await supabase
          .from('one_word_synonyms')
          .select('id, display_order')
          .eq('one_word_question_id', qr.id)
          .is('deleted_at', null)
          .order('display_order');

        const synonymDetails: any[] = [];
        for (const syn of (syns || [])) {
          const { data: synTrans } = await supabase
            .from('one_word_synonym_translations')
            .select('synonym_text')
            .eq('one_word_synonym_id', syn.id)
            .eq('language_id', 7)
            .single();
          synonymDetails.push({
            id: syn.id,
            synonym_text: synTrans?.synonym_text || '',
          });
        }

        // Get which languages have translations
        const { data: langTrans } = await supabase
          .from('one_word_question_translations')
          .select('language_id, languages(name)')
          .eq('one_word_question_id', qr.id)
          .neq('language_id', 7)
          .is('deleted_at', null);
        const translatedLangs = (langTrans || []).map((lt: any) => lt.languages?.name || '').filter(Boolean);

        questions.push({
          one_word_question_id: qr.id,
          code: qr.code,
          slug: qr.slug,
          question_type: qr.question_type,
          difficulty_level: qr.difficulty_level,
          points: qr.points,
          is_case_sensitive: qr.is_case_sensitive,
          is_trim_whitespace: qr.is_trim_whitespace,
          question_text: engTrans?.question_text || '',
          correct_answer: engTrans?.correct_answer || '',
          hint_text: engTrans?.hint || null,
          explanation_text: engTrans?.explanation || null,
          synonyms: synonymDetails,
          translations_created: translatedLangs,
        });
      }
    }

    // Log admin activity (non-blocking — never let this kill the response)
    try {
      logAdmin({
        actorId: userId,
        action: 'ow_auto_generated',
        targetType: 'one_word_question',
        targetId: topic_id,
        targetName: topic.name || topic.slug,
        changes: { questions_created: totalQuestionsCreated, synonyms_created: totalSynonymsCreated, translations_created: totalTranslationsCreated },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('OW logAdmin error (non-fatal):', logErr.message);
    }

    console.log(`OW generation complete: ${totalQuestionsCreated} questions, ${totalSynonymsCreated} synonyms, ${totalTranslationsCreated} translations`);

    return ok(res, {
      questions,
      results,
      summary: {
        sub_topics_processed: results.length,
        sub_topics_success: results.filter((r: any) => r.status === 'success').length,
        sub_topics_error: results.filter((r: any) => r.status === 'error').length,
        total_questions_created: totalQuestionsCreated,
        total_synonyms_created: totalSynonymsCreated,
        total_translations_created: totalTranslationsCreated,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Generated ${totalQuestionsCreated} one-word questions with ${totalSynonymsCreated} synonyms`);
  } catch (error: any) {
    console.error('autoGenerateOw error:', error);
    return err(res, error.message || 'Failed to auto-generate one-word questions', 500);
  }
}

// ─── Auto-Translate Existing One Word Questions ─────────────────────────────
/**
 * POST /ai/auto-translate-ow
 * Translates existing English one-word questions + synonyms to all material languages.
 *
 * Body: {
 *   topic_id?: number (translate all questions under topic),
 *   question_ids?: number[] (translate specific questions),
 *   provider?: 'anthropic' | 'openai' | 'gemini'
 * }
 */
export async function autoTranslateOw(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { topic_id, question_ids, provider: reqProvider } = req.body;
    if (!topic_id && (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0)) {
      return err(res, 'topic_id or question_ids[] is required', 400);
    }
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Get target languages (non-English material languages)
    const { data: materialLangs } = await supabase
      .from('languages')
      .select('id, iso_code, name')
      .eq('is_active', true)
      .eq('for_material', true)
      .neq('id', 7)
      .order('id');
    if (!materialLangs || materialLangs.length === 0) return err(res, 'No target languages found', 404);

    // Find questions to translate
    let questionsQuery = supabase
      .from('one_word_questions')
      .select('id, code, slug, topic_id')
      .is('deleted_at', null)
      .eq('is_active', true);

    if (question_ids && question_ids.length > 0) {
      questionsQuery = questionsQuery.in('id', question_ids);
    } else {
      questionsQuery = questionsQuery.eq('topic_id', topic_id);
    }

    const { data: questions, error: qErr } = await questionsQuery;
    if (qErr) return err(res, qErr.message, 500);
    if (!questions || questions.length === 0) return err(res, 'No questions found to translate', 404);

    let totalTranslated = 0;
    let totalErrors = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const results: any[] = [];

    // ─── PHASE 1: Gather all question data and find missing languages ───
    type QueuedOwQuestion = {
      question_id: number;
      engText: string;
      engCorrectAnswer: string;
      engHint: string;
      engExplanation: string;
      engSynonyms: string[];
      synonyms: { id: number; display_order: number }[];
      missingLangs: typeof materialLangs;
    };
    const translationQueue: QueuedOwQuestion[] = [];

    for (const question of questions) {
      // Get English question translation
      const { data: engQTrans } = await supabase
        .from('one_word_question_translations')
        .select('question_text, correct_answer, hint, explanation')
        .eq('one_word_question_id', question.id)
        .eq('language_id', 7)
        .is('deleted_at', null)
        .single();

      if (!engQTrans || !engQTrans.question_text) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'No English translation' });
        continue;
      }

      // Find which languages are missing
      const { data: existingTrans } = await supabase
        .from('one_word_question_translations')
        .select('language_id')
        .eq('one_word_question_id', question.id)
        .is('deleted_at', null);
      const existingLangIds = new Set((existingTrans || []).map(t => t.language_id));
      const missingLangs = materialLangs.filter(l => !existingLangIds.has(l.id));
      if (missingLangs.length === 0) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'All languages exist' });
        continue;
      }

      // Get English synonym texts
      const { data: synonyms } = await supabase
        .from('one_word_synonyms')
        .select('id, display_order')
        .eq('one_word_question_id', question.id)
        .is('deleted_at', null)
        .order('display_order');

      const synonymIds = (synonyms || []).map(s => s.id);
      let engSynonymTexts: string[] = [];
      if (synonymIds.length > 0) {
        const { data: engSTrans } = await supabase
          .from('one_word_synonym_translations')
          .select('one_word_synonym_id, synonym_text')
          .in('one_word_synonym_id', synonymIds)
          .eq('language_id', 7)
          .is('deleted_at', null);
        engSynonymTexts = (synonyms || []).map(s => {
          const t = (engSTrans || []).find(t => t.one_word_synonym_id === s.id);
          return t?.synonym_text || '';
        });
      }

      translationQueue.push({
        question_id: question.id,
        engText: engQTrans.question_text,
        engCorrectAnswer: engQTrans.correct_answer || '',
        engHint: engQTrans.hint || '',
        engExplanation: engQTrans.explanation || '',
        engSynonyms: engSynonymTexts,
        synonyms: synonyms || [],
        missingLangs,
      });
    }

    // ─── PHASE 2: Batch translate in chunks (max 10 questions per AI call) ───
    const BATCH_SIZE = 10;
    for (let bi = 0; bi < translationQueue.length; bi += BATCH_SIZE) {
      const batch = translationQueue.slice(bi, bi + BATCH_SIZE);
      const allMissingLangs = materialLangs;

      try {
        const batchItems = batch.map((item, idx) => ({
          index: idx + 1,
          question_text: item.engText,
          correct_answer: item.engCorrectAnswer,
          hint_text: item.engHint,
          explanation_text: item.engExplanation,
          synonyms: item.engSynonyms,
        }));

        const batchTranslatePrompt = `Translate ALL ${batchItems.length} one-word/short-answer questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${allMissingLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
correct_answer: "${item.correct_answer}"
hint_text: "${item.hint_text}"
explanation_text: "${item.explanation_text}"
synonyms: ${JSON.stringify(item.synonyms)}`).join('\n')}

MOST IMPORTANT RULE:
Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
GOOD (Hindi): "HTML5 की Fundamentals सीखें।"
BAD (Hindi): "एचटीएमएल5 की मूल बातें।"

IMPORTANT: For correct_answer and synonyms — if the answer is a technical keyword, code term, or programming construct, keep it EXACTLY as-is in ALL languages (do NOT translate "int", "printf", "void", etc.). Only translate if the answer is a natural language word.

CODE FORMATTING RULE: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks (\`code\`).

Return ONLY valid JSON:
{
  "translations": [
    {
      "index": 1,
      "${allMissingLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "correct_answer": "...",
        "hint_text": "...",
        "explanation_text": "...",
        "synonyms": ["syn1", "syn2"]
      }
    }
  ]
}`;

        const transMaxTokens = Math.max(8192, batch.length * allMissingLangs.length * 1024);
        const aiResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;

        const transData = parseJSON(aiResult.text);
        const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

        // Process each question's translations and batch DB inserts
        const allQTransInserts: any[] = [];
        const allSynTransInserts: any[] = [];

        for (let qi = 0; qi < batch.length; qi++) {
          const item = batch[qi];
          const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
          if (!transEntry) {
            results.push({ question_id: item.question_id, status: 'error', error: 'No translation returned' });
            totalErrors++;
            continue;
          }

          let langsDone = 0;

          for (const lang of item.missingLangs) {
            const langData = transEntry[lang.iso_code];
            if (!langData) continue;

            allQTransInserts.push({
              one_word_question_id: item.question_id,
              language_id: lang.id,
              question_text: langData.question_text || item.engText,
              correct_answer: langData.correct_answer || item.engCorrectAnswer,
              hint: langData.hint_text || langData.hint || null,
              explanation: langData.explanation_text || langData.explanation || null,
              is_active: true,
              created_by: userId,
            });
            langsDone++;

            if (langData.synonyms && Array.isArray(langData.synonyms)) {
              for (let si = 0; si < Math.min(langData.synonyms.length, item.synonyms.length); si++) {
                allSynTransInserts.push({
                  one_word_synonym_id: item.synonyms[si].id,
                  language_id: lang.id,
                  synonym_text: langData.synonyms[si],
                  is_active: true,
                  created_by: userId,
                });
              }
            }
          }

          totalTranslated += langsDone;
          results.push({ question_id: item.question_id, status: 'success', languages_added: langsDone });
        }

        // Bulk insert all translations
        if (allQTransInserts.length > 0) {
          for (let ci = 0; ci < allQTransInserts.length; ci += 100) {
            await supabase.from('one_word_question_translations').insert(allQTransInserts.slice(ci, ci + 100));
          }
        }
        if (allSynTransInserts.length > 0) {
          for (let ci = 0; ci < allSynTransInserts.length; ci += 100) {
            await supabase.from('one_word_synonym_translations').insert(allSynTransInserts.slice(ci, ci + 100));
          }
        }
      } catch (batchErr: any) {
        console.error('OW batch translation error:', batchErr.message);
        for (const item of batch) {
          totalErrors++;
          results.push({ question_id: item.question_id, status: 'error', error: batchErr.message });
        }
      }
    }

    // Clear caches
    await redis.del('one_word_question_translations:all');
    await redis.del('one_word_questions:all');

    try {
      logAdmin({
        actorId: userId,
        action: 'ow_auto_translated',
        targetType: 'one_word_question',
        targetId: topic_id || 0,
        targetName: `${questions.length} questions`,
        changes: { total_translated: totalTranslated, errors: totalErrors },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('OW translate logAdmin error (non-fatal):', logErr.message);
    }

    return ok(res, {
      results,
      summary: {
        questions_processed: questions.length,
        translations_created: totalTranslated,
        errors: totalErrors,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Translated ${totalTranslated} question translations across ${questions.length} questions`);
  } catch (error: any) {
    console.error('autoTranslateOw error:', error);
    return err(res, error.message || 'Failed to auto-translate one-word questions', 500);
  }
}

// ─── Auto-Generate Descriptive Questions ─────────────────────────────────────
/**
 * POST /ai/auto-generate-desc
 * Reads sub-topic tutorial HTML from Bunny CDN, sends to AI, and bulk-creates
 * descriptive_questions + descriptive_question_translations.
 *
 * Body: {
 *   topic_id: number,
 *   sub_topic_id?: number,
 *   num_questions?: number (0 = AI decides),
 *   difficulty_mix?: 'auto' | 'easy' | 'medium' | 'hard' | 'mixed',
 *   answer_types?: ('short_answer' | 'long_answer')[],
 *   provider?: 'anthropic' | 'openai' | 'gemini',
 *   auto_translate?: boolean
 * }
 */
export async function autoGenerateDesc(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const {
      topic_id,
      sub_topic_id,
      num_questions = 0,
      difficulty_mix,
      answer_types = ['short_answer', 'long_answer'],
      provider: reqProvider,
      auto_translate = false,
    } = req.body;

    if (!topic_id) return err(res, 'topic_id is required', 400);
    const rawNumQ = parseInt(num_questions) || 0;
    const isAutoCount = rawNumQ <= 0;
    const numQ = isAutoCount ? 0 : Math.max(1, rawNumQ);
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Validate topic exists
    const { data: topic } = await supabase.from('topics').select('id, slug, name').eq('id', topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);

    // Find sub-topics with English tutorial pages
    let subTopicQuery = supabase
      .from('sub_topic_translations')
      .select('sub_topic_id, page, sub_topics!inner(id, slug, name, topic_id)')
      .eq('language_id', 7)
      .eq('sub_topics.topic_id', topic_id)
      .not('page', 'is', null)
      .is('deleted_at', null);

    if (sub_topic_id) {
      subTopicQuery = subTopicQuery.eq('sub_topic_id', sub_topic_id);
    }

    const { data: subTopicTranslations, error: stErr } = await subTopicQuery;
    if (stErr) return err(res, stErr.message, 500);
    if (!subTopicTranslations || subTopicTranslations.length === 0) {
      return err(res, 'No sub-topics with English tutorial pages found for this topic', 404);
    }

    // Helper to strip HTML
    function stripHtml(html: string): string {
      return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Get max display_order for existing questions in this topic
    const { data: existingQs } = await supabase
      .from('descriptive_questions')
      .select('display_order')
      .eq('topic_id', topic_id)
      .is('deleted_at', null)
      .order('display_order', { ascending: false })
      .limit(1);
    let nextDisplayOrder = ((existingQs?.[0]?.display_order) || 0) + 1;

    // Get material languages for translation
    let materialLangs: any[] = [];
    if (auto_translate) {
      const { data: langs } = await supabase
        .from('languages')
        .select('id, iso_code, name')
        .eq('is_active', true)
        .eq('for_material', true)
        .neq('id', 7)
        .order('id');
      materialLangs = langs || [];
    }

    const results: any[] = [];
    let totalQuestionsCreated = 0;
    let totalTranslationsCreated = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Process each sub-topic
    for (const st of subTopicTranslations) {
      const subTopic = (st as any).sub_topics;
      const pageUrl = st.page;
      if (!pageUrl) continue;

      // Download HTML from Bunny CDN
      const cdnPath = pageUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
      let htmlContent: string;
      try {
        htmlContent = await downloadBunnyFile(cdnPath);
      } catch (downloadErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `Failed to download HTML: ${downloadErr.message}` });
        continue;
      }

      const plainText = stripHtml(htmlContent);
      if (!plainText || plainText.length < 50) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'skipped', error: 'Tutorial content too short' });
        continue;
      }
      const contentForAI = plainText.length > 30000 ? plainText.slice(0, 30000) : plainText;

      // Build difficulty instruction
      const diffMode = typeof difficulty_mix === 'string' ? difficulty_mix : 'auto';
      let difficultyInstruction = '';
      if (diffMode === 'easy') difficultyInstruction = 'ALL questions should be EASY difficulty (factual recall, basic definitions).';
      else if (diffMode === 'medium') difficultyInstruction = 'ALL questions should be MEDIUM difficulty (understanding concepts, applying knowledge).';
      else if (diffMode === 'hard') difficultyInstruction = 'ALL questions should be HARD difficulty (analysis, comparison, deeper reasoning).';
      else if (diffMode === 'mixed' && !isAutoCount) {
        const easyCount = Math.round(numQ * 0.3);
        const hardCount = Math.round(numQ * 0.2);
        const mediumCount = numQ - easyCount - hardCount;
        difficultyInstruction = `Distribute difficulty: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard.`;
      } else {
        difficultyInstruction = 'Automatically distribute difficulty (easy/medium/hard) based on content complexity — more easy questions for introductory content, more hard for advanced/complex content. Use your best judgment.';
      }

      const typesList = Array.isArray(answer_types) && answer_types.length > 0 ? answer_types : ['short_answer', 'long_answer'];

      // Build type distribution instruction
      const hasShort = typesList.includes('short_answer');
      const hasLong = typesList.includes('long_answer');
      let typeDistribution = '';
      if (hasShort && hasLong) {
        typeDistribution = `You MUST use BOTH answer types with this approximate distribution:
- short_answer: ~60% of questions (1-3 sentences, 20-100 words, testing specific concepts — definitions, comparisons, quick explanations)
- long_answer: ~40% of questions (paragraph-level, 100-500 words, testing deeper understanding — detailed explanations, code walkthroughs, multi-step reasoning)
DO NOT generate only one type. You MUST mix both types.`;
      } else if (hasShort) {
        typeDistribution = `Generate ONLY short_answer questions (1-3 sentences, 20-100 words).`;
      } else {
        typeDistribution = `Generate ONLY long_answer questions (paragraph-level, 100-500 words).`;
      }

      const quantityInstruction = isAutoCount
        ? `Generate ALL possible meaningful descriptive questions from the content. There is NO LIMIT — generate as many as the content supports.

YOUR GOAL IS EXHAUSTIVE, COMPREHENSIVE COVERAGE:
- Create questions for EVERY concept, definition, rule, syntax element, example, and important detail
- Include INTERVIEW-LEVEL questions that test deep understanding, not just surface recall
- Cover ALL cognitive levels: understanding, application, analysis, evaluation
- For code/programming content: test explanations of code behavior, design choices, debugging reasoning
- For theoretical content: test definitions, comparisons, cause-effect relationships, real-world applications
- Do NOT skip ANY teachable point — if it's mentioned in the tutorial, create questions about it
- Create multiple questions from different angles for important concepts
- Each question must be UNIQUE — different angle, different depth, or different aspect
- Generate 15-40+ questions for rich content — DO NOT artificially limit yourself
- More content = more questions. Short tutorials = 10-15, medium = 15-25, long/detailed = 25-40+`
        : `Generate EXACTLY ${numQ} descriptive questions based on the content.`;

      const systemPrompt = `You are an expert educational content analyst for GrowUpMore — an online learning platform.
Read the provided tutorial content and generate descriptive (written answer) questions based on it.

Sub-topic: "${subTopic?.name || subTopic?.slug}"
Topic: "${topic.name || topic.slug}"

QUANTITY: ${quantityInstruction}

DIFFICULTY: ${difficultyInstruction}

ANSWER TYPE DISTRIBUTION (STRICTLY FOLLOW):
${typeDistribution}

RULES FOR EACH ANSWER TYPE:
- "short_answer": Quick explanations, definitions, comparisons. min_words=20, max_words=100. Questions like "Define...", "What is the difference between...", "Name and briefly explain..."
- "long_answer": Detailed explanations, code walkthroughs, multi-step reasoning. min_words=100, max_words=500. Questions like "Explain in detail...", "Compare and contrast...", "What would happen if... and why?"

IMPORTANT GUIDELINES:
- STRICTLY CONTENT-BOUND: Every question MUST come directly from the provided tutorial content. Do NOT introduce any theory, concept, term, syntax, function, example, or fact that is NOT explicitly mentioned or demonstrated in the provided content. If something is not in the tutorial text, do NOT ask about it — even if it is related to the topic. The tutorial content is the ONLY source of truth.
- Questions should test UNDERSTANDING, not just recall — use "Explain why...", "Compare and contrast...", "What would happen if...", "Describe how..."
- The explanation field should contain a comprehensive MODEL ANSWER that covers all key points a student should mention
- For short_answer: model answer should be 1-3 concise sentences covering the essential points
- For long_answer: model answer should be a thorough paragraph covering all aspects, with examples where appropriate
- Always generate a helpful hint that nudges toward the answer without revealing it
- Auto-assign points: easy=1, medium=2, hard=3
- Generate a short unique code for each question (e.g., "desc-c-pointers-01")
- CRITICAL: Vary answer types throughout — do NOT cluster same types together

CODE FORMATTING RULE:
- When including code snippets in question_text, hint, or explanation, ALWAYS wrap them in markdown triple backtick fences with the language tag (e.g. \`\`\`c, \`\`\`python, \`\`\`java).
- For inline code references (variable names, function names, keywords), wrap them in single backticks (e.g. \`printf\`, \`int\`).

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "questions": [
    {
      "code": "desc-c-pointers-01",
      "question_text": "Explain the difference between a pointer and a reference in C.",
      "answer_type": "short_answer",
      "difficulty_level": "medium",
      "points": 2,
      "min_words": 30,
      "max_words": 100,
      "hint": "Think about memory addresses vs aliases...",
      "explanation": "A pointer stores the memory address of a variable and can be reassigned, re-pointed to NULL, and supports pointer arithmetic. A reference is an alias for an existing variable..."
    }
  ]
}`;

      let aiResult;
      try {
        aiResult = await callAI(provider, systemPrompt, contentForAI, isAutoCount ? 65536 : Math.max(8192, numQ * 2048));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;
      } catch (aiErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `AI call failed: ${aiErr.message}` });
        continue;
      }

      let parsed: any;
      try {
        parsed = parseJSON(aiResult.text);
      } catch (parseErr: any) {
        console.error(`DESC JSON parse error for sub-topic ${st.sub_topic_id}:`, parseErr.message, 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned invalid JSON' });
        continue;
      }

      const questions = parsed.questions || (Array.isArray(parsed) ? parsed : []);
      if (!questions.length) {
        console.error(`DESC no questions for sub-topic ${st.sub_topic_id}. Parsed keys:`, Object.keys(parsed || {}), 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned no questions' });
        continue;
      }

      console.log(`DESC: AI generated ${questions.length} questions for sub-topic ${st.sub_topic_id} (${subTopic?.name}). Types: ${questions.map((q: any) => q.answer_type).join(', ')}`);

      let stQuestionsCreated = 0;
      let stTranslationsCreated = 0;
      const createdQuestionIds: number[] = [];
      const stTranslationsCreatedLangs: string[] = [];

      // ─── BATCH PHASE 1: Prepare all questions and generate slugs ───
      const validQuestions: any[] = [];
      for (const q of questions) {
        if (!q.question_text || !q.explanation) continue;
        const answerType = ['short_answer', 'long_answer'].includes(q.answer_type) ? q.answer_type : 'short_answer';
        const diffLevel = ['easy', 'medium', 'hard'].includes(q.difficulty_level) ? q.difficulty_level : 'medium';
        const code = (q.code || `desc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 80);
        const slug = await generateUniqueSlug(supabase, 'descriptive_questions', code, undefined, { column: 'topic_id', value: topic_id });

        // Set word limits based on answer type
        let minWords = q.min_words;
        let maxWords = q.max_words;
        if (!minWords || !maxWords) {
          if (answerType === 'short_answer') {
            minWords = minWords || 20;
            maxWords = maxWords || 100;
          } else {
            minWords = minWords || 100;
            maxWords = maxWords || 500;
          }
        }

        validQuestions.push({ ...q, _answerType: answerType, _diffLevel: diffLevel, _code: code, _slug: slug, _displayOrder: nextDisplayOrder++, _minWords: minWords, _maxWords: maxWords });
      }

      if (validQuestions.length === 0) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'No valid questions generated' });
        continue;
      }

      // ─── BATCH PHASE 2: Bulk insert all descriptive_questions at once ───
      const questionInserts = validQuestions.map(q => ({
        topic_id,
        code: q._code,
        slug: q._slug,
        answer_type: q._answerType,
        difficulty_level: q._diffLevel,
        points: q.points || (q._diffLevel === 'easy' ? 1 : q._diffLevel === 'medium' ? 2 : 3),
        min_words: q._minWords,
        max_words: q._maxWords,
        display_order: q._displayOrder,
        is_mandatory: false,
        is_active: true,
        created_by: userId,
      }));

      const { data: newQuestions, error: bulkQErr } = await supabase
        .from('descriptive_questions')
        .insert(questionInserts)
        .select('id, code, display_order');

      if (bulkQErr || !newQuestions || newQuestions.length === 0) {
        console.error(`DESC bulk insert failed for sub-topic ${st.sub_topic_id}:`, bulkQErr?.message, 'First insert:', JSON.stringify(questionInserts[0]));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `DB insert failed: ${bulkQErr?.message || 'unknown'}` });
        continue;
      }

      // Map new question IDs back to validQuestions by display_order
      const questionIdMap = new Map<number, number>();
      for (const nq of newQuestions) {
        questionIdMap.set(nq.display_order, nq.id);
        createdQuestionIds.push(nq.id);
      }
      stQuestionsCreated = newQuestions.length;

      // ─── BATCH PHASE 3: Bulk insert English descriptive_question_translations ───
      const qTransInserts: any[] = [];
      for (const q of validQuestions) {
        const qId = questionIdMap.get(q._displayOrder);
        if (!qId) continue;
        qTransInserts.push({
          descriptive_question_id: qId,
          language_id: 7,
          question_text: q.question_text,
          explanation: q.explanation,
          hint: q.hint || null,
          is_active: true,
          created_by: userId,
        });
      }
      if (qTransInserts.length > 0) {
        await supabase.from('descriptive_question_translations').insert(qTransInserts);
      }

      // ─── BATCH PHASE 4: BATCH translate ALL questions in ONE AI call ───
      if (auto_translate && materialLangs.length > 0 && validQuestions.length > 0) {
        try {
          const batchItems = validQuestions.map((q, idx) => ({
            index: idx + 1,
            question_text: q.question_text,
            explanation: q.explanation || '',
            hint: q.hint || '',
          }));

          const batchTranslatePrompt = `Translate ALL ${batchItems.length} descriptive questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${materialLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
explanation: "${item.explanation}"
hint: "${item.hint}"`).join('\n')}

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें।" — WRONG

CODE FORMATTING RULE: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks (\`code\`).

Return ONLY valid JSON with this EXACT structure (array of translations, one per question, in the SAME ORDER):
{
  "translations": [
    {
      "index": 1,
      "${materialLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "explanation": "...",
        "hint": "..."
      }
    },
    {
      "index": 2,
      "${materialLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "explanation": "...",
        "hint": "..."
      }
    }
  ]
}`;

          const transMaxTokens = Math.max(8192, validQuestions.length * materialLangs.length * 1024);
          const transResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
          totalInputTokens += transResult.inputTokens;
          totalOutputTokens += transResult.outputTokens;

          const transData = parseJSON(transResult.text);
          const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

          // Process each translated question
          const allQTransInserts: any[] = [];

          for (let qi = 0; qi < validQuestions.length; qi++) {
            const q = validQuestions[qi];
            const qId = questionIdMap.get(q._displayOrder);
            if (!qId) continue;

            const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
            if (!transEntry) continue;

            for (const lang of materialLangs) {
              const langData = transEntry[lang.iso_code];
              if (!langData) continue;

              allQTransInserts.push({
                descriptive_question_id: qId,
                language_id: lang.id,
                question_text: langData.question_text || q.question_text,
                explanation: langData.explanation || q.explanation,
                hint: langData.hint || null,
                is_active: true,
                created_by: userId,
              });
              stTranslationsCreated++;
              if (!stTranslationsCreatedLangs.includes(lang.name)) stTranslationsCreatedLangs.push(lang.name);
            }
          }

          // Bulk insert all translated question translations
          if (allQTransInserts.length > 0) {
            for (let bi = 0; bi < allQTransInserts.length; bi += 100) {
              await supabase.from('descriptive_question_translations').insert(allQTransInserts.slice(bi, bi + 100));
            }
          }
        } catch (transErr: any) {
          console.error('DESC batch translation error:', transErr.message);
        }
      }

      totalQuestionsCreated += stQuestionsCreated;
      totalTranslationsCreated += stTranslationsCreated;

      results.push({
        sub_topic_id: st.sub_topic_id,
        sub_topic_name: subTopic?.name || subTopic?.slug,
        status: 'success',
        questions_created: stQuestionsCreated,
        translations_created: stTranslationsCreated,
        translations_languages: stTranslationsCreatedLangs,
        question_ids: createdQuestionIds,
      });
    }

    // Clear DESC caches
    await redis.del('descriptive_questions:all');
    await redis.del('descriptive_question_translations:all');

    // Collect all created question IDs across sub-topics
    const allCreatedIds = results.flatMap((r: any) => r.question_ids || []);

    // Fetch full question details for the response
    let questions: any[] = [];
    if (allCreatedIds.length > 0) {
      const { data: qRows } = await supabase
        .from('descriptive_questions')
        .select('id, code, slug, answer_type, difficulty_level, points, min_words, max_words, display_order')
        .in('id', allCreatedIds)
        .order('display_order');

      for (const qr of (qRows || [])) {
        // Get English translation
        const { data: engTrans } = await supabase
          .from('descriptive_question_translations')
          .select('question_text, explanation, hint')
          .eq('descriptive_question_id', qr.id)
          .eq('language_id', 7)
          .single();

        // Get which languages have translations
        const { data: langTrans } = await supabase
          .from('descriptive_question_translations')
          .select('language_id, languages(name)')
          .eq('descriptive_question_id', qr.id)
          .neq('language_id', 7)
          .is('deleted_at', null);
        const translatedLangs = (langTrans || []).map((lt: any) => lt.languages?.name || '').filter(Boolean);

        questions.push({
          descriptive_question_id: qr.id,
          code: qr.code,
          slug: qr.slug,
          answer_type: qr.answer_type,
          difficulty_level: qr.difficulty_level,
          points: qr.points,
          min_words: qr.min_words,
          max_words: qr.max_words,
          question_text: engTrans?.question_text || '',
          explanation: engTrans?.explanation || null,
          hint: engTrans?.hint || null,
          translations_created: translatedLangs,
        });
      }
    }

    // Log admin activity (non-blocking — never let this kill the response)
    try {
      logAdmin({
        actorId: userId,
        action: 'desc_auto_generated',
        targetType: 'descriptive_question',
        targetId: topic_id,
        targetName: topic.name || topic.slug,
        changes: { questions_created: totalQuestionsCreated, translations_created: totalTranslationsCreated },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('DESC logAdmin error (non-fatal):', logErr.message);
    }

    console.log(`DESC generation complete: ${totalQuestionsCreated} questions, ${totalTranslationsCreated} translations`);

    return ok(res, {
      questions,
      results,
      summary: {
        sub_topics_processed: results.length,
        sub_topics_success: results.filter((r: any) => r.status === 'success').length,
        sub_topics_error: results.filter((r: any) => r.status === 'error').length,
        total_questions_created: totalQuestionsCreated,
        total_translations_created: totalTranslationsCreated,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Generated ${totalQuestionsCreated} descriptive questions`);
  } catch (error: any) {
    console.error('autoGenerateDesc error:', error);
    return err(res, error.message || 'Failed to auto-generate descriptive questions', 500);
  }
}

// ─── Auto-Translate Existing Descriptive Questions ───────────────────────────
/**
 * POST /ai/auto-translate-desc
 * Translates existing English descriptive questions to all material languages.
 *
 * Body: {
 *   topic_id?: number (translate all questions under topic),
 *   question_ids?: number[] (translate specific questions),
 *   provider?: 'anthropic' | 'openai' | 'gemini'
 * }
 */
export async function autoTranslateDesc(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { topic_id, question_ids, provider: reqProvider } = req.body;
    if (!topic_id && (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0)) {
      return err(res, 'topic_id or question_ids[] is required', 400);
    }
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Get target languages (non-English material languages)
    const { data: materialLangs } = await supabase
      .from('languages')
      .select('id, iso_code, name')
      .eq('is_active', true)
      .eq('for_material', true)
      .neq('id', 7)
      .order('id');
    if (!materialLangs || materialLangs.length === 0) return err(res, 'No target languages found', 404);

    // Find questions to translate
    let questionsQuery = supabase
      .from('descriptive_questions')
      .select('id, code, slug, topic_id')
      .is('deleted_at', null)
      .eq('is_active', true);

    if (question_ids && question_ids.length > 0) {
      questionsQuery = questionsQuery.in('id', question_ids);
    } else {
      questionsQuery = questionsQuery.eq('topic_id', topic_id);
    }

    const { data: questions, error: qErr } = await questionsQuery;
    if (qErr) return err(res, qErr.message, 500);
    if (!questions || questions.length === 0) return err(res, 'No questions found to translate', 404);

    let totalTranslated = 0;
    let totalErrors = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const results: any[] = [];

    // ─── PHASE 1: Gather all question data and find missing languages ───
    type QueuedDescQuestion = {
      question_id: number;
      engText: string;
      engExplanation: string;
      engHint: string;
      missingLangs: typeof materialLangs;
    };
    const translationQueue: QueuedDescQuestion[] = [];

    for (const question of questions) {
      // Get English question translation
      const { data: engQTrans } = await supabase
        .from('descriptive_question_translations')
        .select('question_text, explanation, hint')
        .eq('descriptive_question_id', question.id)
        .eq('language_id', 7)
        .is('deleted_at', null)
        .single();

      if (!engQTrans || !engQTrans.question_text) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'No English translation' });
        continue;
      }

      // Find which languages are missing
      const { data: existingTrans } = await supabase
        .from('descriptive_question_translations')
        .select('language_id')
        .eq('descriptive_question_id', question.id)
        .is('deleted_at', null);
      const existingLangIds = new Set((existingTrans || []).map(t => t.language_id));
      const missingLangs = materialLangs.filter(l => !existingLangIds.has(l.id));
      if (missingLangs.length === 0) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'All languages exist' });
        continue;
      }

      translationQueue.push({
        question_id: question.id,
        engText: engQTrans.question_text,
        engExplanation: engQTrans.explanation || '',
        engHint: engQTrans.hint || '',
        missingLangs,
      });
    }

    // ─── PHASE 2: Batch translate in chunks (max 10 questions per AI call) ───
    const BATCH_SIZE = 10;
    for (let bi = 0; bi < translationQueue.length; bi += BATCH_SIZE) {
      const batch = translationQueue.slice(bi, bi + BATCH_SIZE);
      const allMissingLangs = materialLangs;

      try {
        const batchItems = batch.map((item, idx) => ({
          index: idx + 1,
          question_text: item.engText,
          explanation: item.engExplanation,
          hint: item.engHint,
        }));

        const batchTranslatePrompt = `Translate ALL ${batchItems.length} descriptive questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${allMissingLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
explanation: "${item.explanation}"
hint: "${item.hint}"`).join('\n')}

MOST IMPORTANT RULE:
Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
GOOD (Hindi): "HTML5 की Fundamentals सीखें।"
BAD (Hindi): "एचटीएमएल5 की मूल बातें।"

CODE FORMATTING RULE: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks (\`code\`).

Return ONLY valid JSON:
{
  "translations": [
    {
      "index": 1,
      "${allMissingLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "explanation": "...",
        "hint": "..."
      }
    }
  ]
}`;

        const transMaxTokens = Math.max(8192, batch.length * allMissingLangs.length * 1024);
        const aiResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;

        const transData = parseJSON(aiResult.text);
        const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

        // Process each question's translations and batch DB inserts
        const allQTransInserts: any[] = [];

        for (let qi = 0; qi < batch.length; qi++) {
          const item = batch[qi];
          const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
          if (!transEntry) {
            results.push({ question_id: item.question_id, status: 'error', error: 'No translation returned' });
            totalErrors++;
            continue;
          }

          let langsDone = 0;

          for (const lang of item.missingLangs) {
            const langData = transEntry[lang.iso_code];
            if (!langData) continue;

            allQTransInserts.push({
              descriptive_question_id: item.question_id,
              language_id: lang.id,
              question_text: langData.question_text || item.engText,
              explanation: langData.explanation || item.engExplanation,
              hint: langData.hint || null,
              is_active: true,
              created_by: userId,
            });
            langsDone++;
          }

          totalTranslated += langsDone;
          results.push({ question_id: item.question_id, status: 'success', languages_added: langsDone });
        }

        // Bulk insert all translations
        if (allQTransInserts.length > 0) {
          for (let ci = 0; ci < allQTransInserts.length; ci += 100) {
            await supabase.from('descriptive_question_translations').insert(allQTransInserts.slice(ci, ci + 100));
          }
        }
      } catch (batchErr: any) {
        console.error('DESC batch translation error:', batchErr.message);
        for (const item of batch) {
          totalErrors++;
          results.push({ question_id: item.question_id, status: 'error', error: batchErr.message });
        }
      }
    }

    // Clear caches
    await redis.del('descriptive_question_translations:all');
    await redis.del('descriptive_questions:all');

    try {
      logAdmin({
        actorId: userId,
        action: 'desc_auto_translated',
        targetType: 'descriptive_question',
        targetId: topic_id || 0,
        targetName: `${questions.length} questions`,
        changes: { total_translated: totalTranslated, errors: totalErrors },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('DESC translate logAdmin error (non-fatal):', logErr.message);
    }

    return ok(res, {
      results,
      summary: {
        questions_processed: questions.length,
        translations_created: totalTranslated,
        errors: totalErrors,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Translated ${totalTranslated} question translations across ${questions.length} questions`);
  } catch (error: any) {
    console.error('autoTranslateDesc error:', error);
    return err(res, error.message || 'Failed to auto-translate descriptive questions', 500);
  }
}

// ─── Auto-Generate Matching Questions ───────────────────────────────────────
/**
 * POST /ai/auto-generate-matching
 * Reads sub-topic tutorial HTML from Bunny CDN, sends to AI, and bulk-creates
 * matching_questions + matching_question_translations + matching_pairs + matching_pair_translations.
 *
 * Body: {
 *   topic_id: number,
 *   sub_topic_id?: number,
 *   num_questions?: number (0 = AI decides),
 *   difficulty_mix?: 'auto' | 'easy' | 'medium' | 'hard' | 'mixed',
 *   provider?: 'anthropic' | 'openai' | 'gemini',
 *   auto_translate?: boolean
 * }
 */
export async function autoGenerateMatching(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const {
      topic_id,
      sub_topic_id,
      num_questions = 0,
      difficulty_mix,
      provider: reqProvider,
      auto_translate = false,
    } = req.body;

    if (!topic_id) return err(res, 'topic_id is required', 400);
    const rawNumQ = parseInt(num_questions) || 0;
    const isAutoCount = rawNumQ <= 0;
    const numQ = isAutoCount ? 0 : Math.max(1, rawNumQ);
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Validate topic exists
    const { data: topic } = await supabase.from('topics').select('id, slug, name').eq('id', topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);

    // Find sub-topics with English tutorial pages
    let subTopicQuery = supabase
      .from('sub_topic_translations')
      .select('sub_topic_id, page, sub_topics!inner(id, slug, name, topic_id)')
      .eq('language_id', 7)
      .eq('sub_topics.topic_id', topic_id)
      .not('page', 'is', null)
      .is('deleted_at', null);

    if (sub_topic_id) {
      subTopicQuery = subTopicQuery.eq('sub_topic_id', sub_topic_id);
    }

    const { data: subTopicTranslations, error: stErr } = await subTopicQuery;
    if (stErr) return err(res, stErr.message, 500);
    if (!subTopicTranslations || subTopicTranslations.length === 0) {
      return err(res, 'No sub-topics with English tutorial pages found for this topic', 404);
    }

    // Helper to strip HTML
    function stripHtml(html: string): string {
      return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Get max display_order for existing questions in this topic
    const { data: existingQs } = await supabase
      .from('matching_questions')
      .select('display_order')
      .eq('topic_id', topic_id)
      .is('deleted_at', null)
      .order('display_order', { ascending: false })
      .limit(1);
    let nextDisplayOrder = ((existingQs?.[0]?.display_order) || 0) + 1;

    // Get material languages for translation
    let materialLangs: any[] = [];
    if (auto_translate) {
      const { data: langs } = await supabase
        .from('languages')
        .select('id, iso_code, name')
        .eq('is_active', true)
        .eq('for_material', true)
        .neq('id', 7)
        .order('id');
      materialLangs = langs || [];
    }

    const results: any[] = [];
    let totalQuestionsCreated = 0;
    let totalPairsCreated = 0;
    let totalTranslationsCreated = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Process each sub-topic
    for (const st of subTopicTranslations) {
      const subTopic = (st as any).sub_topics;
      const pageUrl = st.page;
      if (!pageUrl) continue;

      // Download HTML from Bunny CDN
      const cdnPath = pageUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
      let htmlContent: string;
      try {
        htmlContent = await downloadBunnyFile(cdnPath);
      } catch (downloadErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `Failed to download HTML: ${downloadErr.message}` });
        continue;
      }

      const plainText = stripHtml(htmlContent);
      if (!plainText || plainText.length < 50) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'skipped', error: 'Tutorial content too short' });
        continue;
      }
      const contentForAI = plainText.length > 30000 ? plainText.slice(0, 30000) : plainText;

      // Build difficulty instruction
      const diffMode = typeof difficulty_mix === 'string' ? difficulty_mix : 'auto';
      let difficultyInstruction = '';
      if (diffMode === 'easy') difficultyInstruction = 'ALL questions should be EASY difficulty (factual recall, basic definitions).';
      else if (diffMode === 'medium') difficultyInstruction = 'ALL questions should be MEDIUM difficulty (understanding concepts, applying knowledge).';
      else if (diffMode === 'hard') difficultyInstruction = 'ALL questions should be HARD difficulty (analysis, comparison, deeper reasoning).';
      else if (diffMode === 'mixed' && !isAutoCount) {
        const easyCount = Math.round(numQ * 0.3);
        const hardCount = Math.round(numQ * 0.2);
        const mediumCount = numQ - easyCount - hardCount;
        difficultyInstruction = `Distribute difficulty: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard.`;
      } else {
        difficultyInstruction = 'Automatically distribute difficulty (easy/medium/hard) based on content complexity — more easy questions for introductory content, more hard for advanced/complex content. Use your best judgment.';
      }

      const quantityInstruction = isAutoCount
        ? `Generate ALL possible meaningful matching questions from the content. There is NO LIMIT — generate as many as the content supports.

YOUR GOAL IS EXHAUSTIVE, COMPREHENSIVE COVERAGE:
- Create matching questions for EVERY group of related concepts, definitions, terms, syntax elements, and examples
- Include INTERVIEW-LEVEL matching that tests deep understanding of relationships
- Cover ALL cognitive levels: recall, understanding, application, analysis
- For code/programming content: match syntax with descriptions, functions with return types, keywords with meanings
- For theoretical content: match terms with definitions, concepts with examples, causes with effects
- Do NOT skip ANY teachable grouping — if related items appear in the tutorial, create a matching question
- Create multiple matching questions from different angles for important concept groups
- Each question must be UNIQUE — different grouping, different aspect
- Generate 10-30+ questions for rich content — DO NOT artificially limit yourself
- Each question should have 3-6 pairs (matching items)
- More content = more questions. Short tutorials = 8-12, medium = 12-20, long/detailed = 20-30+`
        : `Generate EXACTLY ${numQ} matching questions based on the content.`;

      const systemPrompt = `You are an expert educational content analyst for GrowUpMore — an online learning platform.
Read the provided tutorial content and generate matching questions (match left items to right items) based on it.

Sub-topic: "${subTopic?.name || subTopic?.slug}"
Topic: "${topic.name || topic.slug}"

QUANTITY: ${quantityInstruction}

DIFFICULTY: ${difficultyInstruction}

IMPORTANT GUIDELINES:
- STRICTLY CONTENT-BOUND: Every question MUST come directly from the provided tutorial content. Do NOT introduce any theory, concept, term, syntax, function, example, or fact that is NOT explicitly mentioned or demonstrated in the provided content. If something is not in the tutorial text, do NOT ask about it — even if it is related to the topic. The tutorial content is the ONLY source of truth.
- Each matching question should have 3-6 pairs of items to match
- Left items are terms/concepts/code, right items are their definitions/descriptions/outputs
- Questions should test real understanding of relationships between concepts
- Always generate a helpful hint that nudges toward the answer without revealing it
- Always generate a detailed explanation of WHY the correct matching is correct
- Auto-assign points: easy=1, medium=2, hard=3
- Generate a short unique code for each question (e.g., "match-c-data-types-01")
- partial_scoring: set to true for questions with 4 or more pairs (allow partial credit), false for 3 or fewer pairs
- CRITICAL: Vary difficulty throughout — do NOT cluster same difficulties together

CODE FORMATTING RULE:
- When including code snippets in question_text, left_text, right_text, hint, or explanation, ALWAYS wrap them in markdown triple backtick fences with the language tag (e.g. \`\`\`c, \`\`\`python, \`\`\`java).
- For inline code references (variable names, function names, keywords), wrap them in single backticks (e.g. \`printf\`, \`int\`).

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "questions": [
    {
      "code": "match-unique-code",
      "question_text": "Match the following terms with their definitions",
      "difficulty_level": "easy",
      "points": 1,
      "partial_scoring": false,
      "hint": "Think about what each term means",
      "explanation": "Detailed explanation of the correct matching",
      "pairs": [
        { "left_text": "HTML", "right_text": "HyperText Markup Language" },
        { "left_text": "CSS", "right_text": "Cascading Style Sheets" },
        { "left_text": "JS", "right_text": "JavaScript" }
      ]
    }
  ]
}`;

      let aiResult;
      try {
        aiResult = await callAI(provider, systemPrompt, contentForAI, isAutoCount ? 65536 : Math.max(8192, numQ * 2048));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;
      } catch (aiErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `AI call failed: ${aiErr.message}` });
        continue;
      }

      let parsed: any;
      try {
        parsed = parseJSON(aiResult.text);
      } catch (parseErr: any) {
        console.error(`MATCHING JSON parse error for sub-topic ${st.sub_topic_id}:`, parseErr.message, 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned invalid JSON' });
        continue;
      }

      const questions = parsed.questions || (Array.isArray(parsed) ? parsed : []);
      if (!questions.length) {
        console.error(`MATCHING no questions for sub-topic ${st.sub_topic_id}. Parsed keys:`, Object.keys(parsed || {}), 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned no questions' });
        continue;
      }

      console.log(`MATCHING: AI generated ${questions.length} questions for sub-topic ${st.sub_topic_id} (${subTopic?.name}).`);

      let stQuestionsCreated = 0;
      let stPairsCreated = 0;
      let stTranslationsCreated = 0;
      const createdQuestionIds: number[] = [];
      const stTranslationsCreatedLangs: string[] = [];

      // ─── BATCH PHASE 1: Prepare all questions and generate slugs ───
      const validQuestions: any[] = [];
      for (const q of questions) {
        if (!q.question_text || !q.pairs || !Array.isArray(q.pairs) || q.pairs.length < 2) continue;
        const diffLevel = ['easy', 'medium', 'hard'].includes(q.difficulty_level) ? q.difficulty_level : 'medium';
        const code = (q.code || `match-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 80);
        const slug = await generateUniqueSlug(supabase, 'matching_questions', code, undefined, { column: 'topic_id', value: topic_id });
        const partialScoring = q.partial_scoring === true || (q.pairs.length >= 4);
        validQuestions.push({ ...q, _diffLevel: diffLevel, _code: code, _slug: slug, _displayOrder: nextDisplayOrder++, _partialScoring: partialScoring });
      }

      if (validQuestions.length === 0) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'No valid questions generated' });
        continue;
      }

      // ─── BATCH PHASE 2: Bulk insert all matching_questions at once ───
      const questionInserts = validQuestions.map(q => ({
        topic_id,
        code: q._code,
        slug: q._slug,
        difficulty_level: q._diffLevel,
        points: q.points || (q._diffLevel === 'easy' ? 1 : q._diffLevel === 'medium' ? 2 : 3),
        partial_scoring: q._partialScoring,
        display_order: q._displayOrder,
        is_mandatory: false,
        is_active: true,
        created_by: userId,
      }));

      const { data: newQuestions, error: bulkQErr } = await supabase
        .from('matching_questions')
        .insert(questionInserts)
        .select('id, code, display_order');

      if (bulkQErr || !newQuestions || newQuestions.length === 0) {
        console.error(`MATCHING bulk insert failed for sub-topic ${st.sub_topic_id}:`, bulkQErr?.message, 'First insert:', JSON.stringify(questionInserts[0]));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `DB insert failed: ${bulkQErr?.message || 'unknown'}` });
        continue;
      }

      // Map new question IDs back to validQuestions by display_order
      const questionIdMap = new Map<number, number>();
      for (const nq of newQuestions) {
        questionIdMap.set(nq.display_order, nq.id);
        createdQuestionIds.push(nq.id);
      }
      stQuestionsCreated = newQuestions.length;

      // ─── BATCH PHASE 3: Bulk insert English matching_question_translations ───
      const qTransInserts: any[] = [];
      for (const q of validQuestions) {
        const qId = questionIdMap.get(q._displayOrder);
        if (!qId) continue;
        qTransInserts.push({
          matching_question_id: qId,
          language_id: 7,
          question_text: q.question_text,
          hint: q.hint || null,
          explanation: q.explanation || null,
          is_active: true,
          created_by: userId,
        });
      }
      if (qTransInserts.length > 0) {
        await supabase.from('matching_question_translations').insert(qTransInserts);
      }

      // ─── BATCH PHASE 4: For each question, bulk insert matching_pairs + English matching_pair_translations ───
      const questionPairIds: Map<number, { id: number; leftText: string; rightText: string; displayOrder: number }[]> = new Map();

      for (const q of validQuestions) {
        const qId = questionIdMap.get(q._displayOrder);
        if (!qId) continue;
        if (!q.pairs || !Array.isArray(q.pairs) || q.pairs.length === 0) continue;

        // Batch insert all pairs for this question
        const pairInserts = q.pairs
          .filter((p: any) => p.left_text && p.right_text)
          .map((p: any, pi: number) => ({
            matching_question_id: qId,
            display_order: pi + 1,
            is_active: true,
            created_by: userId,
          }));

        if (pairInserts.length === 0) continue;

        const { data: newPairs, error: pairErr } = await supabase
          .from('matching_pairs')
          .insert(pairInserts)
          .select('id, display_order');

        if (pairErr || !newPairs) continue;
        stPairsCreated += newPairs.length;

        // Build English pair translations for batch insert
        const pairIdList: { id: number; leftText: string; rightText: string; displayOrder: number }[] = [];
        const validPairs = q.pairs.filter((p: any) => p.left_text && p.right_text);
        const allPairTransInserts: any[] = [];
        for (const np of newPairs) {
          const matchingPair = validPairs[np.display_order - 1];
          if (matchingPair) {
            allPairTransInserts.push({
              matching_pair_id: np.id,
              language_id: 7,
              left_text: matchingPair.left_text,
              right_text: matchingPair.right_text,
              is_active: true,
              created_by: userId,
            });
            pairIdList.push({ id: np.id, leftText: matchingPair.left_text, rightText: matchingPair.right_text, displayOrder: np.display_order });
          }
        }
        if (allPairTransInserts.length > 0) {
          await supabase.from('matching_pair_translations').insert(allPairTransInserts);
        }
        questionPairIds.set(qId, pairIdList);
      }

      // ─── BATCH PHASE 5: BATCH translate ALL questions + pairs in ONE AI call ───
      if (auto_translate && materialLangs.length > 0 && validQuestions.length > 0) {
        try {
          const batchItems = validQuestions.map((q, idx) => {
            const validPairs = (q.pairs || []).filter((p: any) => p.left_text && p.right_text);
            return {
              index: idx + 1,
              question_text: q.question_text,
              hint: q.hint || '',
              explanation: q.explanation || '',
              pairs: validPairs.map((p: any) => ({ left_text: p.left_text, right_text: p.right_text })),
            };
          });

          const batchTranslatePrompt = `Translate ALL ${batchItems.length} matching questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${materialLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
hint: "${item.hint}"
explanation: "${item.explanation}"
pairs: ${JSON.stringify(item.pairs)}`).join('\n')}

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें।" — WRONG

IMPORTANT: For pair left_text and right_text — if they are technical keywords, code terms, or programming constructs, keep them EXACTLY as-is in ALL languages (do NOT translate "int", "printf", "void", etc.). Only translate if they are natural language words.

CODE FORMATTING RULE: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks (\`code\`).

Return ONLY valid JSON with this EXACT structure (array of translations, one per question, in the SAME ORDER):
{
  "translations": [
    {
      "index": 1,
      "${materialLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "hint": "...",
        "explanation": "...",
        "pairs": [
          { "left_text": "...", "right_text": "..." }
        ]
      }
    },
    {
      "index": 2,
      "${materialLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "hint": "...",
        "explanation": "...",
        "pairs": [
          { "left_text": "...", "right_text": "..." }
        ]
      }
    }
  ]
}`;

          const transMaxTokens = Math.max(8192, validQuestions.length * materialLangs.length * 1024);
          const transResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
          totalInputTokens += transResult.inputTokens;
          totalOutputTokens += transResult.outputTokens;

          const transData = parseJSON(transResult.text);
          const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

          // Process each translated question
          const allQTransInserts: any[] = [];
          const allPairTransInserts: any[] = [];

          for (let qi = 0; qi < validQuestions.length; qi++) {
            const q = validQuestions[qi];
            const qId = questionIdMap.get(q._displayOrder);
            if (!qId) continue;

            const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
            if (!transEntry) continue;

            const pairIds = questionPairIds.get(qId) || [];

            for (const lang of materialLangs) {
              const langData = transEntry[lang.iso_code];
              if (!langData) continue;

              // Queue question translation
              allQTransInserts.push({
                matching_question_id: qId,
                language_id: lang.id,
                question_text: langData.question_text || q.question_text,
                hint: langData.hint || null,
                explanation: langData.explanation || null,
                is_active: true,
                created_by: userId,
              });
              stTranslationsCreated++;
              if (!stTranslationsCreatedLangs.includes(lang.name)) stTranslationsCreatedLangs.push(lang.name);

              // Queue pair translations
              if (langData.pairs && Array.isArray(langData.pairs)) {
                for (let pi = 0; pi < Math.min(langData.pairs.length, pairIds.length); pi++) {
                  allPairTransInserts.push({
                    matching_pair_id: pairIds[pi].id,
                    language_id: lang.id,
                    left_text: langData.pairs[pi].left_text || pairIds[pi].leftText,
                    right_text: langData.pairs[pi].right_text || pairIds[pi].rightText,
                    is_active: true,
                    created_by: userId,
                  });
                }
              }
            }
          }

          // Bulk insert all translated question translations
          if (allQTransInserts.length > 0) {
            for (let bi = 0; bi < allQTransInserts.length; bi += 100) {
              await supabase.from('matching_question_translations').insert(allQTransInserts.slice(bi, bi + 100));
            }
          }

          // Bulk insert all translated pair translations
          if (allPairTransInserts.length > 0) {
            for (let bi = 0; bi < allPairTransInserts.length; bi += 100) {
              await supabase.from('matching_pair_translations').insert(allPairTransInserts.slice(bi, bi + 100));
            }
          }
        } catch (transErr: any) {
          console.error('MATCHING batch translation error:', transErr.message);
        }
      }

      totalQuestionsCreated += stQuestionsCreated;
      totalPairsCreated += stPairsCreated;
      totalTranslationsCreated += stTranslationsCreated;

      results.push({
        sub_topic_id: st.sub_topic_id,
        sub_topic_name: subTopic?.name || subTopic?.slug,
        status: 'success',
        questions_created: stQuestionsCreated,
        pairs_created: stPairsCreated,
        translations_created: stTranslationsCreated,
        translations_languages: stTranslationsCreatedLangs,
        question_ids: createdQuestionIds,
      });
    }

    // Clear matching caches
    await redis.del('matching_questions:all');
    await redis.del('matching_question_translations:all');

    // Collect all created question IDs across sub-topics
    const allCreatedIds = results.flatMap((r: any) => r.question_ids || []);

    // Fetch full question details for the response
    let questions: any[] = [];
    if (allCreatedIds.length > 0) {
      const { data: qRows } = await supabase
        .from('matching_questions')
        .select('id, code, slug, difficulty_level, points, partial_scoring, display_order')
        .in('id', allCreatedIds)
        .order('display_order');

      for (const qr of (qRows || [])) {
        // Get English translation
        const { data: engTrans } = await supabase
          .from('matching_question_translations')
          .select('question_text, hint, explanation')
          .eq('matching_question_id', qr.id)
          .eq('language_id', 7)
          .single();

        // Get pairs with English text
        const { data: pairs } = await supabase
          .from('matching_pairs')
          .select('id, display_order')
          .eq('matching_question_id', qr.id)
          .is('deleted_at', null)
          .order('display_order');

        const pairDetails: any[] = [];
        for (const pair of (pairs || [])) {
          const { data: pairTrans } = await supabase
            .from('matching_pair_translations')
            .select('left_text, right_text')
            .eq('matching_pair_id', pair.id)
            .eq('language_id', 7)
            .single();
          pairDetails.push({
            id: pair.id,
            left_text: pairTrans?.left_text || '',
            right_text: pairTrans?.right_text || '',
          });
        }

        // Get which languages have translations
        const { data: langTrans } = await supabase
          .from('matching_question_translations')
          .select('language_id, languages(name)')
          .eq('matching_question_id', qr.id)
          .neq('language_id', 7)
          .is('deleted_at', null);
        const translatedLangs = (langTrans || []).map((lt: any) => lt.languages?.name || '').filter(Boolean);

        questions.push({
          matching_question_id: qr.id,
          code: qr.code,
          slug: qr.slug,
          difficulty_level: qr.difficulty_level,
          points: qr.points,
          partial_scoring: qr.partial_scoring,
          question_text: engTrans?.question_text || '',
          hint: engTrans?.hint || null,
          explanation: engTrans?.explanation || null,
          pairs: pairDetails,
          translations_created: translatedLangs,
        });
      }
    }

    // Log admin activity (non-blocking — never let this kill the response)
    try {
      logAdmin({
        actorId: userId,
        action: 'matching_auto_generated',
        targetType: 'matching_question',
        targetId: topic_id,
        targetName: topic.name || topic.slug,
        changes: { questions_created: totalQuestionsCreated, pairs_created: totalPairsCreated, translations_created: totalTranslationsCreated },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('MATCHING logAdmin error (non-fatal):', logErr.message);
    }

    console.log(`MATCHING generation complete: ${totalQuestionsCreated} questions, ${totalPairsCreated} pairs, ${totalTranslationsCreated} translations`);

    return ok(res, {
      questions,
      results,
      summary: {
        sub_topics_processed: results.length,
        sub_topics_success: results.filter((r: any) => r.status === 'success').length,
        sub_topics_error: results.filter((r: any) => r.status === 'error').length,
        total_questions_created: totalQuestionsCreated,
        total_pairs_created: totalPairsCreated,
        total_translations_created: totalTranslationsCreated,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Generated ${totalQuestionsCreated} matching questions with ${totalPairsCreated} pairs`);
  } catch (error: any) {
    console.error('autoGenerateMatching error:', error);
    return err(res, error.message || 'Failed to auto-generate matching questions', 500);
  }
}

// ─── Auto-Translate Existing Matching Questions ─────────────────────────────
/**
 * POST /ai/auto-translate-matching
 * Translates existing English matching questions + pairs to all material languages.
 *
 * Body: {
 *   topic_id?: number (translate all questions under topic),
 *   question_ids?: number[] (translate specific questions),
 *   provider?: 'anthropic' | 'openai' | 'gemini'
 * }
 */
export async function autoTranslateMatching(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { topic_id, question_ids, provider: reqProvider } = req.body;
    if (!topic_id && (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0)) {
      return err(res, 'topic_id or question_ids[] is required', 400);
    }
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Get target languages (non-English material languages)
    const { data: materialLangs } = await supabase
      .from('languages')
      .select('id, iso_code, name')
      .eq('is_active', true)
      .eq('for_material', true)
      .neq('id', 7)
      .order('id');
    if (!materialLangs || materialLangs.length === 0) return err(res, 'No target languages found', 404);

    // Find questions to translate
    let questionsQuery = supabase
      .from('matching_questions')
      .select('id, code, slug, topic_id')
      .is('deleted_at', null)
      .eq('is_active', true);

    if (question_ids && question_ids.length > 0) {
      questionsQuery = questionsQuery.in('id', question_ids);
    } else {
      questionsQuery = questionsQuery.eq('topic_id', topic_id);
    }

    const { data: questions, error: qErr } = await questionsQuery;
    if (qErr) return err(res, qErr.message, 500);
    if (!questions || questions.length === 0) return err(res, 'No questions found to translate', 404);

    let totalTranslated = 0;
    let totalErrors = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const results: any[] = [];

    // ─── PHASE 1: Gather all question data and find missing languages ───
    type QueuedMatchingQuestion = {
      question_id: number;
      engText: string;
      engHint: string;
      engExplanation: string;
      engPairs: { left_text: string; right_text: string }[];
      pairs: { id: number; display_order: number }[];
      missingLangs: typeof materialLangs;
    };
    const translationQueue: QueuedMatchingQuestion[] = [];

    for (const question of questions) {
      // Get English question translation
      const { data: engQTrans } = await supabase
        .from('matching_question_translations')
        .select('question_text, hint, explanation')
        .eq('matching_question_id', question.id)
        .eq('language_id', 7)
        .is('deleted_at', null)
        .single();

      if (!engQTrans || !engQTrans.question_text) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'No English translation' });
        continue;
      }

      // Find which languages are missing
      const { data: existingTrans } = await supabase
        .from('matching_question_translations')
        .select('language_id')
        .eq('matching_question_id', question.id)
        .is('deleted_at', null);
      const existingLangIds = new Set((existingTrans || []).map(t => t.language_id));
      const missingLangs = materialLangs.filter(l => !existingLangIds.has(l.id));
      if (missingLangs.length === 0) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'All languages exist' });
        continue;
      }

      // Get pairs and their English texts
      const { data: pairs } = await supabase
        .from('matching_pairs')
        .select('id, display_order')
        .eq('matching_question_id', question.id)
        .is('deleted_at', null)
        .order('display_order');

      const pairIds = (pairs || []).map(p => p.id);
      let engPairTexts: { left_text: string; right_text: string }[] = [];
      if (pairIds.length > 0) {
        const { data: engPTrans } = await supabase
          .from('matching_pair_translations')
          .select('matching_pair_id, left_text, right_text')
          .in('matching_pair_id', pairIds)
          .eq('language_id', 7)
          .is('deleted_at', null);
        engPairTexts = (pairs || []).map(p => {
          const t = (engPTrans || []).find(t => t.matching_pair_id === p.id);
          return { left_text: t?.left_text || '', right_text: t?.right_text || '' };
        });
      }

      translationQueue.push({
        question_id: question.id,
        engText: engQTrans.question_text,
        engHint: engQTrans.hint || '',
        engExplanation: engQTrans.explanation || '',
        engPairs: engPairTexts,
        pairs: pairs || [],
        missingLangs,
      });
    }

    // ─── PHASE 2: Batch translate in chunks (max 10 questions per AI call) ───
    const BATCH_SIZE = 10;
    for (let bi = 0; bi < translationQueue.length; bi += BATCH_SIZE) {
      const batch = translationQueue.slice(bi, bi + BATCH_SIZE);
      const allMissingLangs = materialLangs;

      try {
        const batchItems = batch.map((item, idx) => ({
          index: idx + 1,
          question_text: item.engText,
          hint: item.engHint,
          explanation: item.engExplanation,
          pairs: item.engPairs,
        }));

        const batchTranslatePrompt = `Translate ALL ${batchItems.length} matching questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${allMissingLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
hint: "${item.hint}"
explanation: "${item.explanation}"
pairs: ${JSON.stringify(item.pairs)}`).join('\n')}

MOST IMPORTANT RULE:
Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
GOOD (Hindi): "HTML5 की Fundamentals सीखें।"
BAD (Hindi): "एचटीएमएल5 की मूल बातें।"

IMPORTANT: For pair left_text and right_text — if they are technical keywords, code terms, or programming constructs, keep them EXACTLY as-is in ALL languages (do NOT translate "int", "printf", "void", etc.). Only translate if they are natural language words.

CODE FORMATTING RULE: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks (\`code\`).

Return ONLY valid JSON:
{
  "translations": [
    {
      "index": 1,
      "${allMissingLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "hint": "...",
        "explanation": "...",
        "pairs": [
          { "left_text": "...", "right_text": "..." }
        ]
      }
    }
  ]
}`;

        const transMaxTokens = Math.max(8192, batch.length * allMissingLangs.length * 1024);
        const aiResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;

        const transData = parseJSON(aiResult.text);
        const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

        // Process each question's translations and batch DB inserts
        const allQTransInserts: any[] = [];
        const allPairTransInserts: any[] = [];

        for (let qi = 0; qi < batch.length; qi++) {
          const item = batch[qi];
          const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
          if (!transEntry) {
            results.push({ question_id: item.question_id, status: 'error', error: 'No translation returned' });
            totalErrors++;
            continue;
          }

          let langsDone = 0;

          for (const lang of item.missingLangs) {
            const langData = transEntry[lang.iso_code];
            if (!langData) continue;

            allQTransInserts.push({
              matching_question_id: item.question_id,
              language_id: lang.id,
              question_text: langData.question_text || item.engText,
              hint: langData.hint || null,
              explanation: langData.explanation || null,
              is_active: true,
              created_by: userId,
            });
            langsDone++;

            if (langData.pairs && Array.isArray(langData.pairs)) {
              for (let pi = 0; pi < Math.min(langData.pairs.length, item.pairs.length); pi++) {
                allPairTransInserts.push({
                  matching_pair_id: item.pairs[pi].id,
                  language_id: lang.id,
                  left_text: langData.pairs[pi].left_text || item.engPairs[pi]?.left_text || '',
                  right_text: langData.pairs[pi].right_text || item.engPairs[pi]?.right_text || '',
                  is_active: true,
                  created_by: userId,
                });
              }
            }
          }

          totalTranslated += langsDone;
          results.push({ question_id: item.question_id, status: 'success', languages_added: langsDone });
        }

        // Bulk insert all translations
        if (allQTransInserts.length > 0) {
          for (let ci = 0; ci < allQTransInserts.length; ci += 100) {
            await supabase.from('matching_question_translations').insert(allQTransInserts.slice(ci, ci + 100));
          }
        }
        if (allPairTransInserts.length > 0) {
          for (let ci = 0; ci < allPairTransInserts.length; ci += 100) {
            await supabase.from('matching_pair_translations').insert(allPairTransInserts.slice(ci, ci + 100));
          }
        }
      } catch (batchErr: any) {
        console.error('MATCHING batch translation error:', batchErr.message);
        for (const item of batch) {
          totalErrors++;
          results.push({ question_id: item.question_id, status: 'error', error: batchErr.message });
        }
      }
    }

    // Clear caches
    await redis.del('matching_question_translations:all');
    await redis.del('matching_questions:all');

    try {
      logAdmin({
        actorId: userId,
        action: 'matching_auto_translated',
        targetType: 'matching_question',
        targetId: topic_id || 0,
        targetName: `${questions.length} questions`,
        changes: { total_translated: totalTranslated, errors: totalErrors },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('MATCHING translate logAdmin error (non-fatal):', logErr.message);
    }

    return ok(res, {
      results,
      summary: {
        questions_processed: questions.length,
        translations_created: totalTranslated,
        errors: totalErrors,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Translated ${totalTranslated} question translations across ${questions.length} questions`);
  } catch (error: any) {
    console.error('autoTranslateMatching error:', error);
    return err(res, error.message || 'Failed to auto-translate matching questions', 500);
  }
}

// ─── Auto-Generate Ordering Questions ───────��─────────────────────────────────
/**
 * POST /ai/auto-generate-ordering
 * Reads sub-topic tutorial HTML and generates ordering questions + items via AI.
 *
 * Body: {
 *   topic_id: number,
 *   sub_topic_id?: number,
 *   num_questions?: number (0 = auto),
 *   difficulty_mix?: 'auto' | 'easy' | 'medium' | 'hard' | 'mixed',
 *   provider?: 'anthropic' | 'openai' | 'gemini',
 *   auto_translate?: boolean,
 * }
 */
export async function autoGenerateOrdering(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const {
      topic_id,
      sub_topic_id,
      num_questions = 0,
      difficulty_mix,
      provider: reqProvider,
      auto_translate = false,
    } = req.body;

    if (!topic_id) return err(res, 'topic_id is required', 400);
    const rawNumQ = parseInt(num_questions) || 0;
    const isAutoCount = rawNumQ <= 0;
    const numQ = isAutoCount ? 0 : Math.max(1, rawNumQ);
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Validate topic exists
    const { data: topic } = await supabase.from('topics').select('id, slug, name').eq('id', topic_id).single();
    if (!topic) return err(res, 'Topic not found', 404);

    // Find sub-topics with English tutorial pages
    let subTopicQuery = supabase
      .from('sub_topic_translations')
      .select('sub_topic_id, page, sub_topics!inner(id, slug, name, topic_id)')
      .eq('language_id', 7)
      .eq('sub_topics.topic_id', topic_id)
      .not('page', 'is', null)
      .is('deleted_at', null);

    if (sub_topic_id) {
      subTopicQuery = subTopicQuery.eq('sub_topic_id', sub_topic_id);
    }

    const { data: subTopicTranslations, error: stErr } = await subTopicQuery;
    if (stErr) return err(res, stErr.message, 500);
    if (!subTopicTranslations || subTopicTranslations.length === 0) {
      return err(res, 'No sub-topics with English tutorial pages found for this topic', 404);
    }

    // Helper to strip HTML
    function stripHtml(html: string): string {
      return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Get max display_order for existing questions in this topic
    const { data: existingQs } = await supabase
      .from('ordering_questions')
      .select('display_order')
      .eq('topic_id', topic_id)
      .is('deleted_at', null)
      .order('display_order', { ascending: false })
      .limit(1);
    let nextDisplayOrder = ((existingQs?.[0]?.display_order) || 0) + 1;

    // Get material languages for translation
    let materialLangs: any[] = [];
    if (auto_translate) {
      const { data: langs } = await supabase
        .from('languages')
        .select('id, iso_code, name')
        .eq('is_active', true)
        .eq('for_material', true)
        .neq('id', 7)
        .order('id');
      materialLangs = langs || [];
    }

    const results: any[] = [];
    let totalQuestionsCreated = 0;
    let totalItemsCreated = 0;
    let totalTranslationsCreated = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Process each sub-topic
    for (const st of subTopicTranslations) {
      const subTopic = (st as any).sub_topics;
      const pageUrl = st.page;
      if (!pageUrl) continue;

      // Download HTML from Bunny CDN
      const cdnPath = pageUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
      let htmlContent: string;
      try {
        htmlContent = await downloadBunnyFile(cdnPath);
      } catch (downloadErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `Failed to download HTML: ${downloadErr.message}` });
        continue;
      }

      const plainText = stripHtml(htmlContent);
      if (!plainText || plainText.length < 50) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'skipped', error: 'Tutorial content too short' });
        continue;
      }
      const contentForAI = plainText.length > 30000 ? plainText.slice(0, 30000) : plainText;

      // Build difficulty instruction
      const diffMode = typeof difficulty_mix === 'string' ? difficulty_mix : 'auto';
      let difficultyInstruction = '';
      if (diffMode === 'easy') difficultyInstruction = 'ALL questions should be EASY difficulty (factual recall, basic sequences).';
      else if (diffMode === 'medium') difficultyInstruction = 'ALL questions should be MEDIUM difficulty (understanding process order, applying knowledge).';
      else if (diffMode === 'hard') difficultyInstruction = 'ALL questions should be HARD difficulty (complex multi-step sequences, analysis).';
      else if (diffMode === 'mixed' && !isAutoCount) {
        const easyCount = Math.round(numQ * 0.3);
        const hardCount = Math.round(numQ * 0.2);
        const mediumCount = numQ - easyCount - hardCount;
        difficultyInstruction = `Distribute difficulty: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard.`;
      } else {
        difficultyInstruction = 'Automatically distribute difficulty (easy/medium/hard) based on content complexity. Use your best judgment.';
      }

      const quantityInstruction = isAutoCount
        ? `Generate ALL possible meaningful ordering questions from the content. There is NO LIMIT — generate as many as the content supports.

YOUR GOAL IS EXHAUSTIVE, COMPREHENSIVE COVERAGE:
- Create ordering questions for EVERY sequence, process, timeline, hierarchy, or priority found in the content
- Include INTERVIEW-LEVEL ordering that tests deep understanding of processes and sequences
- Cover ALL cognitive levels: recall, understanding, application, analysis
- For code/programming content: order execution steps, compilation phases, method call sequences, lifecycle stages
- For theoretical content: order historical events, process steps, priority levels, workflow stages
- Do NOT skip ANY teachable sequence — if steps/stages/phases appear in the tutorial, create an ordering question
- Create multiple ordering questions from different angles for important sequences
- Each question must be UNIQUE — different sequence, different aspect
- Generate 8-25+ questions for rich content — DO NOT artificially limit yourself
- Each question should have 3-8 items to arrange in correct order
- More content = more questions. Short tutorials = 5-10, medium = 10-18, long/detailed = 18-25+`
        : `Generate EXACTLY ${numQ} ordering questions based on the content.`;

      const systemPrompt = `You are an expert educational content analyst for GrowUpMore — an online learning platform.
Read the provided tutorial content and generate ordering questions (arrange items in correct sequence/order) based on it.

Sub-topic: "${subTopic?.name || subTopic?.slug}"
Topic: "${topic.name || topic.slug}"

QUANTITY: ${quantityInstruction}

DIFFICULTY: ${difficultyInstruction}

IMPORTANT GUIDELINES:
- STRICTLY CONTENT-BOUND: Every question MUST come directly from the provided tutorial content. Do NOT introduce any theory, concept, term, syntax, function, example, or fact that is NOT explicitly mentioned or demonstrated in the provided content. If something is not in the tutorial text, do NOT ask about it — even if it is related to the topic. The tutorial content is the ONLY source of truth.
- Each ordering question should have 3-8 items that must be arranged in the correct order/sequence
- Items represent steps, stages, phases, events, priorities, or any sequential concept
- The correct_position field (1-based) indicates the correct order
- Questions should test real understanding of processes, sequences, and logical ordering
- Always generate a helpful hint that nudges toward the correct order without revealing it
- Always generate a detailed explanation of WHY this is the correct order
- Auto-assign points: easy=1, medium=2, hard=3
- Generate a short unique code for each question (e.g., "ord-c-compilation-steps-01")
- partial_scoring: set to true for questions with 5 or more items (allow partial credit), false for fewer
- CRITICAL: Vary difficulty throughout — do NOT cluster same difficulties together

CODE FORMATTING RULE:
- When including code snippets in question_text, item_text, hint, or explanation, ALWAYS wrap them in markdown triple backtick fences with the language tag (e.g. \`\`\`c, \`\`\`python, \`\`\`java).
- For inline code references (variable names, function names, keywords), wrap them in single backticks (e.g. \`printf\`, \`int\`).

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "questions": [
    {
      "code": "ord-unique-code",
      "question_text": "Arrange the following steps in the correct order of C program compilation",
      "difficulty_level": "easy",
      "points": 1,
      "partial_scoring": false,
      "hint": "Think about what happens first when you compile a C program",
      "explanation": "The C compilation process follows these steps: preprocessing, compilation, assembly, linking",
      "items": [
        { "item_text": "Preprocessing", "correct_position": 1 },
        { "item_text": "Compilation", "correct_position": 2 },
        { "item_text": "Assembly", "correct_position": 3 },
        { "item_text": "Linking", "correct_position": 4 }
      ]
    }
  ]
}`;

      let aiResult;
      try {
        aiResult = await callAI(provider, systemPrompt, contentForAI, isAutoCount ? 65536 : Math.max(8192, numQ * 2048));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;
      } catch (aiErr: any) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `AI call failed: ${aiErr.message}` });
        continue;
      }

      let parsed: any;
      try {
        parsed = parseJSON(aiResult.text);
      } catch (parseErr: any) {
        console.error(`ORDERING JSON parse error for sub-topic ${st.sub_topic_id}:`, parseErr.message, 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned invalid JSON' });
        continue;
      }

      const questions = parsed.questions || (Array.isArray(parsed) ? parsed : []);
      if (!questions.length) {
        console.error(`ORDERING no questions for sub-topic ${st.sub_topic_id}. Parsed keys:`, Object.keys(parsed || {}), 'AI text (first 500):', aiResult.text?.slice(0, 500));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'AI returned no questions' });
        continue;
      }

      console.log(`ORDERING: AI generated ${questions.length} questions for sub-topic ${st.sub_topic_id} (${subTopic?.name}).`);

      let stQuestionsCreated = 0;
      let stItemsCreated = 0;
      let stTranslationsCreated = 0;
      const createdQuestionIds: number[] = [];
      const stTranslationsCreatedLangs: string[] = [];

      // ─── BATCH PHASE 1: Prepare all questions and generate slugs ───
      const validQuestions: any[] = [];
      for (const q of questions) {
        if (!q.question_text || !q.items || !Array.isArray(q.items) || q.items.length < 2) continue;
        const diffLevel = ['easy', 'medium', 'hard'].includes(q.difficulty_level) ? q.difficulty_level : 'medium';
        const code = (q.code || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 80);
        const slug = await generateUniqueSlug(supabase, 'ordering_questions', code, undefined, { column: 'topic_id', value: topic_id });
        const partialScoring = q.partial_scoring === true || (q.items.length >= 5);
        validQuestions.push({ ...q, _diffLevel: diffLevel, _code: code, _slug: slug, _displayOrder: nextDisplayOrder++, _partialScoring: partialScoring });
      }

      if (validQuestions.length === 0) {
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: 'No valid questions generated' });
        continue;
      }

      // ─── BATCH PHASE 2: Bulk insert all ordering_questions at once ───
      const questionInserts = validQuestions.map(q => ({
        topic_id,
        code: q._code,
        slug: q._slug,
        difficulty_level: q._diffLevel,
        points: q.points || (q._diffLevel === 'easy' ? 1 : q._diffLevel === 'medium' ? 2 : 3),
        partial_scoring: q._partialScoring,
        display_order: q._displayOrder,
        is_mandatory: false,
        is_active: true,
        created_by: userId,
      }));

      const { data: newQuestions, error: bulkQErr } = await supabase
        .from('ordering_questions')
        .insert(questionInserts)
        .select('id, code, display_order');

      if (bulkQErr || !newQuestions || newQuestions.length === 0) {
        console.error(`ORDERING bulk insert failed for sub-topic ${st.sub_topic_id}:`, bulkQErr?.message, 'First insert:', JSON.stringify(questionInserts[0]));
        results.push({ sub_topic_id: st.sub_topic_id, sub_topic_name: subTopic?.name || subTopic?.slug, status: 'error', error: `DB insert failed: ${bulkQErr?.message || 'unknown'}` });
        continue;
      }

      // Map new question IDs back to validQuestions by display_order
      const questionIdMap = new Map<number, number>();
      for (const nq of newQuestions) {
        questionIdMap.set(nq.display_order, nq.id);
        createdQuestionIds.push(nq.id);
      }
      stQuestionsCreated = newQuestions.length;

      // ─── BATCH PHASE 3: Bulk insert English ordering_question_translations ──��
      const qTransInserts: any[] = [];
      for (const q of validQuestions) {
        const qId = questionIdMap.get(q._displayOrder);
        if (!qId) continue;
        qTransInserts.push({
          ordering_question_id: qId,
          language_id: 7,
          question_text: q.question_text,
          hint: q.hint || null,
          explanation: q.explanation || null,
          is_active: true,
          created_by: userId,
        });
      }
      if (qTransInserts.length > 0) {
        await supabase.from('ordering_question_translations').insert(qTransInserts);
      }

      // ─── BATCH PHASE 4: For each question, bulk insert ordering_items + English ordering_item_translations ───
      const questionItemIds: Map<number, { id: number; itemText: string; correctPosition: number }[]> = new Map();

      for (const q of validQuestions) {
        const qId = questionIdMap.get(q._displayOrder);
        if (!qId) continue;
        if (!q.items || !Array.isArray(q.items) || q.items.length === 0) continue;

        // Batch insert all items for this question
        const itemInserts = q.items
          .filter((item: any) => item.item_text)
          .map((item: any, idx: number) => ({
            ordering_question_id: qId,
            correct_position: item.correct_position || (idx + 1),
            display_order: idx + 1,
            is_active: true,
            created_by: userId,
          }));

        if (itemInserts.length === 0) continue;

        const { data: newItems, error: itemErr } = await supabase
          .from('ordering_items')
          .insert(itemInserts)
          .select('id, display_order, correct_position');

        if (itemErr || !newItems) continue;
        stItemsCreated += newItems.length;

        // Build English item translations for batch insert
        const itemIdList: { id: number; itemText: string; correctPosition: number }[] = [];
        const validItems = q.items.filter((item: any) => item.item_text);
        const allItemTransInserts: any[] = [];
        for (const ni of newItems) {
          const matchingItem = validItems[ni.display_order - 1];
          if (matchingItem) {
            allItemTransInserts.push({
              ordering_item_id: ni.id,
              language_id: 7,
              item_text: matchingItem.item_text,
              is_active: true,
              created_by: userId,
            });
            itemIdList.push({ id: ni.id, itemText: matchingItem.item_text, correctPosition: ni.correct_position });
          }
        }
        if (allItemTransInserts.length > 0) {
          await supabase.from('ordering_item_translations').insert(allItemTransInserts);
        }
        questionItemIds.set(qId, itemIdList);
      }

      // ─── BATCH PHASE 5: BATCH translate ALL questions + items in ONE AI call ───
      if (auto_translate && materialLangs.length > 0 && validQuestions.length > 0) {
        try {
          const batchItems = validQuestions.map((q, idx) => {
            const validItems = (q.items || []).filter((item: any) => item.item_text);
            return {
              index: idx + 1,
              question_text: q.question_text,
              hint: q.hint || '',
              explanation: q.explanation || '',
              items: validItems.map((item: any) => ({ item_text: item.item_text })),
            };
          });

          const batchTranslatePrompt = `Translate ALL ${batchItems.length} ordering questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${materialLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
hint: "${item.hint}"
explanation: "${item.explanation}"
items: ${JSON.stringify(item.items)}`).join('\n')}

MOST IMPORTANT RULE — STRICTLY FOLLOW:
Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
Keep these types of words in English: subject names, technical terms, brand names, programming terms, technology names.
GOOD example (Hindi): "HTML5 की Fundamentals सीखें।"
BAD example (Hindi): "एचटीएमएल5 की मूल बातें।" — WRONG

IMPORTANT: For item_text — if it is a technical keyword, code term, or programming construct, keep it EXACTLY as-is in ALL languages (do NOT translate "Preprocessing", "Linking", "int", "printf", etc.). Only translate if it is a natural language phrase.

CODE FORMATTING RULE: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks (\`code\`).

Return ONLY valid JSON with this EXACT structure (array of translations, one per question, in the SAME ORDER):
{
  "translations": [
    {
      "index": 1,
      "${materialLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "hint": "...",
        "explanation": "...",
        "items": [
          { "item_text": "..." }
        ]
      }
    }
  ]
}`;

          const transMaxTokens = Math.max(8192, validQuestions.length * materialLangs.length * 512);
          const transResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
          totalInputTokens += transResult.inputTokens;
          totalOutputTokens += transResult.outputTokens;

          const transData = parseJSON(transResult.text);
          const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

          // Process each translated question
          const allQTransInserts: any[] = [];
          const allItemTransInserts: any[] = [];

          for (let qi = 0; qi < validQuestions.length; qi++) {
            const q = validQuestions[qi];
            const qId = questionIdMap.get(q._displayOrder);
            if (!qId) continue;

            const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
            if (!transEntry) continue;

            const itemIds = questionItemIds.get(qId) || [];

            for (const lang of materialLangs) {
              const langData = transEntry[lang.iso_code];
              if (!langData) continue;

              // Queue question translation
              allQTransInserts.push({
                ordering_question_id: qId,
                language_id: lang.id,
                question_text: langData.question_text || q.question_text,
                hint: langData.hint || null,
                explanation: langData.explanation || null,
                is_active: true,
                created_by: userId,
              });
              stTranslationsCreated++;
              if (!stTranslationsCreatedLangs.includes(lang.name)) stTranslationsCreatedLangs.push(lang.name);

              // Queue item translations
              if (langData.items && Array.isArray(langData.items)) {
                for (let ii = 0; ii < Math.min(langData.items.length, itemIds.length); ii++) {
                  allItemTransInserts.push({
                    ordering_item_id: itemIds[ii].id,
                    language_id: lang.id,
                    item_text: langData.items[ii].item_text || itemIds[ii].itemText,
                    is_active: true,
                    created_by: userId,
                  });
                }
              }
            }
          }

          // Bulk insert all translated question translations
          if (allQTransInserts.length > 0) {
            for (let bi = 0; bi < allQTransInserts.length; bi += 100) {
              await supabase.from('ordering_question_translations').insert(allQTransInserts.slice(bi, bi + 100));
            }
          }

          // Bulk insert all translated item translations
          if (allItemTransInserts.length > 0) {
            for (let bi = 0; bi < allItemTransInserts.length; bi += 100) {
              await supabase.from('ordering_item_translations').insert(allItemTransInserts.slice(bi, bi + 100));
            }
          }
        } catch (transErr: any) {
          console.error('ORDERING batch translation error:', transErr.message);
        }
      }

      totalQuestionsCreated += stQuestionsCreated;
      totalItemsCreated += stItemsCreated;
      totalTranslationsCreated += stTranslationsCreated;

      results.push({
        sub_topic_id: st.sub_topic_id,
        sub_topic_name: subTopic?.name || subTopic?.slug,
        status: 'success',
        questions_created: stQuestionsCreated,
        items_created: stItemsCreated,
        translations_created: stTranslationsCreated,
        translations_languages: stTranslationsCreatedLangs,
        question_ids: createdQuestionIds,
      });
    }

    // Clear ordering caches
    await redis.del('ordering_questions:all');
    await redis.del('ordering_question_translations:all');

    // Collect all created question IDs across sub-topics
    const allCreatedIds = results.flatMap((r: any) => r.question_ids || []);

    // Fetch full question details for the response
    let questions: any[] = [];
    if (allCreatedIds.length > 0) {
      const { data: qRows } = await supabase
        .from('ordering_questions')
        .select('id, code, slug, difficulty_level, points, partial_scoring, display_order')
        .in('id', allCreatedIds)
        .order('display_order');

      for (const qr of (qRows || [])) {
        // Get English translation
        const { data: engTrans } = await supabase
          .from('ordering_question_translations')
          .select('question_text, hint, explanation')
          .eq('ordering_question_id', qr.id)
          .eq('language_id', 7)
          .single();

        // Get items with English text
        const { data: items } = await supabase
          .from('ordering_items')
          .select('id, correct_position, display_order')
          .eq('ordering_question_id', qr.id)
          .is('deleted_at', null)
          .order('correct_position');

        const itemDetails: any[] = [];
        for (const item of (items || [])) {
          const { data: itemTrans } = await supabase
            .from('ordering_item_translations')
            .select('item_text')
            .eq('ordering_item_id', item.id)
            .eq('language_id', 7)
            .single();
          itemDetails.push({
            id: item.id,
            item_text: itemTrans?.item_text || '',
            correct_position: item.correct_position,
          });
        }

        // Get which languages have translations
        const { data: langTrans } = await supabase
          .from('ordering_question_translations')
          .select('language_id, languages(name)')
          .eq('ordering_question_id', qr.id)
          .neq('language_id', 7)
          .is('deleted_at', null);
        const translatedLangs = (langTrans || []).map((lt: any) => lt.languages?.name || '').filter(Boolean);

        questions.push({
          ordering_question_id: qr.id,
          code: qr.code,
          slug: qr.slug,
          difficulty_level: qr.difficulty_level,
          points: qr.points,
          partial_scoring: qr.partial_scoring,
          question_text: engTrans?.question_text || '',
          hint: engTrans?.hint || null,
          explanation: engTrans?.explanation || null,
          items: itemDetails,
          translations_created: translatedLangs,
        });
      }
    }

    // Log admin activity
    try {
      logAdmin({
        actorId: userId,
        action: 'ordering_auto_generated',
        targetType: 'ordering_question',
        targetId: topic_id,
        targetName: topic.name || topic.slug,
        changes: { questions_created: totalQuestionsCreated, items_created: totalItemsCreated, translations_created: totalTranslationsCreated },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('ORDERING logAdmin error (non-fatal):', logErr.message);
    }

    console.log(`ORDERING generation complete: ${totalQuestionsCreated} questions, ${totalItemsCreated} items, ${totalTranslationsCreated} translations`);

    return ok(res, {
      questions,
      results,
      summary: {
        sub_topics_processed: results.length,
        sub_topics_success: results.filter((r: any) => r.status === 'success').length,
        sub_topics_error: results.filter((r: any) => r.status === 'error').length,
        total_questions_created: totalQuestionsCreated,
        total_items_created: totalItemsCreated,
        total_translations_created: totalTranslationsCreated,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Generated ${totalQuestionsCreated} ordering questions with ${totalItemsCreated} items`);
  } catch (error: any) {
    console.error('autoGenerateOrdering error:', error);
    return err(res, error.message || 'Failed to auto-generate ordering questions', 500);
  }
}

// ─── Auto-Translate Existing Ordering Questions ─────────────────────────────
/**
 * POST /ai/auto-translate-ordering
 * Translates existing English ordering questions + items to all material languages.
 *
 * Body: {
 *   topic_id?: number (translate all questions under topic),
 *   question_ids?: number[] (translate specific questions),
 *   provider?: 'anthropic' | 'openai' | 'gemini'
 * }
 */
export async function autoTranslateOrdering(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { topic_id, question_ids, provider: reqProvider } = req.body;
    if (!topic_id && (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0)) {
      return err(res, 'topic_id or question_ids[] is required', 400);
    }
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Get target languages (non-English material languages)
    const { data: materialLangs } = await supabase
      .from('languages')
      .select('id, iso_code, name')
      .eq('is_active', true)
      .eq('for_material', true)
      .neq('id', 7)
      .order('id');
    if (!materialLangs || materialLangs.length === 0) return err(res, 'No target languages found', 404);

    // Find questions to translate
    let questionsQuery = supabase
      .from('ordering_questions')
      .select('id, code, slug, topic_id')
      .is('deleted_at', null)
      .eq('is_active', true);

    if (question_ids && question_ids.length > 0) {
      questionsQuery = questionsQuery.in('id', question_ids);
    } else {
      questionsQuery = questionsQuery.eq('topic_id', topic_id);
    }

    const { data: questions, error: qErr } = await questionsQuery;
    if (qErr) return err(res, qErr.message, 500);
    if (!questions || questions.length === 0) return err(res, 'No questions found to translate', 404);

    let totalTranslated = 0;
    let totalErrors = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const results: any[] = [];

    // ─── PHASE 1: Gather all question data and find missing languages ───
    type QueuedOrderingQuestion = {
      question_id: number;
      engText: string;
      engHint: string;
      engExplanation: string;
      engItems: { item_text: string }[];
      items: { id: number; display_order: number; correct_position: number }[];
      missingLangs: typeof materialLangs;
    };
    const translationQueue: QueuedOrderingQuestion[] = [];

    for (const question of questions) {
      // Get English question translation
      const { data: engQTrans } = await supabase
        .from('ordering_question_translations')
        .select('question_text, hint, explanation')
        .eq('ordering_question_id', question.id)
        .eq('language_id', 7)
        .is('deleted_at', null)
        .single();

      if (!engQTrans || !engQTrans.question_text) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'No English translation' });
        continue;
      }

      // Find which languages are missing
      const { data: existingTrans } = await supabase
        .from('ordering_question_translations')
        .select('language_id')
        .eq('ordering_question_id', question.id)
        .is('deleted_at', null);
      const existingLangIds = new Set((existingTrans || []).map(t => t.language_id));
      const missingLangs = materialLangs.filter(l => !existingLangIds.has(l.id));
      if (missingLangs.length === 0) {
        results.push({ question_id: question.id, status: 'skipped', reason: 'All languages exist' });
        continue;
      }

      // Get items and their English texts
      const { data: items } = await supabase
        .from('ordering_items')
        .select('id, display_order, correct_position')
        .eq('ordering_question_id', question.id)
        .is('deleted_at', null)
        .order('correct_position');

      const itemIds = (items || []).map(i => i.id);
      let engItemTexts: { item_text: string }[] = [];
      if (itemIds.length > 0) {
        const { data: engITrans } = await supabase
          .from('ordering_item_translations')
          .select('ordering_item_id, item_text')
          .in('ordering_item_id', itemIds)
          .eq('language_id', 7)
          .is('deleted_at', null);
        engItemTexts = (items || []).map(i => {
          const t = (engITrans || []).find(t => t.ordering_item_id === i.id);
          return { item_text: t?.item_text || '' };
        });
      }

      translationQueue.push({
        question_id: question.id,
        engText: engQTrans.question_text,
        engHint: engQTrans.hint || '',
        engExplanation: engQTrans.explanation || '',
        engItems: engItemTexts,
        items: items || [],
        missingLangs,
      });
    }

    // ─── PHASE 2: Batch translate in chunks (max 10 questions per AI call) ───
    const BATCH_SIZE = 10;
    for (let bi = 0; bi < translationQueue.length; bi += BATCH_SIZE) {
      const batch = translationQueue.slice(bi, bi + BATCH_SIZE);
      const allMissingLangs = materialLangs;

      try {
        const batchItems = batch.map((item, idx) => ({
          index: idx + 1,
          question_text: item.engText,
          hint: item.engHint,
          explanation: item.engExplanation,
          items: item.engItems,
        }));

        const batchTranslatePrompt = `Translate ALL ${batchItems.length} ordering questions below to ALL of these languages in a single response.

TARGET LANGUAGES: ${allMissingLangs.map(l => `${l.name} (${l.iso_code})`).join(', ')}

QUESTIONS TO TRANSLATE:
${batchItems.map(item => `
--- Question ${item.index} ---
question_text: "${item.question_text}"
hint: "${item.hint}"
explanation: "${item.explanation}"
items: ${JSON.stringify(item.items)}`).join('\n')}

MOST IMPORTANT RULE:
Keep common and technical English words in English script (Latin letters) — do NOT transliterate them.
GOOD (Hindi): "HTML5 की Fundamentals सीखें।"
BAD (Hindi): "एचटीएमएल5 की मूल बातें।"

IMPORTANT: For item_text — if it is a technical keyword, code term, or programming construct, keep it EXACTLY as-is in ALL languages. Only translate if it is a natural language phrase.

CODE FORMATTING RULE: PRESERVE all markdown code fences (triple backticks with language tags like \`\`\`c, \`\`\`python) exactly as they appear in the source text. Do NOT remove or alter code fences during translation. Also preserve inline backticks (\`code\`).

Return ONLY valid JSON:
{
  "translations": [
    {
      "index": 1,
      "${allMissingLangs[0]?.iso_code || 'hi'}": {
        "question_text": "...",
        "hint": "...",
        "explanation": "...",
        "items": [
          { "item_text": "..." }
        ]
      }
    }
  ]
}`;

        const transMaxTokens = Math.max(8192, batch.length * allMissingLangs.length * 512);
        const aiResult = await callAI(provider, batchTranslatePrompt, '', Math.min(transMaxTokens, 65536));
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;

        const transData = parseJSON(aiResult.text);
        const translationsArray: any[] = transData.translations || (Array.isArray(transData) ? transData : []);

        // Process each question's translations and batch DB inserts
        const allQTransInserts: any[] = [];
        const allItemTransInserts: any[] = [];

        for (let qi = 0; qi < batch.length; qi++) {
          const item = batch[qi];
          const transEntry = translationsArray.find((t: any) => t.index === qi + 1) || translationsArray[qi];
          if (!transEntry) {
            results.push({ question_id: item.question_id, status: 'error', error: 'No translation returned' });
            totalErrors++;
            continue;
          }

          let langsDone = 0;

          for (const lang of item.missingLangs) {
            const langData = transEntry[lang.iso_code];
            if (!langData) continue;

            allQTransInserts.push({
              ordering_question_id: item.question_id,
              language_id: lang.id,
              question_text: langData.question_text || item.engText,
              hint: langData.hint || null,
              explanation: langData.explanation || null,
              is_active: true,
              created_by: userId,
            });
            langsDone++;

            if (langData.items && Array.isArray(langData.items)) {
              for (let ii = 0; ii < Math.min(langData.items.length, item.items.length); ii++) {
                allItemTransInserts.push({
                  ordering_item_id: item.items[ii].id,
                  language_id: lang.id,
                  item_text: langData.items[ii].item_text || item.engItems[ii]?.item_text || '',
                  is_active: true,
                  created_by: userId,
                });
              }
            }
          }

          totalTranslated += langsDone;
          results.push({ question_id: item.question_id, status: 'success', languages_added: langsDone });
        }

        // Bulk insert all translations
        if (allQTransInserts.length > 0) {
          for (let ci = 0; ci < allQTransInserts.length; ci += 100) {
            await supabase.from('ordering_question_translations').insert(allQTransInserts.slice(ci, ci + 100));
          }
        }
        if (allItemTransInserts.length > 0) {
          for (let ci = 0; ci < allItemTransInserts.length; ci += 100) {
            await supabase.from('ordering_item_translations').insert(allItemTransInserts.slice(ci, ci + 100));
          }
        }
      } catch (batchErr: any) {
        console.error('ORDERING batch translation error:', batchErr.message);
        for (const item of batch) {
          totalErrors++;
          results.push({ question_id: item.question_id, status: 'error', error: batchErr.message });
        }
      }
    }

    // Clear caches
    await redis.del('ordering_question_translations:all');
    await redis.del('ordering_questions:all');

    try {
      logAdmin({
        actorId: userId,
        action: 'ordering_auto_translated',
        targetType: 'ordering_question',
        targetId: topic_id || 0,
        targetName: `${questions.length} questions`,
        changes: { total_translated: totalTranslated, errors: totalErrors },
        ip: getClientIp(req),
      });
    } catch (logErr: any) {
      console.error('ORDERING translate logAdmin error (non-fatal):', logErr.message);
    }

    return ok(res, {
      results,
      summary: {
        questions_processed: questions.length,
        translations_created: totalTranslated,
        errors: totalErrors,
      },
      usage: { prompt_tokens: totalInputTokens, completion_tokens: totalOutputTokens, total_tokens: totalInputTokens + totalOutputTokens },
    }, `Translated ${totalTranslated} question translations across ${questions.length} questions`);
  } catch (error: any) {
    console.error('autoTranslateOrdering error:', error);
    return err(res, error.message || 'Failed to auto-translate ordering questions', 500);
  }
}

export async function autoGenerateAssessment(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const {
      assessment_type,
      scope_id,
      num_assessments = 0,
      difficulty_mix = 'auto',
      provider: reqProvider,
      auto_translate = false,
    } = req.body;

    // Validate assessment_type
    const validTypes = ['exercise', 'assignment', 'mini_project', 'capstone_project'];
    if (!validTypes.includes(assessment_type)) return err(res, `assessment_type must be one of: ${validTypes.join(', ')}`, 400);
    if (!scope_id) return err(res, 'scope_id is required', 400);

    const rawNum = parseInt(num_assessments) || 0;
    const isAutoCount = rawNum <= 0;
    const numAssessments = isAutoCount ? 0 : Math.max(1, rawNum);
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Map type to scope
    const typeScopeMap: Record<string, { scope: string; table: string; fkCol: string }> = {
      exercise: { scope: 'sub_topic', table: 'sub_topics', fkCol: 'sub_topic_id' },
      assignment: { scope: 'topic', table: 'topics', fkCol: 'topic_id' },
      mini_project: { scope: 'chapter', table: 'chapters', fkCol: 'chapter_id' },
      capstone_project: { scope: 'course', table: 'courses', fkCol: 'course_id' },
    };
    const scopeConfig = typeScopeMap[assessment_type];

    // Verify scope entity exists
    const { data: scopeEntity } = await supabase.from(scopeConfig.table).select('id, slug, name').eq('id', scope_id).single();
    if (!scopeEntity) return err(res, `${scopeConfig.scope} with id ${scope_id} not found`, 404);

    // Gather tutorial content from sub-topics
    let subTopicContent: { sub_topic_name: string; content: string }[] = [];

    if (assessment_type === 'exercise') {
      // For exercises, get the single sub-topic's English page
      const { data: stTrans } = await supabase
        .from('sub_topic_translations')
        .select('page, sub_topics!inner(id, name, slug)')
        .eq('sub_topic_id', scope_id)
        .eq('language_id', 7)
        .not('page', 'is', null)
        .is('deleted_at', null)
        .limit(1)
        .single();
      if (stTrans && stTrans.page) {
        const cdnPath = stTrans.page.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
        try {
          const html = await downloadBunnyFile(cdnPath);
          const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          if (text.length > 50) subTopicContent.push({ sub_topic_name: (stTrans as any).sub_topics?.name || '', content: text.slice(0, 30000) });
        } catch {}
      }
    } else if (assessment_type === 'assignment') {
      // For assignments, get all sub-topics under this topic
      const { data: stTransList } = await supabase
        .from('sub_topic_translations')
        .select('page, sub_topics!inner(id, name, slug, topic_id)')
        .eq('sub_topics.topic_id', scope_id)
        .eq('language_id', 7)
        .not('page', 'is', null)
        .is('deleted_at', null);
      for (const st of (stTransList || [])) {
        if (!st.page) continue;
        const cdnPath = st.page.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
        try {
          const html = await downloadBunnyFile(cdnPath);
          const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          if (text.length > 50) subTopicContent.push({ sub_topic_name: (st as any).sub_topics?.name || '', content: text.slice(0, 15000) });
        } catch {}
      }
    } else if (assessment_type === 'mini_project') {
      // For mini projects, get all sub-topics under all topics in this chapter
      const { data: topics } = await supabase.from('topics').select('id, name').eq('chapter_id', scope_id).is('deleted_at', null);
      for (const topic of (topics || [])) {
        const { data: stTransList } = await supabase
          .from('sub_topic_translations')
          .select('page, sub_topics!inner(id, name, slug, topic_id)')
          .eq('sub_topics.topic_id', topic.id)
          .eq('language_id', 7)
          .not('page', 'is', null)
          .is('deleted_at', null)
          .limit(3); // Limit per topic to stay within token limits
        for (const st of (stTransList || [])) {
          if (!st.page) continue;
          const cdnPath = st.page.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
          try {
            const html = await downloadBunnyFile(cdnPath);
            const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
            if (text.length > 50) subTopicContent.push({ sub_topic_name: (st as any).sub_topics?.name || '', content: text.slice(0, 8000) });
          } catch {}
        }
      }
    } else {
      // For capstone projects, gather content from course modules → subjects → chapters → topics → sub-topics
      const { data: modules } = await supabase.from('course_modules').select('id').eq('course_id', scope_id).is('deleted_at', null).limit(5);
      for (const mod of (modules || [])) {
        const { data: subjects } = await supabase.from('course_module_subjects').select('subject_id').eq('course_module_id', mod.id).is('deleted_at', null).limit(3);
        for (const sub of (subjects || [])) {
          const { data: chapters } = await supabase.from('chapters').select('id, name').eq('subject_id', sub.subject_id).is('deleted_at', null).limit(2);
          for (const ch of (chapters || [])) {
            const { data: topics } = await supabase.from('topics').select('id, name').eq('chapter_id', ch.id).is('deleted_at', null).limit(2);
            for (const topic of (topics || [])) {
              const { data: stTransList } = await supabase
                .from('sub_topic_translations')
                .select('page, sub_topics!inner(id, name, topic_id)')
                .eq('sub_topics.topic_id', topic.id)
                .eq('language_id', 7)
                .not('page', 'is', null)
                .is('deleted_at', null)
                .limit(1);
              for (const st of (stTransList || [])) {
                if (!st.page) continue;
                const cdnPath = st.page.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
                try {
                  const html = await downloadBunnyFile(cdnPath);
                  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                  if (text.length > 50) subTopicContent.push({ sub_topic_name: (st as any).sub_topics?.name || '', content: text.slice(0, 5000) });
                } catch {}
              }
            }
          }
        }
      }
    }

    if (subTopicContent.length === 0) {
      return err(res, 'No tutorial content found for this scope. Ensure sub-topics have English HTML pages uploaded.', 404);
    }

    // Combine content for AI (limit total to ~50k chars)
    let combinedContent = '';
    for (const sc of subTopicContent) {
      const entry = `\n--- Sub-topic: ${sc.sub_topic_name} ---\n${sc.content}\n`;
      if (combinedContent.length + entry.length > 50000) break;
      combinedContent += entry;
    }

    // Build AI prompt based on type
    const typeDescriptions: Record<string, string> = {
      exercise: 'a coding exercise (small, focused practice problem targeting a specific concept from the sub-topic)',
      assignment: 'a programming assignment (moderate scope, covers multiple concepts from the topic)',
      mini_project: 'a mini project (substantial hands-on project covering the chapter material)',
      capstone_project: 'a capstone project (comprehensive project integrating knowledge across the entire course)',
    };

    const diffMode = typeof difficulty_mix === 'string' ? difficulty_mix : 'auto';
    let difficultyInstruction = '';
    if (diffMode === 'easy') difficultyInstruction = 'ALL assessments should be EASY difficulty.';
    else if (diffMode === 'medium') difficultyInstruction = 'ALL assessments should be MEDIUM difficulty.';
    else if (diffMode === 'hard') difficultyInstruction = 'ALL assessments should be HARD difficulty.';
    else if (diffMode === 'mixed' && !isAutoCount) {
      difficultyInstruction = `Mix difficulties: ~30% easy, ~50% medium, ~20% hard.`;
    } else {
      difficultyInstruction = 'Automatically assign difficulty based on content complexity.';
    }

    const quantityInstruction = isAutoCount
      ? `Generate ALL meaningful ${assessment_type.replace('_', ' ')}s that the content supports. For exercises: 3-8 per sub-topic. For assignments: 2-5 per topic. For mini projects: 1-3 per chapter. For capstone projects: 1-2 per course.`
      : `Generate EXACTLY ${numAssessments} ${assessment_type.replace('_', ' ')}(s).`;

    const solutionTypeInstruction = (assessment_type === 'exercise' || assessment_type === 'assignment')
      ? 'Include an HTML solution with the complete working code and explanation. Wrap code in appropriate HTML tags with syntax highlighting classes.'
      : 'Provide a solution outline describing the expected deliverables, key milestones, and evaluation criteria (as HTML).';

    const systemPrompt = `You are an expert educational content creator for GrowUpMore — an online learning platform.
Based on the provided tutorial content, generate ${typeDescriptions[assessment_type]}.

Scope: "${scopeEntity.name || scopeEntity.slug}" (${scopeConfig.scope})

QUANTITY: ${quantityInstruction}

DIFFICULTY: ${difficultyInstruction}

SOLUTION TYPE: ${solutionTypeInstruction}

REQUIREMENTS FOR EACH ASSESSMENT:
- title: Clear, descriptive title (e.g., "Build a Todo App with React Hooks")
- description: 2-3 sentence overview of what the student will build/solve
- problem_statement_html: Complete HTML problem statement with:
  * Clear objective/goal
  * Requirements/specifications (numbered list)
  * Constraints or rules
  * Example input/output (if applicable)
  * Code snippets wrapped in <pre><code class="language-xxx"> tags
- instructions: Step-by-step guidance (HTML)
- prerequisites: What the student should know before attempting
- submission_guidelines: What to submit and in what format
- hints: 2-3 helpful hints without giving away the solution
- solution_html: Complete solution with working code and explanation (HTML)
- tech_stack: Array of technologies used (e.g., ["React", "TypeScript", "CSS"])
- learning_outcomes: Array of what the student will learn (e.g., ["Understand state management", "Implement CRUD operations"])
- tags: Array of relevant tags (e.g., ["react", "hooks", "state-management"])
- difficulty_level: "easy" | "medium" | "hard"
- estimated_hours: Estimated completion time in hours (0.5 for exercises, 1-3 for assignments, 3-8 for mini projects, 10-40 for capstone)
- points: Points value (easy=10, medium=25, hard=50 for exercises; scale up for larger types)

IMPORTANT:
- Content must be STRICTLY based on the provided tutorial material
- Problems should be practical and hands-on
- Solutions must be complete and working
- Use proper HTML formatting with code highlighting
- Each assessment must be unique and test different aspects

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "assessments": [
    {
      "title": "Assessment title",
      "description": "Brief description",
      "problem_statement_html": "<div>...</div>",
      "instructions": "<ol><li>...</li></ol>",
      "prerequisites": "Knowledge of X, Y, Z",
      "submission_guidelines": "Submit your solution as...",
      "hints": "Hint 1. Hint 2. Hint 3.",
      "solution_html": "<div>Complete solution...</div>",
      "tech_stack": ["tech1", "tech2"],
      "learning_outcomes": ["outcome1", "outcome2"],
      "tags": ["tag1", "tag2"],
      "difficulty_level": "medium",
      "estimated_hours": 2,
      "points": 25
    }
  ]
}`;

    let aiResult;
    try {
      aiResult = await callAI(provider, systemPrompt, combinedContent, isAutoCount ? 65536 : Math.max(16384, numAssessments * 4096));
    } catch (aiErr: any) {
      return err(res, `AI generation failed: ${aiErr.message}`, 500);
    }

    let parsed: any;
    try {
      parsed = parseJSON(aiResult.text);
    } catch (parseErr: any) {
      console.error('Assessment AI JSON parse error:', parseErr.message, 'AI text (first 500):', aiResult.text?.slice(0, 500));
      return err(res, 'AI returned invalid JSON. Please try again.', 500);
    }

    const assessments = parsed.assessments || (Array.isArray(parsed) ? parsed : []);
    if (!assessments.length) {
      return err(res, 'AI returned no assessments. Please try again.', 500);
    }

    // Get English language ID
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (!enLang) return err(res, 'English language not found in system', 500);

    // Get max display_order
    const { data: existingAssessments } = await supabase
      .from('assessments')
      .select('display_order')
      .eq(scopeConfig.fkCol, scope_id)
      .eq('assessment_type', assessment_type)
      .is('deleted_at', null)
      .order('display_order', { ascending: false })
      .limit(1);
    let nextDisplayOrder = ((existingAssessments?.[0]?.display_order) || 0) + 1;

    // Get material languages for translation
    let materialLangs: any[] = [];
    if (auto_translate) {
      const { data: langs } = await supabase
        .from('languages')
        .select('id, iso_code, name')
        .eq('is_active', true)
        .eq('for_material', true)
        .neq('id', 7) // exclude English
        .order('id');
      materialLangs = langs || [];
    }

    let totalCreated = 0;
    let totalTranslations = 0;
    let totalSolutions = 0;
    const createdAssessments: any[] = [];

    for (const a of assessments) {
      if (!a.title || !a.problem_statement_html) continue;

      const diffLevel = ['easy', 'medium', 'hard'].includes(a.difficulty_level) ? a.difficulty_level : 'medium';
      const slug = await generateUniqueSlug(supabase, 'assessments', a.title);

      // Insert assessment record
      const assessmentBody: any = {
        slug,
        assessment_type,
        assessment_scope: scopeConfig.scope,
        difficulty_level: diffLevel,
        points: a.points || 10,
        estimated_hours: a.estimated_hours || null,
        due_days: assessment_type === 'capstone_project' ? 30 : assessment_type === 'mini_project' ? 14 : assessment_type === 'assignment' ? 7 : 3,
        is_mandatory: false,
        display_order: nextDisplayOrder++,
        is_active: true,
        [scopeConfig.fkCol]: scope_id,
        created_by: userId,
      };

      const { data: newAssessment, error: insErr } = await supabase
        .from('assessments')
        .insert(assessmentBody)
        .select('*')
        .single();
      if (insErr) {
        console.error(`Failed to insert assessment "${a.title}":`, insErr.message);
        continue;
      }
      totalCreated++;

      // Insert English translation
      const translationBody: any = {
        assessment_id: newAssessment.id,
        language_id: enLang.id,
        title: a.title,
        description: a.description || null,
        problem_statement_html: a.problem_statement_html,
        instructions: a.instructions || null,
        prerequisites: a.prerequisites || null,
        submission_guidelines: a.submission_guidelines || null,
        hints: a.hints || null,
        meta_title: a.title.slice(0, 70),
        meta_description: (a.description || '').slice(0, 160),
        focus_keyword: (a.tags?.[0] || a.title.split(' ')[0] || '').toLowerCase(),
        tech_stack: a.tech_stack || [],
        learning_outcomes: a.learning_outcomes || [],
        tags: a.tags || [],
        structured_data: [],
        is_active: true,
        created_by: userId,
      };

      const { error: transErr } = await supabase
        .from('assessment_translations')
        .insert(translationBody);
      if (transErr) {
        console.error(`Failed to insert translation for assessment ${newAssessment.id}:`, transErr.message);
      } else {
        totalTranslations++;
      }

      // Insert solution
      if (a.solution_html) {
        const solutionBody: any = {
          assessment_id: newAssessment.id,
          solution_type: 'html',
          file_name: `${slug}-solution.html`,
          file_url: null, // HTML stored in solution translations
          display_order: 1,
          is_active: true,
          created_by: userId,
        };

        const { data: newSolution, error: solErr } = await supabase
          .from('assessment_solutions')
          .insert(solutionBody)
          .select('id')
          .single();
        if (!solErr && newSolution) {
          totalSolutions++;
          // Insert English solution translation with the HTML content
          await supabase.from('assessment_solution_translations').insert({
            assessment_solution_id: newSolution.id,
            language_id: enLang.id,
            video_title: `Solution: ${a.title}`,
            video_description: a.solution_html,
            is_active: true,
            created_by: userId,
          });
        }
      }

      // Auto-translate to other languages
      if (auto_translate && materialLangs.length > 0) {
        for (const lang of materialLangs) {
          try {
            const transPrompt = `Translate the following educational assessment content from English to ${lang.name} (${lang.iso_code}).
RULES:
- Translate ALL text content to ${lang.name}
- Keep ALL technical terms, code keywords, variable names, function names, class names, and programming syntax in English (do NOT translate code)
- Keep HTML tags intact — only translate the text between tags
- Keep JSON structure intact
- Maintain the same tone and clarity

Return ONLY valid JSON (no markdown):
{
  "title": "translated title",
  "description": "translated description",
  "problem_statement_html": "translated HTML (code stays English)",
  "instructions": "translated instructions HTML",
  "prerequisites": "translated prerequisites",
  "submission_guidelines": "translated guidelines",
  "hints": "translated hints"
}`;

            const contentToTranslate = JSON.stringify({
              title: a.title,
              description: a.description || '',
              problem_statement_html: (a.problem_statement_html || '').slice(0, 15000),
              instructions: (a.instructions || '').slice(0, 5000),
              prerequisites: a.prerequisites || '',
              submission_guidelines: a.submission_guidelines || '',
              hints: a.hints || '',
            });

            const transResult = await callAI(provider, transPrompt, contentToTranslate, 16384);
            const translated = parseJSON(transResult.text);

            if (translated && translated.title) {
              await supabase.from('assessment_translations').insert({
                assessment_id: newAssessment.id,
                language_id: lang.id,
                title: translated.title,
                description: translated.description || null,
                problem_statement_html: translated.problem_statement_html || null,
                instructions: translated.instructions || null,
                prerequisites: translated.prerequisites || null,
                submission_guidelines: translated.submission_guidelines || null,
                hints: translated.hints || null,
                meta_title: (translated.title || '').slice(0, 70),
                meta_description: (translated.description || '').slice(0, 160),
                focus_keyword: translationBody.focus_keyword,
                tech_stack: a.tech_stack || [],
                learning_outcomes: a.learning_outcomes || [], // keep English for now
                tags: a.tags || [],
                structured_data: [],
                is_active: true,
                created_by: userId,
              });
              totalTranslations++;
            }
          } catch (transErr: any) {
            console.error(`Translation to ${lang.iso_code} failed for assessment ${newAssessment.id}:`, transErr.message);
          }
        }
      }

      createdAssessments.push({
        id: newAssessment.id,
        slug: newAssessment.slug,
        title: a.title,
        difficulty: diffLevel,
      });
    }

    logAdmin({
      actorId: userId,
      action: 'assessment_auto_generated',
      targetType: 'assessment',
      targetId: scope_id,
      targetName: `${assessment_type}:${scopeEntity.slug}`,
      ip: getClientIp(req),
    });

    return ok(res, {
      assessments: createdAssessments,
      summary: {
        type: assessment_type,
        scope: scopeConfig.scope,
        scope_name: scopeEntity.name || scopeEntity.slug,
        assessments_created: totalCreated,
        translations_created: totalTranslations,
        solutions_created: totalSolutions,
        languages_translated: auto_translate ? materialLangs.length : 0,
      },
      usage: {
        prompt_tokens: aiResult.inputTokens,
        completion_tokens: aiResult.outputTokens,
        total_tokens: aiResult.inputTokens + aiResult.outputTokens,
      },
    }, `Generated ${totalCreated} ${assessment_type.replace('_', ' ')}(s) for ${scopeEntity.name || scopeEntity.slug}`);
  } catch (error: any) {
    console.error('autoGenerateAssessment error:', error);
    return err(res, error.message || 'Failed to auto-generate assessments', 500);
  }
}

// ─── Auto-Translate Existing Assessments ─────────────────────────────────────
export async function autoTranslateAssessment(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { assessment_ids, scope_id, assessment_type, provider: reqProvider } = req.body;
    if (!assessment_ids && !scope_id) {
      return err(res, 'assessment_ids[] or scope_id (with assessment_type) is required', 400);
    }
    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'gemini';

    // Get target languages (non-English material languages)
    const { data: materialLangs } = await supabase
      .from('languages')
      .select('id, iso_code, name')
      .eq('is_active', true)
      .eq('for_material', true)
      .neq('id', 7)
      .order('id');
    if (!materialLangs || materialLangs.length === 0) return err(res, 'No target languages found', 404);

    // Find assessments to translate
    let assessmentsQuery = supabase
      .from('assessments')
      .select('id, slug, assessment_type')
      .is('deleted_at', null)
      .eq('is_active', true);

    if (assessment_ids && Array.isArray(assessment_ids) && assessment_ids.length > 0) {
      assessmentsQuery = assessmentsQuery.in('id', assessment_ids);
    } else if (scope_id && assessment_type) {
      const scopeMap: Record<string, string> = {
        exercise: 'sub_topic_id',
        assignment: 'topic_id',
        mini_project: 'chapter_id',
        capstone_project: 'course_id',
      };
      const fkCol = scopeMap[assessment_type];
      if (!fkCol) return err(res, 'Invalid assessment_type', 400);
      assessmentsQuery = assessmentsQuery.eq(fkCol, scope_id).eq('assessment_type', assessment_type);
    } else {
      return err(res, 'assessment_ids[] or (scope_id + assessment_type) required', 400);
    }

    const { data: assessments, error: aErr } = await assessmentsQuery;
    if (aErr) return err(res, aErr.message, 500);
    if (!assessments || assessments.length === 0) return err(res, 'No assessments found to translate', 404);

    console.log(`[autoTranslateAssessment] Found ${assessments.length} assessment(s) to process, ${materialLangs.length} target lang(s)`);

    let totalTranslated = 0;
    let totalSolutionTranslated = 0;
    let totalErrors = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const assessment of assessments) {
      // ─── 1. Translate assessment_translations ───
      const { data: engTrans, error: engTransErr } = await supabase
        .from('assessment_translations')
        .select('title, description, problem_statement_html, instructions, prerequisites, submission_guidelines, hints, tech_stack, learning_outcomes, tags, focus_keyword')
        .eq('assessment_id', assessment.id)
        .eq('language_id', 7)
        .maybeSingle();

      if (engTransErr) {
        console.error(`[autoTranslateAssessment] Error fetching English translation for assessment ${assessment.id}:`, engTransErr.message);
        totalErrors++;
        continue;
      }
      if (!engTrans || !engTrans.title) {
        console.log(`[autoTranslateAssessment] No English translation found for assessment ${assessment.id}, skipping`);
        continue;
      }

      // Find missing languages for assessment_translations
      const { data: existingTrans } = await supabase
        .from('assessment_translations')
        .select('language_id')
        .eq('assessment_id', assessment.id)
        .is('deleted_at', null);
      const existingLangIds = new Set((existingTrans || []).map(t => t.language_id));
      const missingLangs = materialLangs.filter(l => !existingLangIds.has(l.id));
      console.log(`[autoTranslateAssessment] Assessment ${assessment.id}: existing langs=[${[...existingLangIds].join(',')}], missing=${missingLangs.length}`);

      if (missingLangs.length > 0) {
        // Batch all languages in a single AI call
        const langList = missingLangs.map(l => `${l.name} (${l.iso_code})`).join(', ');
        const transPrompt = `Translate the following educational assessment content from English to these languages: ${langList}.

RULES:
- Translate ALL text content to the target language
- Keep ALL technical terms, code keywords, variable names, function names, class names, and programming syntax in English (do NOT translate code)
- Keep HTML tags intact — only translate the text between tags
- Maintain the same tone and clarity
- Keep JSON structure intact

Return ONLY valid JSON (no markdown):
{
  "translations": {
    "<iso_code>": {
      "title": "translated title",
      "description": "translated description",
      "problem_statement_html": "translated HTML (code stays English)",
      "instructions": "translated instructions HTML",
      "prerequisites": "translated prerequisites",
      "submission_guidelines": "translated guidelines",
      "hints": "translated hints"
    }
  }
}`;

        const contentToTranslate = JSON.stringify({
          title: engTrans.title,
          description: engTrans.description || '',
          problem_statement_html: (engTrans.problem_statement_html || '').slice(0, 15000),
          instructions: (engTrans.instructions || '').slice(0, 5000),
          prerequisites: engTrans.prerequisites || '',
          submission_guidelines: engTrans.submission_guidelines || '',
          hints: engTrans.hints || '',
        });

        try {
          const transResult = await callAI(provider, transPrompt, contentToTranslate, Math.max(16384, missingLangs.length * 4096));
          totalInputTokens += transResult.inputTokens || 0;
          totalOutputTokens += transResult.outputTokens || 0;
          const parsed = parseJSON(transResult.text);

          if (parsed && parsed.translations) {
            for (const lang of missingLangs) {
              const t = parsed.translations[lang.iso_code];
              if (t && t.title) {
                const { error: insErr } = await supabase.from('assessment_translations').upsert({
                  assessment_id: assessment.id,
                  language_id: lang.id,
                  title: t.title,
                  description: t.description || null,
                  problem_statement_html: t.problem_statement_html || null,
                  instructions: t.instructions || null,
                  prerequisites: t.prerequisites || null,
                  submission_guidelines: t.submission_guidelines || null,
                  hints: t.hints || null,
                  meta_title: (t.title || '').slice(0, 70),
                  meta_description: (t.description || '').slice(0, 160),
                  focus_keyword: engTrans.focus_keyword || '',
                  tech_stack: engTrans.tech_stack || [],
                  learning_outcomes: engTrans.learning_outcomes || [],
                  tags: engTrans.tags || [],
                  structured_data: [],
                  is_active: true,
                  deleted_at: null,
                  created_by: userId,
                }, { onConflict: 'assessment_id,language_id' });
                if (!insErr) totalTranslated++;
                else { console.error(`[autoTranslateAssessment] Insert translation failed for assessment ${assessment.id}, lang ${lang.iso_code}:`, insErr.message); totalErrors++; }
              }
            }
          }
        } catch (e: any) {
          console.error(`Assessment ${assessment.id} translation failed:`, e.message);
          totalErrors++;
        }
      }

      // ─── 2. Translate assessment_solution_translations ───
      const { data: solutions } = await supabase
        .from('assessment_solutions')
        .select('id')
        .eq('assessment_id', assessment.id)
        .is('deleted_at', null)
        .eq('is_active', true);

      if (solutions && solutions.length > 0) {
        for (const sol of solutions) {
          // Get English solution translation
          const { data: engSolTrans, error: engSolErr } = await supabase
            .from('assessment_solution_translations')
            .select('title, description, html_content, video_title, video_description')
            .eq('assessment_solution_id', sol.id)
            .eq('language_id', 7)
            .maybeSingle();

          if (engSolErr) {
            console.error(`[autoTranslateAssessment] Error fetching English solution translation for solution ${sol.id}:`, engSolErr.message);
            continue;
          }

          if (!engSolTrans || (!engSolTrans.title && !engSolTrans.html_content && !engSolTrans.video_description)) continue;

          // Find missing languages for solution translations
          const { data: existingSolTrans } = await supabase
            .from('assessment_solution_translations')
            .select('language_id')
            .eq('assessment_solution_id', sol.id)
            .is('deleted_at', null);
          const existingSolLangIds = new Set((existingSolTrans || []).map(t => t.language_id));
          const missingSolLangs = materialLangs.filter(l => !existingSolLangIds.has(l.id));

          if (missingSolLangs.length === 0) continue;

          const solLangList = missingSolLangs.map(l => `${l.name} (${l.iso_code})`).join(', ');
          const solPrompt = `Translate the following educational assessment solution from English to these languages: ${solLangList}.

RULES:
- Translate ALL text content to the target language
- Keep ALL technical terms, code, variable names, function names in English
- Keep HTML tags intact — only translate the text between tags
- Maintain the same clarity and formatting

Return ONLY valid JSON (no markdown):
{
  "translations": {
    "<iso_code>": {
      "title": "translated title",
      "description": "translated description",
      "html_content": "translated solution HTML (code stays English)",
      "video_title": "translated video title",
      "video_description": "translated video description"
    }
  }
}`;

          const solContent = JSON.stringify({
            title: engSolTrans.title || '',
            description: engSolTrans.description || '',
            html_content: (engSolTrans.html_content || engSolTrans.video_description || '').slice(0, 15000),
            video_title: engSolTrans.video_title || '',
            video_description: (engSolTrans.video_description || '').slice(0, 5000),
          });

          try {
            const solResult = await callAI(provider, solPrompt, solContent, Math.max(16384, missingSolLangs.length * 4096));
            totalInputTokens += solResult.inputTokens || 0;
            totalOutputTokens += solResult.outputTokens || 0;
            const solParsed = parseJSON(solResult.text);

            if (solParsed && solParsed.translations) {
              for (const lang of missingSolLangs) {
                const st = solParsed.translations[lang.iso_code];
                if (st && (st.title || st.html_content || st.video_title)) {
                  const { error: solInsErr } = await supabase.from('assessment_solution_translations').upsert({
                    assessment_solution_id: sol.id,
                    language_id: lang.id,
                    title: st.title || engSolTrans.title || 'Solution',
                    description: st.description || null,
                    html_content: st.html_content || null,
                    video_title: st.video_title || null,
                    video_description: st.video_description || null,
                    is_active: true,
                    deleted_at: null,
                    created_by: userId,
                  }, { onConflict: 'assessment_solution_id,language_id' });
                  if (!solInsErr) totalSolutionTranslated++;
                  else { console.error(`[autoTranslateAssessment] Insert solution translation failed for sol ${sol.id}, lang ${lang.iso_code}:`, solInsErr.message); totalErrors++; }
                }
              }
            }
          } catch (e: any) {
            console.error(`Solution ${sol.id} translation failed:`, e.message);
            totalErrors++;
          }
        }
      }
    }

    logAdmin({
      actorId: userId,
      action: 'assessment_auto_translated',
      targetType: 'assessment',
      targetId: assessments[0]?.id,
      targetName: `translated ${assessments.length} assessment(s)`,
      ip: getClientIp(req),
    });

    return ok(res, {
      summary: {
        assessments_processed: assessments.length,
        assessment_translations_created: totalTranslated,
        solution_translations_created: totalSolutionTranslated,
        errors: totalErrors,
        languages: materialLangs.length,
      },
      usage: {
        prompt_tokens: totalInputTokens,
        completion_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens,
      },
    }, `Translated ${assessments.length} assessment(s) to ${materialLangs.length} languages`);
  } catch (error: any) {
    console.error('autoTranslateAssessment error:', error);
    return err(res, error.message || 'Failed to auto-translate assessments', 500);
  }
}
