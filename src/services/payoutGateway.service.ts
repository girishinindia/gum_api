/**
 * Payout Gateway Service (Phase 9.3)
 * ──────────────────────────────────
 * Abstracts the bank-payout provider (today: RazorpayX) so swapping to
 * Cashfree Payouts later is a one-file change.
 *
 * Mode is controlled by PAYOUT_GATEWAY env var:
 *   'disabled' (default) → no API calls, returns a synthetic gateway id;
 *                          settlement is marked gateway='dev-stub'. Lets the
 *                          whole approve→worker→webhook flow be exercised in
 *                          dev without real money or RazorpayX account.
 *   'razorpayx'          → real RazorpayX calls; requires KEY_ID + KEY_SECRET
 *                          + ACCOUNT_NUMBER (the platform's bank account
 *                          number registered with RazorpayX).
 *
 * RazorpayX API surface used:
 *   POST /v1/contacts                                (create instructor as a contact)
 *   POST /v1/fund_accounts                           (link bank → contact)
 *   POST /v1/payouts                                 (create the actual payout)
 *   GET  /v1/payouts/:id                             (status check)
 *
 * Docs: https://razorpay.com/docs/api/x/
 */

import { config } from '../config';
import { logger } from '../utils/logger';

const RAZORPAYX_BASE = 'https://api.razorpay.com/v1';

// ── Public types ─────────────────────────────────────────────────

export interface CreateContactParams {
  name: string;
  email?: string | null;
  contact?: string | null;     // mobile
  type?: 'employee' | 'vendor' | 'customer' | 'self';
  reference_id?: string;       // our internal instructor id
  notes?: Record<string, string>;
}

export interface CreateContactResult {
  id: string;
  status?: string;
}

export interface CreateFundAccountParams {
  contact_id: string;
  account_holder_name: string;
  account_number: string;
  ifsc: string;
}

export interface CreateFundAccountResult {
  id: string;
  status?: string;
}

export interface CreatePayoutParams {
  fund_account_id: string;
  amount: number;              // INR rupees — converted to paise here
  currency?: string;           // default INR
  mode?: 'IMPS' | 'NEFT' | 'RTGS' | 'UPI';
  purpose?: string;            // 'payout' | 'salary' | 'vendor bill' | etc.
  reference_id: string;        // OUR settlement_number (max 40 chars)
  narration?: string;
  notes?: Record<string, string>;
}

export interface CreatePayoutResult {
  id: string;
  status: string;              // 'queued' | 'pending' | 'processing' | 'processed' | 'cancelled' | 'rejected' | 'reversed' | 'failed'
  raw?: any;
}

// ── Auth header ──────────────────────────────────────────────────

function basicAuthHeader(): string {
  const k = config.payouts.razorpayx.keyId;
  const s = config.payouts.razorpayx.keySecret;
  const token = Buffer.from(`${k}:${s}`).toString('base64');
  return `Basic ${token}`;
}

async function rpxFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${RAZORPAYX_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`RazorpayX ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) as T : ({} as T);
}

// ── Public API ───────────────────────────────────────────────────

export function gatewayMode(): 'disabled' | 'razorpayx' {
  return config.payouts.mode;
}

export async function createContact(params: CreateContactParams): Promise<CreateContactResult> {
  if (config.payouts.mode === 'disabled') {
    const id = `dev_contact_${params.reference_id || Date.now()}`;
    logger.info({ params, syntheticId: id }, '[PayoutGateway:dev-stub] createContact');
    return { id, status: 'active' };
  }
  const body: any = {
    name: params.name,
    type: params.type ?? 'vendor',
  };
  if (params.email)        body.email = params.email;
  if (params.contact)      body.contact = params.contact;
  if (params.reference_id) body.reference_id = params.reference_id;
  if (params.notes)        body.notes = params.notes;

  const out = await rpxFetch<{ id: string; status?: string }>('/contacts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { id: out.id, status: out.status };
}

export async function createFundAccount(params: CreateFundAccountParams): Promise<CreateFundAccountResult> {
  if (config.payouts.mode === 'disabled') {
    const id = `dev_fund_${params.contact_id}`;
    logger.info({ params, syntheticId: id }, '[PayoutGateway:dev-stub] createFundAccount');
    return { id, status: 'active' };
  }

  const out = await rpxFetch<{ id: string; status?: string }>('/fund_accounts', {
    method: 'POST',
    body: JSON.stringify({
      contact_id: params.contact_id,
      account_type: 'bank_account',
      bank_account: {
        name: params.account_holder_name,
        account_number: params.account_number,
        ifsc: params.ifsc,
      },
    }),
  });
  return { id: out.id, status: out.status };
}

export async function createPayout(params: CreatePayoutParams): Promise<CreatePayoutResult> {
  if (config.payouts.mode === 'disabled') {
    const id = `dev_payout_${params.reference_id}`;
    logger.info({ params, syntheticId: id }, '[PayoutGateway:dev-stub] createPayout (no money moved)');
    return { id, status: 'processed', raw: { dev_stub: true } };
  }

  const acctNum = config.payouts.razorpayx.accountNumber;
  if (!acctNum) throw new Error('RAZORPAYX_ACCOUNT_NUMBER not configured');

  const out = await rpxFetch<any>('/payouts', {
    method: 'POST',
    headers: { 'X-Payout-Idempotency': params.reference_id },
    body: JSON.stringify({
      account_number: acctNum,
      fund_account_id: params.fund_account_id,
      amount: Math.round(params.amount * 100),             // INR → paise
      currency: params.currency ?? 'INR',
      mode: params.mode ?? config.payouts.razorpayx.mode,
      purpose: params.purpose ?? 'payout',
      queue_if_low_balance: true,
      reference_id: params.reference_id.slice(0, 40),
      narration: (params.narration ?? `GUM payout ${params.reference_id}`).slice(0, 30),
      notes: params.notes,
    }),
  });
  return { id: out.id, status: out.status, raw: out };
}

export async function fetchPayout(payoutId: string): Promise<CreatePayoutResult> {
  if (config.payouts.mode === 'disabled') {
    return { id: payoutId, status: 'processed', raw: { dev_stub: true } };
  }
  const out = await rpxFetch<any>(`/payouts/${encodeURIComponent(payoutId)}`);
  return { id: out.id, status: out.status, raw: out };
}
