import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';
import { logAdmin } from '../../services/activityLog.service';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';
import { uploadRawFile, createBunnyFolder, createBunnyFolders, deleteImage, listBunnyStorageRecursive, listBunnyStorage, downloadBunnyFile, type CdnTreeNode } from '../../services/storage.service';
import { fetchVideoFromUrl, buildStorageUrl, buildCollectionName, findOrCreateCollection, createCourseCollections, clearCollectionCache, getVideoStatus } from '../../services/video.service';
import { parseCourseStructure, buildCdnName, buildCourseFolderName, namesMatch, nameToSlug, normalizeCdnName, type ParsedCourse, type ParsedChapter, type ParsedTopic, type ParsedSubTopic } from '../../utils/courseParser';
import { config } from '../../config';
import { parseMaterialTree, treeSummary } from '../../utils/materialTreeParser';
import { matchSubject, matchChapter, matchTopic } from '../../services/materialMatcher.service';
import { generateMaterialData, type MaterialTreeInput } from '../../services/materialAiGenerator.service';

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
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
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
- Keep technical terms, brand names, and words that sound unnatural when translated in English (e.g., "IT Solutions", "SEO", "API", "Software", "Website").
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

function buildMaterialJsonSpec(fields: string[]): string {
  return '{' + fields.map(f => `"${f}":"..."`).join(', ') + '}';
}

function extractMaterialFields(translated: any, fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const f of fields) result[f] = translated[f] || '';
  return result;
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

    const { topic_id, language_id, prompt, provider: reqProvider } = req.body;
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

    // Look up topic with parent chain for folder path
    const { data: topic } = await supabase
      .from('topics')
      .select('id, slug, chapter_id, chapters(slug, subject_id, subjects(slug))')
      .eq('id', topic_id)
      .single();
    if (!topic) return err(res, 'Topic not found', 404);

    // Build Bunny folder path from parent slugs
    const chapterData = (topic as any).chapters;
    const subjectSlug = chapterData?.subjects?.slug;
    const chapterSlug = chapterData?.slug;
    const materialBasePath = (subjectSlug && chapterSlug)
      ? `materials/${subjectSlug}/${chapterSlug}/${topic.slug}`
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

      // Check if sub_topic with this slug exists under this topic
      const { data: existingSt } = await supabase
        .from('sub_topics')
        .select('id, slug')
        .eq('topic_id', topic_id)
        .eq('slug', slug)
        .is('deleted_at', null)
        .single();

      let subTopicId: number;

      if (existingSt) {
        subTopicId = existingSt.id;
        updatedSubTopics++;
      } else {
        const difficultyLevel = ['beginner', 'intermediate', 'advanced', 'expert', 'all_levels'].includes(st.difficulty_level)
          ? st.difficulty_level : 'all_levels';
        const estimatedMinutes = typeof st.estimated_minutes === 'number' ? st.estimated_minutes : 30;

        const { data: newSt, error: stErr } = await supabase
          .from('sub_topics')
          .insert({
            topic_id,
            slug,
            display_order: displayOrder++,
            difficulty_level: difficultyLevel,
            estimated_minutes: estimatedMinutes,
            is_active: true,
            created_by: userId,
          })
          .select('id')
          .single();

        if (stErr || !newSt) {
          console.error('Failed to create sub_topic:', stErr);
          continue;
        }
        subTopicId = newSt.id;
        createdSubTopics++;
      }

      // Check if translation exists (include page URL so we can delete old file)
      const { data: existingTrans } = await supabase
        .from('sub_topic_translations')
        .select('id, page')
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

      // Upload HTML file to Bunny storage using original filename
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
        is_new: !existingSt,
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
      created: { subjects: 0, chapters: 0, topics: 0 },
      skipped: { subjects: 0, chapters: 0, topics: 0 },
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

        // Create Bunny folder
        createBunnyFolder(`materials/${slug}`).catch(() => {});
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
          const slug = await generateUniqueSlug(supabase, 'chapters', parsedChapter.name);
          const { data: newChapter, error: chErr } = await supabase
            .from('chapters')
            .insert({
              slug,
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

          // Create Bunny folder
          createBunnyFolder(`materials/${subjectSlug}/${slug}`).catch(() => {});
        }

        const aiChapter: any = { name: parsedChapter.name, isNew: chapterIsNew, topics: [] };

        // Process topics
        for (let ti = 0; ti < parsedChapter.topics.length; ti++) {
          const parsedTopic = parsedChapter.topics[ti];
          const topicMatch = await matchTopic(parsedTopic.name, chapterId);

          if (topicMatch.found) {
            report.skipped.topics++;
            report.details.push({ type: 'topic', name: parsedTopic.name, action: 'skipped', id: topicMatch.id, parent: parsedChapter.name });
            aiChapter.topics.push({ name: parsedTopic.name, isNew: false });
          } else {
            // Create new topic
            const slug = await generateUniqueSlug(supabase, 'topics', parsedTopic.name);
            const { data: newTopic, error: tErr } = await supabase
              .from('topics')
              .insert({
                slug,
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

            report.created.topics++;
            report.details.push({ type: 'topic', name: parsedTopic.name, action: 'created', id: newTopic.id, slug, parent: parsedChapter.name });
            aiChapter.topics.push({ name: parsedTopic.name, isNew: true });

            // Create Bunny folders: topic + resources + language subfolders
            const basePath = `materials/${subjectSlug}/${chapterSlug}/${slug}`;
            const folders = [basePath, `${basePath}/resources`];
            for (const lang of activeLangs) {
              folders.push(`${basePath}/${lang.iso_code}`);
            }
            createBunnyFolders(folders).catch(() => {});
          }
        }

        aiSubject.chapters.push(aiChapter);
      }

      aiTree.subjects.push(aiSubject);
    }

    // ─── Phase 2: Generate AI translations for all new items ───
    let aiGenerated = false;
    if (generateTranslations && activeLangs.length > 0) {
      const totalNew = report.created.subjects + report.created.chapters + report.created.topics;
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
              detail.type === 'topic' ? aiData.topics[detail.name] : null;

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
                'topic_translations';

              const fkField =
                detail.type === 'subject' ? 'subject_id' :
                detail.type === 'chapter' ? 'chapter_id' :
                'topic_id';

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
      targetName: `Imported ${report.created.subjects}S/${report.created.chapters}C/${report.created.topics}T (skipped ${report.skipped.subjects}S/${report.skipped.chapters}C/${report.skipped.topics}T)`,
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

    // Get the base filename without extension for naming translated files
    const baseFileName = file.originalname.replace(/\.(html|htm)$/i, '');

    // Get sub-topic with full parent hierarchy for folder path
    const { data: subTopic } = await supabase
      .from('sub_topics')
      .select('id, slug, topic_id, topics(slug, chapter_id, chapters(slug, subject_id, subjects(slug)))')
      .eq('id', sub_topic_id)
      .single();
    if (!subTopic) return err(res, 'Sub-topic not found', 404);

    const parentTopic = (subTopic as any).topics;
    const parentChapter = parentTopic?.chapters;
    const parentSubject = parentChapter?.subjects;
    const materialBasePath = (parentSubject?.slug && parentChapter?.slug && parentTopic?.slug)
      ? `materials/${parentSubject.slug}/${parentChapter.slug}/${parentTopic.slug}`
      : null;

    // Get all active material languages EXCEPT English
    const { data: allLangs } = await supabase
      .from('languages')
      .select('id, name, native_name, iso_code')
      .eq('is_active', true)
      .eq('for_material', true)
      .order('id');

    // skip_language: ISO code of a language to skip (e.g. source language when reverse-translating)
    const skipLanguage = req.body.skip_language || null;
    const targetLangs = (allLangs || []).filter(l => l.iso_code !== 'en' && l.iso_code !== skipLanguage);
    if (targetLangs.length === 0) return err(res, 'No target languages found for translation', 400);

    // Get context about the subject/chapter/topic for better translation
    const subjectName = parentSubject?.slug?.replace(/-/g, ' ') || '';
    const chapterName = parentChapter?.slug?.replace(/-/g, ' ') || '';
    const topicName = parentTopic?.slug?.replace(/-/g, ' ') || '';

    const results: { language: string; iso_code: string; status: string; page_url?: string; error?: string }[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Translate one language at a time for quality
    for (const lang of targetLangs) {
      try {
        const systemPrompt = `You are an expert translator. Translate the following HTML page from English to ${lang.name} (${lang.native_name}).

CRITICAL RULES:
1. Preserve ALL HTML tags, attributes, classes, IDs, styles, scripts EXACTLY as they are. Do NOT modify any HTML structure.
2. Only translate the visible text content between HTML tags.
3. Keep ALL technical terms, programming keywords, and code in English. Examples: HTML, CSS, JavaScript, Python, Pandas, DataFrame, API, JSON, REST, SQL, Git, React, Node.js, npm, webpack, function, class, variable, array, object, string, boolean, integer, float, import, export, async, await, try, catch, throw, return, const, let, var, if, else, for, while, switch, case, break, continue, null, undefined, true, false, NaN, Infinity, console.log, getElementById, querySelector, addEventListener, fetch, Promise, callback, middleware, endpoint, framework, library, module, component, prop, state, hook, render, DOM, HTTP, HTTPS, URL, URI, TCP, UDP, DNS, IP, SSL, TLS, SSH, FTP, CDN, CMS, SDK, IDE, CLI, GUI, OOP, MVC, CRUD, SPA, SSR, CSR, PWA, SEO, UX, UI, etc.
4. Keep brand names and product names in English (Google, Microsoft, Apple, GitHub, Stack Overflow, VS Code, etc.)
5. Keep code snippets, code examples, and inline code EXACTLY in English - do not translate any code.
6. Do NOT translate content inside <code>, <pre>, <script>, <style> tags.
7. Do NOT add any explanation, comments, or wrapper - return ONLY the translated HTML.
8. The subject is "${subjectName}", chapter is "${chapterName}", topic is "${topicName}" - keep these and related technical terms in English where translation would sound unnatural or weird.
9. Use natural, easy-to-understand ${lang.name} for non-technical content. Mix English technical words naturally within ${lang.name} sentences.
10. Do NOT translate alt attributes of images if they contain technical terms.

Return ONLY the complete translated HTML document, nothing else.`;

        // Calculate max tokens based on HTML size (translated HTML is usually similar or slightly larger)
        const estimatedTokens = Math.max(16384, Math.ceil(htmlContent.length / 2));
        const aiResult = await callAIRaw(provider, systemPrompt, htmlContent, estimatedTokens);
        totalInputTokens += aiResult.inputTokens;
        totalOutputTokens += aiResult.outputTokens;

        // Clean up AI response — strip any markdown code fences
        let translatedHtml = aiResult.text.trim();
        if (translatedHtml.startsWith('```html')) {
          translatedHtml = translatedHtml.replace(/^```html\s*\n?/, '').replace(/\n?```\s*$/, '');
        } else if (translatedHtml.startsWith('```')) {
          translatedHtml = translatedHtml.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
        }

        if (!translatedHtml || translatedHtml.length < 50) {
          results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: 'AI returned empty or too short translation' });
          continue;
        }

        // Check if existing translation has a page file to delete
        const { data: existingTrans } = await supabase
          .from('sub_topic_translations')
          .select('id, page')
          .eq('sub_topic_id', sub_topic_id)
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
        const uploadPath = materialBasePath
          ? `${materialBasePath}/${lang.iso_code}/${translatedFileName}`
          : `sub-topic-translations/pages/${translatedFileName}`;

        const pageUrl = await uploadRawFile(Buffer.from(translatedHtml, 'utf-8'), uploadPath);

        // Update or create DB record
        if (existingTrans) {
          await supabase
            .from('sub_topic_translations')
            .update({ page: pageUrl, updated_by: userId })
            .eq('id', existingTrans.id);
        } else {
          await supabase
            .from('sub_topic_translations')
            .insert({
              sub_topic_id: Number(sub_topic_id),
              language_id: lang.id,
              name: subTopic.slug.replace(/-/g, ' '),
              page: pageUrl,
              is_active: true,
              created_by: userId,
            });
        }

        results.push({ language: lang.name, iso_code: lang.iso_code, status: 'success', page_url: pageUrl });
      } catch (langErr: any) {
        console.error(`Translation failed for ${lang.name}:`, langErr);
        results.push({ language: lang.name, iso_code: lang.iso_code, status: 'error', error: langErr.message || 'Translation failed' });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    logAdmin({
      actorId: userId,
      action: 'page_translated',
      targetType: 'sub_topic_translation',
      targetId: Number(sub_topic_id),
      targetName: subTopic.slug,
      ip: getClientIp(req),
      metadata: { provider, languages: successCount, errors: errorCount, inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    });

    return ok(res, {
      results,
      summary: { total: targetLangs.length, success: successCount, errors: errorCount },
      tokens: { input: totalInputTokens, output: totalOutputTokens },
    }, `Translated to ${successCount}/${targetLangs.length} languages`);
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
    } = req.body;

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
      supabase.from('sub_topics').select('id, slug, topic_id, sort_order, display_order, video_id, video_source').is('deleted_at', null),
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
      videos: { found: 0, matched: 0, uploaded: 0, replaced: 0, status_checked: 0, now_ready: 0, errors: 0 },
      errors: [] as string[],
    };

    // ─── Phase 1: Scan CDN root, find course folders + .txt files ───
    const rootItems = await listBunnyStorageRecursive('');

    const rootFolders = rootItems.filter(n => n.isDirectory && n.name.toLowerCase() !== 'assets' && n.name.toLowerCase() !== 'materials');

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
            .insert({ code: subjectCode, slug: newSlug, is_active: true, display_order: 1, sort_order: 1, created_by: userId })
            .select('id, code, slug')
            .single();

          if (createErr || !created) {
            report.errors.push(`Failed to create subject "${parsedCourse.name}": ${createErr?.message}`);
            continue;
          }
          subject = created;
          existingSubjectsBySlug.set(newSlug, created);
          existingSubjectsByCode.set(subjectCode.toLowerCase(), created);
        }
        report.subjects.created++;
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
            parsedCourse.name,
            parsedCourse.chapters.map(ch => ({
              name: ch.name,
              topics: ch.topics.map(tp => ({ name: tp.name })),
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

      // ─── Phase 2b: Create/Update Chapters, Topics, Sub-Topics from .txt ───
      for (const parsedChapter of parsedCourse.chapters) {
        report.chapters.found++;

        const chapterSlug = nameToSlug(parsedChapter.name);

        // Match: by slug (primary), then fuzzy ilike, then by position (rename detection)
        let chapter = existingChapters.get(`${subject.id}:${chapterSlug}`);

        // Fuzzy match by slug prefix
        if (!chapter && isSync) {
          const subjectChapters = chaptersBySubject.get(subject.id) || [];
          // Try fuzzy slug match
          const fuzzy = subjectChapters.find(c => c.slug.startsWith(chapterSlug.slice(0, 10)));
          if (fuzzy) chapter = fuzzy;
          // Try position-based match (rename detection)
          if (!chapter) {
            const byPos = subjectChapters.find(c => c.sort_order === parsedChapter.order);
            if (byPos) chapter = byPos;
          }
        }

        if (!chapter) {
          if (!isDryRun) {
            const newSlug = await generateUniqueSlug(supabase, 'chapters', chapterSlug);
            const { data: created, error: createErr } = await supabase
              .from('chapters')
              .insert({
                slug: newSlug,
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
          }
          report.chapters.created++;
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

        for (const parsedTopic of parsedChapter.topics) {
          report.topics.found++;

          const topicSlug = nameToSlug(parsedTopic.name);

          let topic = existingTopics.get(`${chapter.id}:${topicSlug}`);

          // Fuzzy match for sync
          if (!topic && isSync && chapter.id > 0) {
            const chapterTopics = topicsByChapter.get(chapter.id) || [];
            const fuzzy = chapterTopics.find(t => t.slug.startsWith(topicSlug.slice(0, 10)));
            if (fuzzy) topic = fuzzy;
            if (!topic) {
              const byPos = chapterTopics.find(t => t.sort_order === parsedTopic.order);
              if (byPos) topic = byPos;
            }
          }

          if (!topic) {
            if (!isDryRun) {
              const newSlug = await generateUniqueSlug(supabase, 'topics', topicSlug);
              const { data: created, error: createErr } = await supabase
                .from('topics')
                .insert({
                  slug: newSlug,
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
            }
            report.topics.created++;
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
          const subTopicDbMap = new Map<string, { id: number; slug: string }>();

          for (const parsedST of parsedTopic.subTopics) {
            const stSlug = nameToSlug(parsedST.name);

            let subTopic = existingSubTopics.get(`${topic.id}:${stSlug}`);

            if (!subTopic && topic.id > 0) {
              // Fuzzy match by ilike
              const { data: fuzzyMatch } = await supabase
                .from('sub_topics')
                .select('id, slug, sort_order, display_order, video_id, video_source')
                .eq('topic_id', topic.id)
                .is('deleted_at', null)
                .ilike('slug', `${stSlug}%`)
                .limit(1);

              if (fuzzyMatch?.length) {
                subTopic = fuzzyMatch[0];
                existingSubTopics.set(`${topic.id}:${subTopic.slug}`, subTopic);
              }
            }

            // Position-based match for sync (rename detection)
            if (!subTopic && isSync && topic.id > 0) {
              const topicSTs = subTopicsByTopic.get(topic.id) || [];
              const byPos = topicSTs.find(st => st.sort_order === parsedST.order);
              if (byPos) {
                subTopic = byPos;
                existingSubTopics.set(`${topic.id}:${byPos.slug}`, byPos);
              }
            }

            if (!subTopic) {
              report.sub_topics.found++;
              if (!isDryRun) {
                const newSlug = await generateUniqueSlug(supabase, 'sub_topics', stSlug);
                const { data: created, error: stErr } = await supabase
                  .from('sub_topics')
                  .insert({
                    slug: newSlug,
                    topic_id: topic.id,
                    display_order: parsedST.order,
                    sort_order: parsedST.order,
                    difficulty_level: 'all_levels',
                    estimated_minutes: 30,
                    is_active: true,
                    created_by: userId,
                  })
                  .select('id, slug')
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
              }
              report.sub_topics.created++;
            } else {
              // Sync mode: update sort_order if changed
              if (isSync && (subTopic.sort_order !== parsedST.order || subTopic.display_order !== parsedST.order)) {
                if (!isDryRun) {
                  await supabase.from('sub_topics').update({
                    sort_order: parsedST.order,
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
              subTopic = { id: -1, slug: stSlug };
            }

            if (subTopic.id > 0) seenSubTopicIds.add(subTopic.id);

            subTopicDbMap.set(parsedST.name.toLowerCase(), { id: subTopic.id, slug: subTopic.slug });
          }

          // ─── Phase 3: Scan CDN topic folder for language files ───
          const topicCdnFolder = chapterCdnChildren_items.find(n => namesMatch(n.name, parsedTopic.name));

          if (topicCdnFolder) {
            const topicChildren = topicCdnFolder.children || [];
            // Track which translation keys are "seen" on CDN
            const seenTransKeys = new Set<string>();

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

                const fileBaseName = fileNode.name.replace(/\.(html|htm)$/i, '');
                const normalized = normalizeCdnName(fileBaseName);

                let matchedST: { id: number; slug: string } | undefined;

                matchedST = subTopicDbMap.get(normalized);

                if (!matchedST) {
                  for (const [txtName, stRecord] of subTopicDbMap) {
                    if (normalized.replace(/[^a-z0-9]/g, '') === txtName.replace(/[^a-z0-9]/g, '')) {
                      matchedST = stRecord;
                      break;
                    }
                  }
                }

                if (!matchedST) {
                  report.errors.push(`No matching sub-topic for file "${fileNode.name}" in ${topicCdnFolder.name}/${folderName}/`);
                  continue;
                }

                seenTransKeys.add(`${matchedST.id}:${lang.id}`);

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

                const topicCollName = buildCollectionName(parsedCourse.name, parsedChapter.name, parsedTopic.name);
                const topicCollId = streamCollections.get(topicCollName);

                for (const videoNode of videoFiles) {
                  report.videos.found++;

                  const videoBaseName = videoNode.name.replace(/\.\w+$/i, '');
                  const normalizedVideo = normalizeCdnName(videoBaseName);

                  let matchedST: { id: number; slug: string } | undefined;
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
                    const videoTitle = `${matchedST.slug}-${matchedST.id}`;
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
        }
      }

      // ─── Phase 5: Sync deletions (soft delete items not in .txt) ───
      if (isSync && subject.id > 0) {
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

    // Build all CDN folder paths
    const { buildCdnPaths } = require('../../utils/courseParser');
    const paths = buildCdnPaths(parseResult.course, langCodes);

    // Create folders in batches
    const batchSize = 10;
    let created = 0;
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      await createBunnyFolders(batch);
      created += batch.length;
    }

    // Also create the .txt file on CDN
    const courseFolderName = buildCourseFolderName(parseResult.course.name);
    const txtPath = `${courseFolderName}/${courseFolderName}.txt`;
    await uploadRawFile(Buffer.from(txt_content, 'utf-8'), txtPath);

    // Create matching Bunny Stream collection hierarchy for videos
    let streamCollectionsCreated = 0;
    try {
      const collections = await createCourseCollections(
        parseResult.course.name,
        parseResult.course.chapters.map(ch => ({
          name: ch.name,
          topics: ch.topics.map(tp => ({ name: tp.name })),
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

    // Find all sub-topics with pending videos
    const { data: pendingSTs, error: fetchErr } = await supabase
      .from('sub_topics')
      .select('id, slug, video_id, video_source')
      .eq('video_source', 'bunny_pending')
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
