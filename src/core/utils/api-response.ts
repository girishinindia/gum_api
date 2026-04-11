import type { Response } from 'express';

import type {
  ApiPaginated,
  ApiSuccess,
  PaginationMeta
} from '../types/common.types';

// ═══════════════════════════════════════════════════════════════
// Tiny response helpers so controllers don't hand-roll the
// envelope shape. The envelope matches the Swagger schemas
// (SuccessResponse / PaginatedResponse / ErrorResponse).
// ═══════════════════════════════════════════════════════════════

export const ok = <T>(
  res: Response,
  data: T,
  message = 'OK',
  status = 200
): Response<ApiSuccess<T>> => {
  return res.status(status).json({
    success: true,
    message,
    data
  });
};

export const created = <T>(
  res: Response,
  data: T,
  message = 'Created'
): Response<ApiSuccess<T>> => ok(res, data, message, 201);

export const paginated = <T>(
  res: Response,
  rows: T[],
  meta: PaginationMeta,
  message = 'OK'
): Response<ApiPaginated<T>> => {
  return res.status(200).json({
    success: true,
    message,
    data: rows,
    meta
  });
};

export const buildPaginationMeta = (
  pageIndex: number,
  pageSize: number,
  totalCount: number
): PaginationMeta => ({
  page: pageIndex,
  limit: pageSize,
  totalCount,
  totalPages: pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0
});
