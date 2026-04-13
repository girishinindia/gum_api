// ═══════════════════════════════════════════════════════════════
// skills.service — UDF wrappers for the /api/v1/skills module.
// ═══════════════════════════════════════════════════════════════

import sharp from 'sharp';

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { AppError } from '../../core/errors/app-error';
import { logger } from '../../core/logger/logger';
import { env } from '../../config/env';
import { bunnyStorageService } from '../../integrations/bunny/bunny-storage.service';

import type {
  CreateSkillBody,
  ListSkillsQuery,
  UpdateSkillBody
} from './skills.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface SkillDto {
  id: number;
  name: string;
  category: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface SkillRow {
  skill_id: number | string;
  skill_name: string;
  skill_category: string;
  skill_description: string | null;
  skill_icon_url: string | null;
  skill_is_active: boolean;
  skill_is_deleted: boolean;
  skill_created_at: Date | string | null;
  skill_updated_at: Date | string | null;
  skill_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapSkill = (row: SkillRow): SkillDto => ({
  id: Number(row.skill_id),
  name: row.skill_name,
  category: row.skill_category,
  description: row.skill_description,
  iconUrl: row.skill_icon_url,
  isActive: row.skill_is_active,
  isDeleted: row.skill_is_deleted,
  createdAt: toIsoString(row.skill_created_at),
  updatedAt: toIsoString(row.skill_updated_at),
  deletedAt: toIsoString(row.skill_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListSkillsResult {
  rows: SkillDto[];
  meta: PaginationMeta;
}

export const listSkills = async (q: ListSkillsQuery): Promise<ListSkillsResult> => {
  const { rows, totalCount } = await db.callTableFunction<SkillRow>(
    'udf_get_skills',
    {
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_category: q.category ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapSkill),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getSkillById = async (id: number): Promise<SkillDto | null> => {
  const { rows } = await db.callTableFunction<SkillRow>('udf_get_skills', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapSkill(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateSkillResult {
  id: number;
}

export const createSkill = async (
  body: CreateSkillBody,
  callerId: number | null
): Promise<CreateSkillResult> => {
  const result = await db.callFunction('udf_skills_insert', {
    p_name: body.name,
    p_category: body.category,
    p_description: body.description ?? null,
    p_icon_url: body.iconUrl ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateSkill = async (
  id: number,
  body: UpdateSkillBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_skills_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_category: body.category ?? null,
    p_description: body.description ?? null,
    p_icon_url: body.iconUrl ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Icon upload pipeline ─────────────────────────────────────────
//
// Mirrors the pattern in specializations.service.ts:
//   sharp decode → resize into 256×256 box → quality-loop WebP encode
//   → Bunny delete-then-PUT → write icon_url column.

const ICON_MAX_BYTES = 100 * 1024;
const ICON_BOX_PX = 256;
const ICON_INITIAL_QUALITY = 80;
const ICON_MIN_QUALITY = 40;
const ICON_QUALITY_STEP = 10;

/** Direct SQL update of icon_url (UDF doesn't carry this column). */
const setSkillIconUrl = async (
  id: number,
  iconUrl: string | null,
  callerId: number | null
): Promise<void> => {
  await db.query(
    `UPDATE skills
        SET icon_url   = $2,
            updated_by = COALESCE($3, updated_by),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND is_deleted = FALSE`,
    [id, iconUrl, callerId]
  );
};

const extractBunnyPath = (cdnUrl: string | null): string | null => {
  if (!cdnUrl) return null;
  const base = env.BUNNY_CDN_URL.replace(/\/+$/, '');
  if (!cdnUrl.startsWith(base + '/')) return null;
  return cdnUrl.slice(base.length + 1);
};

const safeDeleteFromBunny = async (path: string, skillId: number): Promise<void> => {
  try {
    await bunnyStorageService.delete(path);
  } catch (err) {
    logger.warn({ err, path, skillId }, 'Skill icon: best-effort Bunny delete failed; continuing');
  }
};

const encodeIconToCappedWebp = async (input: Buffer): Promise<Buffer | null> => {
  for (let quality = ICON_INITIAL_QUALITY; quality >= ICON_MIN_QUALITY; quality -= ICON_QUALITY_STEP) {
    const out = await sharp(input)
      .resize({ width: ICON_BOX_PX, height: ICON_BOX_PX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (out.byteLength <= ICON_MAX_BYTES) return out;
  }
  return null;
};

export const processSkillIconUpload = async (
  id: number,
  file: Express.Multer.File,
  callerId: number | null
): Promise<SkillDto> => {
  const existing = await getSkillById(id);
  if (!existing) throw AppError.notFound(`Skill ${id} not found`);
  if (existing.isDeleted) {
    throw AppError.badRequest(`Skill ${id} is soft-deleted; restore it before uploading an icon`);
  }

  try {
    await sharp(file.buffer).metadata();
  } catch (err) {
    logger.warn({ err, skillId: id }, 'Skill icon: sharp failed to read metadata');
    throw AppError.badRequest('Uploaded file is not a readable image');
  }

  let webpBuffer: Buffer | null;
  try {
    webpBuffer = await encodeIconToCappedWebp(file.buffer);
  } catch (err) {
    logger.error({ err, skillId: id }, 'Skill icon: sharp WebP encode failed');
    throw AppError.internal('Failed to convert skill icon to WebP');
  }
  if (!webpBuffer) {
    throw AppError.badRequest(
      `Skill icon is too complex to compress under ${Math.round(ICON_MAX_BYTES / 1024)} KB. Try a simpler image.`,
      { maxBytes: ICON_MAX_BYTES }
    );
  }

  const targetPath = `skills/icons/${id}.webp`;
  const priorPathFromUrl = extractBunnyPath(existing.iconUrl);
  const pathsToEvict = new Set<string>();
  if (priorPathFromUrl) pathsToEvict.add(priorPathFromUrl);
  if (priorPathFromUrl !== targetPath) pathsToEvict.add(targetPath);

  for (const p of pathsToEvict) {
    await safeDeleteFromBunny(p, id);
  }

  const uploadResult = await bunnyStorageService.upload({
    buffer: webpBuffer,
    targetPath,
    contentType: 'image/webp'
  });

  const newIconUrl = uploadResult.cdnUrl;
  await setSkillIconUrl(id, newIconUrl, callerId);

  const updated = await getSkillById(id);
  return updated!;
};

export const deleteSkillIcon = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  const existing = await getSkillById(id);
  if (!existing) throw AppError.notFound(`Skill ${id} not found`);
  if (!existing.iconUrl) return; // nothing to delete

  const bunnyPath = extractBunnyPath(existing.iconUrl);
  if (bunnyPath) await safeDeleteFromBunny(bunnyPath, id);

  await setSkillIconUrl(id, null, callerId);
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteSkill = async (id: number): Promise<void> => {
  await db.callFunction('udf_skills_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreSkill = async (id: number): Promise<void> => {
  await db.callFunction('udf_skills_restore', { p_id: id });
};
