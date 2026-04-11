// ═══════════════════════════════════════════════════════════════
// learning-goals.service — UDF wrappers for /api/v1/learning-goals
//
// Includes the icon upload pipeline (using shared bunny-image-pipeline helper):
//   multer buffer → shared replaceImage() → persist URL via
//   a raw SQL UPDATE (UDF update signature does NOT carry icon_url).
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { AppError } from '../../core/errors/app-error';
import { logger } from '../../core/logger/logger';
import {
  replaceImage,
  clearImage,
  ICON_BOX_PX,
  type ReplaceImageResult
} from '../../integrations/bunny/bunny-image-pipeline';

import type {
  CreateLearningGoalBody,
  ListLearningGoalsQuery,
  UpdateLearningGoalBody
} from './learning-goals.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface LearningGoalDto {
  id: number;
  name: string;
  description: string | null;
  iconUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface LearningGoalRow {
  learning_goal_id: number | string;
  learning_goal_name: string;
  learning_goal_description: string | null;
  learning_goal_icon_url: string | null;
  learning_goal_display_order: number;
  learning_goal_created_by: number | string | null;
  learning_goal_updated_by: number | string | null;
  learning_goal_is_active: boolean;
  learning_goal_is_deleted: boolean;
  learning_goal_created_at: Date | string | null;
  learning_goal_updated_at: Date | string | null;
  learning_goal_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapLearningGoal = (row: LearningGoalRow): LearningGoalDto => ({
  id: Number(row.learning_goal_id),
  name: row.learning_goal_name,
  description: row.learning_goal_description,
  iconUrl: row.learning_goal_icon_url,
  displayOrder: row.learning_goal_display_order,
  isActive: row.learning_goal_is_active,
  isDeleted: row.learning_goal_is_deleted,
  createdAt: toIsoString(row.learning_goal_created_at),
  updatedAt: toIsoString(row.learning_goal_updated_at),
  deletedAt: toIsoString(row.learning_goal_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListLearningGoalsResult {
  rows: LearningGoalDto[];
  meta: PaginationMeta;
}

export const listLearningGoals = async (
  q: ListLearningGoalsQuery
): Promise<ListLearningGoalsResult> => {
  const { rows, totalCount } = await db.callTableFunction<LearningGoalRow>(
    'udf_get_learning_goals',
    {
      p_id: null,
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapLearningGoal),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getLearningGoalById = async (
  id: number
): Promise<LearningGoalDto | null> => {
  const { rows } = await db.callTableFunction<LearningGoalRow>(
    'udf_get_learning_goals',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapLearningGoal(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateLearningGoalResult {
  id: number;
}

export const createLearningGoal = async (
  body: CreateLearningGoalBody,
  callerId: number | null
): Promise<CreateLearningGoalResult> => {
  const result = await db.callFunction('udf_learning_goals_insert', {
    p_name: body.name,
    p_description: body.description ?? null,
    p_display_order: body.displayOrder ?? 0,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateLearningGoal = async (
  id: number,
  body: UpdateLearningGoalBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_learning_goals_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_description: body.description ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteLearningGoal = async (id: number): Promise<void> => {
  await db.callFunction('udf_learning_goals_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreLearningGoal = async (id: number): Promise<void> => {
  await db.callFunction('udf_learning_goals_restore', { p_id: id });
};

// ─── Icon upload / delete (Bunny CDN) ────────────────────────────

/**
 * Internal-only: write the icon_url column directly. The
 * `udf_learning_goals_update` signature does not carry icon_url, so
 * this function is the only path that changes it — called exclusively
 * from `processLearningGoalIconUpload` and `deleteLearningGoalIcon`.
 */
const setLearningGoalIconUrl = async (
  id: number,
  iconUrl: string | null,
  callerId: number | null
): Promise<void> => {
  await db.query(
    `UPDATE learning_goals
        SET icon_url   = $2,
            updated_by = COALESCE($3, updated_by),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND is_deleted = FALSE`,
    [id, iconUrl, callerId]
  );
};

export const processLearningGoalIconUpload = async (
  id: number,
  file: Express.Multer.File,
  callerId: number | null
): Promise<LearningGoalDto> => {
  // 1. Learning goal must exist and not be soft-deleted.
  const existing = await getLearningGoalById(id);
  if (!existing) {
    throw AppError.notFound(`Learning goal ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Learning goal ${id} is soft-deleted; restore it before uploading an icon`
    );
  }

  // 2. Replace the image on Bunny (includes validation & encoding).
  const targetPath = `learning-goals/icons/${id}.webp`;
  const result = await replaceImage({
    inputBuffer: file.buffer,
    targetPath,
    currentUrl: existing.iconUrl,
    boxPx: ICON_BOX_PX,
    logContext: { learningGoalId: id }
  });

  if (!result) {
    throw AppError.badRequest(
      'Learning goal icon is too complex to compress under 100 KB. Try a simpler image.',
      { maxBytes: 100 * 1024 }
    );
  }

  // 3. Persist the URL via the internal-only setter.
  await setLearningGoalIconUrl(id, result.cdnUrl, callerId);

  // 4. Return the refreshed row so the client can render it immediately.
  const refreshed = await getLearningGoalById(id);
  if (!refreshed) {
    throw AppError.internal('Learning goal disappeared after icon upload');
  }
  return refreshed;
};

export const deleteLearningGoalIcon = async (
  id: number,
  callerId: number | null
): Promise<LearningGoalDto> => {
  const existing = await getLearningGoalById(id);
  if (!existing) {
    throw AppError.notFound(`Learning goal ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Learning goal ${id} is soft-deleted; restore it before deleting its icon`
    );
  }

  // Best-effort delete of any stored Bunny object, then clear the column.
  const targetPath = `learning-goals/icons/${id}.webp`;
  await clearImage({
    targetPath,
    currentUrl: existing.iconUrl,
    logContext: { learningGoalId: id }
  });

  await setLearningGoalIconUrl(id, null, callerId);

  const refreshed = await getLearningGoalById(id);
  if (!refreshed) {
    throw AppError.internal('Learning goal disappeared after icon deletion');
  }
  return refreshed;
};
