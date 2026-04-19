import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';
import { logAdmin } from '../../services/activityLog.service';
import { getClientIp } from '../../utils/helpers';

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
async function callAI(provider: AIProvider, systemPrompt: string, userContent: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (provider === 'anthropic') {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
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
      max_tokens: 8192,
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
        maxOutputTokens: 8192,
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

// ─── Single-language generate (existing endpoint) ───
export async function generateTranslation(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return err(res, 'Authentication required', 401);
    if (!checkRateLimit(userId)) return err(res, 'Rate limit exceeded. Please wait a minute.', 429);

    const { category_id, target_language_code, target_language_name, prompt, provider: reqProvider } = req.body;
    if (!category_id || !target_language_code) return err(res, 'category_id and target_language_code are required', 400);

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'anthropic';
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
      userContent = JSON.stringify({ code: category.code, slug: category.slug, name: category.name || category.code, description: category.description || '' });
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
RULES: Keep JSON keys in English. Keep technical/brand words in English if they sound strange translated. Tags comma-separated. Maintain tone and intent.
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

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'anthropic';

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

      userContent = JSON.stringify({ code: category.code, slug: category.slug, name: category.name || category.code, description: category.description || '' });
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

    // Call AI (single call for all languages!)
    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);

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

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'anthropic';
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
      userContent = JSON.stringify({ code: subCat.code, slug: subCat.slug, parent_category: subCat.categories?.code || '', name: subCat.name || subCat.code, description: subCat.description || '' });
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
RULES: Keep JSON keys in English. Keep technical/brand words in English if they sound strange translated. Tags comma-separated. Maintain tone and intent.
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

    const provider: AIProvider = (['anthropic', 'openai', 'gemini'].includes(reqProvider)) ? reqProvider : 'anthropic';

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

      userContent = JSON.stringify({ code: subCat.code, slug: subCat.slug, parent_category: parentCategory, name: subCat.name || subCat.code, description: subCat.description || '' });
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

    const { text, inputTokens, outputTokens } = await callAI(provider, systemPrompt, userContent);

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
