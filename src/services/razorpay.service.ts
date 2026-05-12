import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config';

// ── Singleton Razorpay instance ──
const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

// ── Types ──
export interface CreateRazorpayOrderParams {
  amount: number;          // in INR (rupees) — will be converted to paise
  currency?: string;
  receipt: string;         // our order_number (GUM-YYYY-NNNNNN)
  notes?: Record<string, string>;
}

export interface VerifyPaymentParams {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface InitiateRefundParams {
  paymentId: string;       // razorpay_payment_id
  amount?: number;         // partial refund amount in paise; omit for full refund
  notes?: Record<string, string>;
  receipt?: string;
}

// ── Service functions ──

/**
 * Create a Razorpay order.
 * Amount is passed in **rupees** and auto-converted to paise.
 */
export async function createRazorpayOrder(params: CreateRazorpayOrderParams) {
  const { amount, currency = config.razorpay.currency, receipt, notes = {} } = params;
  const amountInPaise = Math.round(amount * 100);

  const order = await razorpay.orders.create({
    amount: amountInPaise,
    currency,
    receipt,
    notes,
  });
  return order;
}

/**
 * Verify the payment signature returned by Razorpay checkout.
 * Returns `true` if valid, `false` otherwise.
 */
export function verifyPaymentSignature(params: VerifyPaymentParams): boolean {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params;
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(body)
    .digest('hex');
  return expected === razorpay_signature;
}

/**
 * Verify a Razorpay webhook signature.
 */
export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return expected === signature;
}

/**
 * Fetch a Razorpay payment by its ID.
 */
export async function fetchPayment(paymentId: string) {
  return razorpay.payments.fetch(paymentId);
}

/**
 * Capture an authorized payment.
 * Amount in paise.
 */
export async function capturePayment(paymentId: string, amountInPaise: number, currency = config.razorpay.currency) {
  return razorpay.payments.capture(paymentId, amountInPaise, currency);
}

/**
 * Initiate a refund on a captured payment.
 */
export async function initiateRefund(params: InitiateRefundParams) {
  const { paymentId, amount, notes, receipt } = params;
  return razorpay.payments.refund(paymentId, {
    amount,
    notes,
    receipt: receipt || undefined,
    speed: 'normal',
  });
}

/**
 * Fetch a Razorpay order by its ID.
 */
export async function fetchRazorpayOrder(orderId: string) {
  return razorpay.orders.fetch(orderId);
}

export { razorpay };
