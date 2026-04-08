import { QueryResult, QueryResultRow } from 'pg';

import { AppError } from '../core/errors/app-error';
import { logger } from '../core/logger/logger';

import { getPool } from './pg-pool';

// ─── Types ───────────────────────────────────────────────────

/** JSONB result from insert/update/delete UDFs */
export interface UdfMutationResult {
  success: boolean;
  message: string;
  id?: number | null;
  removed_count?: number;
  added_count?: number;
}

/** Named parameters for a UDF call: { p_name: 'Admin', p_code: 'admin' } */
export type UdfParams = Record<string, unknown>;

// ─── Core Query Helpers ──────────────────────────────────────

/**
 * Execute a raw SQL query with parameterized values.
 *
 * @example
 * const result = await db.query('SELECT * FROM roles WHERE id = $1', [1]);
 */
async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();

  try {
    const result = await pool.query<T>(sql, values);
    const duration = Date.now() - start;

    logger.debug({ sql: sql.substring(0, 120), duration, rows: result.rowCount }, 'db.query');

    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error({ sql: sql.substring(0, 120), duration, error }, 'db.query failed');
    throw error;
  }
}

// ─── UDF Caller: Mutation (INSERT / UPDATE / DELETE / RESTORE) ──

/**
 * Call a UDF that returns JSONB { success, message, id? }.
 * Automatically builds: SELECT udf_name(p_key := $1, p_key := $2, ...)
 *
 * @throws AppError if the UDF returns { success: false }
 *
 * @example
 * const result = await db.callFunction('udf_roles_insert', {
 *   p_name: 'Branch Manager',
 *   p_code: 'branch_manager',
 *   p_level: 3
 * });
 * // result = { success: true, message: '...', id: 9 }
 */
async function callFunction(
  functionName: string,
  params: UdfParams = {}
): Promise<UdfMutationResult> {
  const keys = Object.keys(params);
  const values = Object.values(params);

  // Build: SELECT udf_name(p_key1 := $1, p_key2 := $2)
  const paramList = keys.length > 0
    ? keys.map((key, i) => `${key} := $${i + 1}`).join(', ')
    : '';

  const sql = `SELECT ${functionName}(${paramList}) AS result`;

  const queryResult = await query<{ result: UdfMutationResult }>(sql, values);
  const row = queryResult.rows[0];

  if (!row?.result) {
    throw new AppError(
      `UDF ${functionName} returned no result`,
      500,
      'UDF_NO_RESULT'
    );
  }

  const result = row.result;

  // If the UDF returned success: false, throw as a business error
  if (!result.success) {
    // Parse common error patterns to set appropriate HTTP status codes
    const statusCode = parseUdfErrorStatus(result.message);
    throw new AppError(result.message, statusCode, 'UDF_ERROR');
  }

  return result;
}

// ─── UDF Caller: Query (SELECT / GET) ────────────────────────

/**
 * Call a UDF that returns TABLE rows (e.g., udf_get_roles).
 * Automatically builds: SELECT * FROM udf_name(p_key := $1, ...)
 *
 * @example
 * const { rows, totalCount } = await db.callTableFunction('udf_get_roles', {
 *   p_filter_is_active: true,
 *   p_sort_column: 'name',
 *   p_page_size: 10,
 *   p_page_index: 1
 * });
 */
async function callTableFunction<T extends QueryResultRow = QueryResultRow>(
  functionName: string,
  params: UdfParams = {}
): Promise<{ rows: T[]; totalCount: number }> {
  const keys = Object.keys(params);
  const values = Object.values(params);

  // Filter out null/undefined params — let the UDF use its DEFAULT values
  const filteredKeys: string[] = [];
  const filteredValues: unknown[] = [];

  keys.forEach((key, i) => {
    if (values[i] !== undefined && values[i] !== null) {
      filteredKeys.push(key);
      filteredValues.push(values[i]);
    }
  });

  const paramList = filteredKeys.length > 0
    ? filteredKeys.map((key, i) => `${key} := $${i + 1}`).join(', ')
    : '';

  const sql = `SELECT * FROM ${functionName}(${paramList})`;

  const queryResult = await query<T>(sql, filteredValues);

  // Extract total_count from first row (all rows have it via COUNT(*) OVER())
  const totalCount = queryResult.rows.length > 0
    ? Number((queryResult.rows[0] as Record<string, unknown>).total_count ?? 0)
    : 0;

  return { rows: queryResult.rows, totalCount };
}

// ─── Single Row Query Helper ─────────────────────────────────

/**
 * Execute a raw SQL query and return a single row (or null).
 * Useful for auth lookups, existence checks, etc.
 *
 * @example
 * const user = await db.queryOne<UserRow>(
 *   'SELECT id, email, password FROM users WHERE email = $1 AND is_deleted = FALSE',
 *   [email]
 * );
 */
async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values?: unknown[]
): Promise<T | null> {
  const result = await query<T>(sql, values);
  return result.rows[0] ?? null;
}

// ─── Transaction Helper ──────────────────────────────────────

/**
 * Execute multiple operations in a single transaction.
 *
 * @example
 * await db.transaction(async (client) => {
 *   await client.query('UPDATE users SET ...', [...]);
 *   await client.query('INSERT INTO role_change_log ...', [...]);
 * });
 */
async function transaction<T>(
  callback: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ─── Internal Helpers ────────────────────────────────────────

/** Map common UDF error messages to HTTP status codes */
function parseUdfErrorStatus(message: string): number {
  const msg = message.toLowerCase();

  if (msg.includes('already exists') || msg.includes('duplicate')) return 409;
  if (msg.includes('does not exist') || msg.includes('not found') || msg.includes('not deleted')) return 404;
  if (msg.includes('cannot delete') || msg.includes('cannot change') || msg.includes('cannot restore')) return 403;
  if (msg.includes('cannot be empty') || msg.includes('at least one') || msg.includes('invalid')) return 400;

  return 400; // Default: bad request for UDF business errors
}

// ─── Export ──────────────────────────────────────────────────

export const db = {
  query,
  queryOne,
  callFunction,
  callTableFunction,
  transaction
};
