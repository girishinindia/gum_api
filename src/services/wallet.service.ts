/**
 * Wallet Service
 * ──────────────
 * Manages user wallet accounts: credit, debit, balance queries,
 * freeze/unfreeze, and auto-creation.
 *
 * All balance-changing operations are idempotent when a source_type+source_id
 * is provided (the DB has a unique partial index on wallet_transactions).
 *
 * Called by:
 *  - postPayment.service.ts  → credit (earning)
 *  - referralReward.controller.ts → credit (referral)
 *  - refund processing → credit (refund)
 *  - payout settlement → debit (payout)
 *  - admin manual operations → credit/debit (manual_credit/manual_debit)
 */

import { supabase } from '../config/supabase';
import { db } from './db';
import { redis } from '../config/redis';

// ── Types ──
export interface WalletCreditParams {
  userId: number;
  amount: number;
  sourceType: 'earning' | 'referral' | 'refund' | 'manual_credit' | 'adjustment';
  sourceId?: number;
  description: string;
  metadata?: Record<string, any>;
  createdBy?: number;
}

export interface WalletDebitParams {
  userId: number;
  amount: number;
  sourceType: 'purchase' | 'payout' | 'manual_debit' | 'adjustment';
  sourceId?: number;
  description: string;
  metadata?: Record<string, any>;
  createdBy?: number;
}

export interface WalletTransactionResult {
  success: boolean;
  walletId?: number;
  transactionId?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  error?: string;
}

// ── Cache ──
async function clearWalletCaches(userId?: number) {
  const keys = ['wallets:all', 'wallet_transactions:all'];
  if (userId) keys.push(`wallet:user:${userId}`);
  await Promise.all(keys.map(k => redis.del(k)));
}

// ── Get or Create wallet for a user ──
export async function getOrCreateWallet(userId: number): Promise<{ id: number; balance: number; is_frozen: boolean } | null> {
  // Try to find existing wallet
  const { data: existing } = await supabase
    .from('wallets')
    .select('id, balance, is_frozen')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (existing) return existing;

  // Create new wallet
  const { data: created, error } = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      balance: 0,
      total_credited: 0,
      total_debited: 0,
      total_withdrawn: 0,
      currency: 'INR',
      is_frozen: false,
      auto_payout_enabled: false,
      min_payout_amount: 500,
      is_active: true,
    })
    .select('id, balance, is_frozen')
    .single();

  if (error) {
    // Race condition: another process may have created it
    if (error.code === '23505') { // unique_violation
      const { data: retry } = await supabase
        .from('wallets')
        .select('id, balance, is_frozen')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .single();
      return retry;
    }
    console.error('[WalletService] Failed to create wallet:', error.message);
    return null;
  }

  await clearWalletCaches(userId);
  return created;
}

// ── Get wallet balance ──
export async function getWalletBalance(userId: number): Promise<number> {
  const wallet = await getOrCreateWallet(userId);
  return wallet?.balance ?? 0;
}

// ── Credit wallet ──
// Atomic: delegates the entire insert-txn + update-balance flow to fn_wallet_credit
// in Postgres. SELECT … FOR UPDATE holds the wallets row throughout, eliminating
// the prior 2-query race window where a crash between the insert and the update
// would leave balance drift. Idempotent via idx_wallet_txns_idempotent.
export async function creditWallet(params: WalletCreditParams): Promise<WalletTransactionResult> {
  const { userId, amount, sourceType, sourceId, description, metadata, createdBy } = params;

  if (amount <= 0) return { success: false, error: 'Amount must be positive' };

  let data: any;
  try {
    data = await db.callFn('fn_wallet_credit', {
      p_user_id: userId,
      p_amount: amount,
      p_source_type: sourceType,
      p_source_id: sourceId ?? null,
      p_description: description,
      p_metadata: metadata ?? null,
      p_created_by: createdBy ?? null,
    });
  } catch (e: any) {
    console.error('[WalletService] fn_wallet_credit failed:', e?.message);
    return { success: false, error: e?.message ?? 'fn_wallet_credit failed' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { success: false, error: 'No row returned from fn_wallet_credit' };

  await clearWalletCaches(userId);

  return {
    success: true,
    walletId: Number(row.wallet_id),
    transactionId: Number(row.transaction_id),
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    error: row.status === 'duplicate' ? 'Duplicate transaction — already credited' : undefined,
  };
}

// ── Debit wallet ──
// Atomic via fn_wallet_debit. Honours wallet freeze + insufficient-balance
// policy server-side (Postgres ERRCODEs P0001 / P0002).
export async function debitWallet(params: WalletDebitParams & { allowOverdraft?: boolean }): Promise<WalletTransactionResult> {
  const { userId, amount, sourceType, sourceId, description, metadata, createdBy, allowOverdraft } = params;

  if (amount <= 0) return { success: false, error: 'Amount must be positive' };

  let data: any;
  try {
    data = await db.callFn('fn_wallet_debit', {
      p_user_id: userId,
      p_amount: amount,
      p_source_type: sourceType,
      p_source_id: sourceId ?? null,
      p_description: description,
      p_metadata: metadata ?? null,
      p_created_by: createdBy ?? null,
      p_allow_overdraft: !!allowOverdraft,
    });
  } catch (error: any) {
    if (error.code === 'P0001') return { success: false, error: 'Wallet is frozen' };
    if (error.code === 'P0002') return { success: false, error: 'Insufficient balance' };
    console.error('[WalletService] fn_wallet_debit failed:', error.message);
    return { success: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { success: false, error: 'No row returned from fn_wallet_debit' };

  await clearWalletCaches(userId);

  return {
    success: true,
    walletId: Number(row.wallet_id),
    transactionId: Number(row.transaction_id),
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    error: row.status === 'duplicate' ? 'Duplicate transaction — already debited' : undefined,
  };
}

// ── Freeze wallet ──
export async function freezeWallet(walletId: number, updatedBy?: number): Promise<boolean> {
  const { error } = await supabase
    .from('wallets')
    .update({ is_frozen: true, updated_by: updatedBy || null })
    .eq('id', walletId);

  if (error) {
    console.error('[WalletService] Freeze failed:', error.message);
    return false;
  }
  await clearWalletCaches();
  return true;
}

// ── Unfreeze wallet ──
export async function unfreezeWallet(walletId: number, updatedBy?: number): Promise<boolean> {
  const { error } = await supabase
    .from('wallets')
    .update({ is_frozen: false, updated_by: updatedBy || null })
    .eq('id', walletId);

  if (error) {
    console.error('[WalletService] Unfreeze failed:', error.message);
    return false;
  }
  await clearWalletCaches();
  return true;
}

// ── Reverse a transaction ──
export async function reverseTransaction(transactionId: number, reason: string, updatedBy?: number): Promise<WalletTransactionResult> {
  // Get original transaction
  const { data: txn } = await supabase
    .from('wallet_transactions')
    .select('*, wallets!inner(user_id)')
    .eq('id', transactionId)
    .single();

  if (!txn) return { success: false, error: 'Transaction not found' };
  if (txn.status === 'reversed') return { success: false, error: 'Transaction already reversed' };

  // Mark original as reversed
  await supabase
    .from('wallet_transactions')
    .update({ status: 'reversed' })
    .eq('id', transactionId);

  // Create counter-transaction
  const isCredit = txn.transaction_type === 'credit';
  const params = isCredit
    ? { userId: txn.wallets.user_id, amount: Number(txn.amount), sourceType: 'adjustment' as const, description: `Reversal: ${reason}`, metadata: { reversed_transaction_id: transactionId }, createdBy: updatedBy }
    : { userId: txn.wallets.user_id, amount: Number(txn.amount), sourceType: 'adjustment' as const, description: `Reversal: ${reason}`, metadata: { reversed_transaction_id: transactionId }, createdBy: updatedBy };

  return isCredit ? debitWallet(params) : creditWallet(params);
}

// ── Get transaction history for a wallet ──
export async function getTransactionHistory(walletId: number, page = 1, limit = 20) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from('wallet_transactions')
    .select('*', { count: 'exact' })
    .eq('wallet_id', walletId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  return { data: data || [], total: count || 0, error: error?.message };
}
