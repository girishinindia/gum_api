/**
 * Phase 11.4.2 — Typed RPC wrapper around supabase.rpc(...)
 *
 * Every Postgres function call should go through `db.callFn(name, args)`
 * instead of `supabase.rpc(...)` directly. This gives us:
 *
 *   1. **Centralised logging** — one log line per RPC, with timing, args
 *      shape, and outcome. No more dozens of bespoke try/catch blocks.
 *   2. **Prometheus metrics** — counters + a latency histogram bucketed by
 *      function name. Surfaces slow UDFs in dashboards.
 *   3. **Sentry breadcrumbs** — every call leaves a trail so when an
 *      exception fires later in the request, you can see which UDFs ran.
 *   4. **Single error funnel** — RPC errors are normalised to a `DbError`
 *      with `code`, `details`, `hint`, `message` exposed consistently.
 *
 * Naming convention: prefer the literal Postgres function name as the
 * first arg (e.g. `db.callFn('fn_wallet_credit', { ... })`). Eventually
 * the supabase-generated types in `src/types/database.ts` (Phase 11.4.3)
 * will narrow `args` and the return type by name.
 */

import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { rpcCallsTotal, rpcCallDurationSeconds } from './metrics.service';
import { config } from '../config';
import type { Database } from '../types/database';

/** Names of all public-schema Postgres functions exposed to PostgREST. */
export type RpcName = keyof Database['public']['Functions'];

type RpcArgs<F extends RpcName>    = Database['public']['Functions'][F]['Args'];
type RpcReturns<F extends RpcName> = Database['public']['Functions'][F]['Returns'];

export class DbError extends Error {
  public readonly fn:      string;
  public readonly code:    string | null;
  public readonly details: string | null;
  public readonly hint:    string | null;

  constructor(fn: string, e: { code?: string | null; details?: string | null; hint?: string | null; message: string }) {
    super(e.message);
    this.name    = 'DbError';
    this.fn      = fn;
    this.code    = e.code    ?? null;
    this.details = e.details ?? null;
    this.hint    = e.hint    ?? null;
  }
}

interface CallOptions {
  /** If true, swallow the error and return null instead of throwing. Useful for `IF EXISTS`-style probes. */
  silent?: boolean;
  /** Drop a Sentry breadcrumb. Defaults to true. */
  breadcrumb?: boolean;
}

function sentryBreadcrumb(fn: string, args: unknown) {
  if (!config.sentry.dsn) return;
  try {
    // Lazy require keeps the dep optional at runtime.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node');
    Sentry.addBreadcrumb({
      category: 'db.rpc',
      message:  fn,
      level:    'info',
      data:     { args_keys: args && typeof args === 'object' ? Object.keys(args) : [] },
    });
  } catch {
    /* swallow — Sentry breadcrumbs are best-effort */
  }
}

/**
 * Invoke a Postgres function via Supabase. Returns the row(s) the function
 * yielded. Throws DbError on failure unless `silent: true` is passed.
 *
 * Two call styles:
 *
 *  1. **Typed**  (preferred) — `fn` is a known UDF name, args and return
 *     shape come from `src/types/database.ts`:
 *       `const rows = await db.callFn('fn_wallet_credit', { p_user_id: 42, ... });`
 *
 *  2. **Untyped escape hatch** — pass an explicit `<T>` generic when the
 *     function isn't in the generated types yet (e.g. brand-new migration
 *     that hasn't been regenerated). Args become `Record<string, unknown>`.
 */
// Overload 1 — typed by name
export async function callFn<F extends RpcName>(
  fn: F,
  args?: RpcArgs<F> | null,
  opts?: CallOptions,
): Promise<RpcReturns<F> extends unknown[] ? RpcReturns<F> : RpcReturns<F>[]>;
// Overload 2 — escape hatch
export async function callFn<T = unknown>(
  fn: string,
  args?: Record<string, unknown> | null,
  opts?: CallOptions,
): Promise<T extends unknown[] ? T : T[]>;
// Implementation
export async function callFn(
  fn: string,
  args: Record<string, unknown> | null = null,
  opts: CallOptions = {},
): Promise<unknown> {
  const started = process.hrtime.bigint();
  if (opts.breadcrumb !== false) sentryBreadcrumb(fn, args);

  try {
    const { data, error } = await supabase.rpc(fn, args ?? undefined);

    const elapsedSec = Number(process.hrtime.bigint() - started) / 1e9;
    rpcCallDurationSeconds.observe({ fn }, elapsedSec);

    if (error) {
      rpcCallsTotal.inc({ fn, status: 'error' });
      logger.error({ fn, err: error, durationMs: Math.round(elapsedSec * 1000) }, '[db.callFn] RPC failed');
      if (opts.silent) return null as never;
      throw new DbError(fn, error);
    }

    rpcCallsTotal.inc({ fn, status: 'ok' });
    logger.debug({ fn, durationMs: Math.round(elapsedSec * 1000) }, '[db.callFn] ok');

    // Supabase returns `null` for void-returning functions; normalise to [].
    return (data ?? []) as never;
  } catch (e) {
    const elapsedSec = Number(process.hrtime.bigint() - started) / 1e9;
    rpcCallDurationSeconds.observe({ fn }, elapsedSec);
    rpcCallsTotal.inc({ fn, status: 'error' });

    if (e instanceof DbError) throw e;
    logger.error({ fn, err: e }, '[db.callFn] threw');
    if (opts.silent) return null as never;
    throw new DbError(fn, { message: (e as Error)?.message ?? String(e) });
  }
}

/**
 * Convenience: most functions return a single row (or a void). This unwraps
 * `[row]` → `row` and returns `null` for empty results.
 */
// Overload 1 — typed by name
export async function callFnRow<F extends RpcName>(
  fn: F,
  args?: RpcArgs<F> | null,
  opts?: CallOptions,
): Promise<(RpcReturns<F> extends Array<infer U> ? U : RpcReturns<F>) | null>;
// Overload 2 — escape hatch
export async function callFnRow<T = Record<string, unknown>>(
  fn: string,
  args?: Record<string, unknown> | null,
  opts?: CallOptions,
): Promise<T | null>;
// Implementation
export async function callFnRow(
  fn: string,
  args: Record<string, unknown> | null = null,
  opts: CallOptions = {},
): Promise<unknown> {
  const rows = (await callFn<unknown[]>(fn, args, opts)) as unknown[];
  return rows && rows.length > 0 ? rows[0] : null;
}

export const db = { callFn, callFnRow, DbError };
