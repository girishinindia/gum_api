/**
 * TDS Service (Phase 9.4)
 * ───────────────────────
 * Section 194-O — TDS by an e-commerce operator on payments to e-commerce
 * participants (instructors). Default rate 1% on gross.
 *
 * Edge cases handled:
 *   • Section 206AA — if the instructor has no PAN on file (or it's
 *     unverified), TDS rate jumps to the higher rate (default 5%).
 *   • Annual exemption (Section 194-O proviso) — if total gross paid to
 *     the instructor across the FY is below ₹5,000 (configurable), no
 *     TDS deduction is required. This must be checked per payout against
 *     YTD aggregate.
 *   • Rupee rounding — TDS rounds DOWN to the nearest paisa (we use 2
 *     decimal places for storage). The Income Tax Act prescribes rounding
 *     to the nearest rupee for actual deposit, but settlement records keep
 *     paisa precision and the rounding is applied at challan time.
 */

import { supabase } from '../config/supabase';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface TdsComputeInput {
  /** instructor's user id (== payout_requests.instructor_id) */
  instructorId: number;
  /** Approved gross payout in INR rupees (NOT paise). */
  grossAmount: number;
  /** Optional override of FY label like '2526'. Computed from NOW() if omitted. */
  fyLabel?: string;
}

export interface TdsComputeResult {
  grossAmount: number;
  tdsRate: number;            // 1.0 / 5.0 / 0
  tdsAmount: number;          // 2-decimal precision
  netAmount: number;
  fyLabel: string;
  appliedSection: '194-O' | '206AA' | 'exempt-below-threshold';
  panOnFile: boolean;
  panVerified: boolean;
  ytdGrossBefore: number;     // YTD payouts to this instructor BEFORE this one
  ytdGrossAfter: number;
}

// ── Helpers ──────────────────────────────────────────────────────

export function currentFyLabel(date = new Date()): string {
  const m = date.getUTCMonth() + 1; // 1-12
  const y = date.getUTCFullYear();
  const fyStart = m >= 4 ? y : y - 1;
  return String(fyStart).slice(2) + String(fyStart + 1).slice(2);
}

/** Parse 'YYYY-MM-DD' for an FY label like '2526' — returns Apr 1 of that FY. */
export function fyStartDate(fyLabel: string): Date {
  // '2526' → 2025-04-01; '2627' → 2026-04-01
  const yy = parseInt(fyLabel.slice(0, 2), 10);
  // We map yy=24→2024, 25→2025, etc. (anchored 2000-2099)
  const fullYear = 2000 + yy;
  return new Date(Date.UTC(fullYear, 3, 1, 0, 0, 0)); // April = month 3 (0-indexed)
}

export function fyEndDate(fyLabel: string): Date {
  const start = fyStartDate(fyLabel);
  return new Date(Date.UTC(start.getUTCFullYear() + 1, 2, 31, 23, 59, 59));
}

// ── Compute TDS for a proposed payout ────────────────────────────

/**
 * Decide the TDS amount + rate to apply. Does NOT write anything.
 * The caller (refactored payout-request approve flow) persists the result.
 */
export async function computeTdsForPayout(input: TdsComputeInput): Promise<TdsComputeResult> {
  if (input.grossAmount <= 0) {
    throw new Error(`computeTdsForPayout: grossAmount must be > 0 (got ${input.grossAmount})`);
  }
  const fyLabel = input.fyLabel ?? currentFyLabel();
  const fyStart = fyStartDate(fyLabel);
  const fyEnd = fyEndDate(fyLabel);

  // 1. PAN status
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('pan_number, pan_verified')
    .eq('user_id', input.instructorId)
    .maybeSingle();
  const panOnFile = !!(profile?.pan_number && String(profile.pan_number).trim().length > 0);
  const panVerified = !!profile?.pan_verified;

  // 2. YTD gross paid to this instructor (excluding any failed/reversed settlements)
  const { data: ytd } = await supabase
    .from('payout_settlements')
    .select('gross_amount')
    .eq('instructor_id', input.instructorId)
    .eq('fy_label', fyLabel)
    .in('settlement_status', ['queued', 'processing', 'completed', 'processed'])
    .is('deleted_at', null);
  const ytdGrossBefore = (ytd || []).reduce((sum, r: any) => sum + Number(r.gross_amount || 0), 0);
  const ytdGrossAfter = ytdGrossBefore + input.grossAmount;

  // 3. Exemption check — under the annual threshold (Section 194-O proviso)
  const threshold = config.payouts.tds.annualExemptionThreshold;
  if (ytdGrossAfter <= threshold) {
    return {
      grossAmount: round2(input.grossAmount),
      tdsRate: 0,
      tdsAmount: 0,
      netAmount: round2(input.grossAmount),
      fyLabel,
      appliedSection: 'exempt-below-threshold',
      panOnFile,
      panVerified,
      ytdGrossBefore: round2(ytdGrossBefore),
      ytdGrossAfter: round2(ytdGrossAfter),
    };
  }

  // 4. Determine rate
  const rate = panOnFile && panVerified
    ? config.payouts.tds.rate         // 1.0
    : config.payouts.tds.noPanRate;   // 5.0

  const tds = round2(input.grossAmount * rate / 100);
  const net = round2(input.grossAmount - tds);

  return {
    grossAmount: round2(input.grossAmount),
    tdsRate: rate,
    tdsAmount: tds,
    netAmount: net,
    fyLabel,
    appliedSection: panOnFile && panVerified ? '194-O' : '206AA',
    panOnFile,
    panVerified,
    ytdGrossBefore: round2(ytdGrossBefore),
    ytdGrossAfter: round2(ytdGrossAfter),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── FY statement aggregator (used by /tds-statement endpoint) ────

export interface TdsStatementRow {
  fyLabel: string;
  month: string;           // 'YYYY-MM'
  payouts: number;
  grossTotal: number;
  tdsTotal: number;
  netTotal: number;
}

export async function getTdsStatement(
  instructorId: number,
  fyLabel: string,
): Promise<{ rows: TdsStatementRow[]; totals: { gross: number; tds: number; net: number; payouts: number } }> {
  const start = fyStartDate(fyLabel).toISOString();
  const end   = fyEndDate(fyLabel).toISOString();

  const { data, error } = await supabase
    .from('payout_settlements')
    .select('gross_amount, tds_amount, net_amount, settlement_status, settled_at, gateway_processed_at, created_at')
    .eq('instructor_id', instructorId)
    .eq('fy_label', fyLabel)
    .is('deleted_at', null)
    .gte('created_at', start)
    .lte('created_at', end);

  if (error) {
    logger.error({ err: error.message }, '[TDS] statement query failed');
    return { rows: [], totals: { gross: 0, tds: 0, net: 0, payouts: 0 } };
  }

  const byMonth = new Map<string, TdsStatementRow>();
  for (const r of (data || [])) {
    const eventDate = r.settled_at || r.gateway_processed_at || r.created_at;
    const month = String(eventDate).slice(0, 7);   // YYYY-MM
    let row = byMonth.get(month);
    if (!row) {
      row = { fyLabel, month, payouts: 0, grossTotal: 0, tdsTotal: 0, netTotal: 0 };
      byMonth.set(month, row);
    }
    row.payouts += 1;
    row.grossTotal += Number(r.gross_amount || 0);
    row.tdsTotal   += Number(r.tds_amount   || 0);
    row.netTotal   += Number(r.net_amount   || 0);
  }

  const rows = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  for (const r of rows) {
    r.grossTotal = round2(r.grossTotal);
    r.tdsTotal   = round2(r.tdsTotal);
    r.netTotal   = round2(r.netTotal);
  }

  const totals = rows.reduce((acc, r) => ({
    gross:    round2(acc.gross    + r.grossTotal),
    tds:      round2(acc.tds      + r.tdsTotal),
    net:      round2(acc.net      + r.netTotal),
    payouts:  acc.payouts  + r.payouts,
  }), { gross: 0, tds: 0, net: 0, payouts: 0 });

  return { rows, totals };
}
