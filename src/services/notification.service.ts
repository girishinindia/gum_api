/**
 * Notification Service
 * ────────────────────
 * Sends in-app, email, and SMS notifications.
 * Uses the email_templates table for dynamic template content
 * and falls back to sensible defaults.
 */

import { supabase } from '../config/supabase';
import { redis } from '../config/redis';
import { config } from '../config';
import { enqueuePush } from './push.service';

// ── Types ──
export interface SendNotificationParams {
  userId: number;
  notificationType: string;
  title: string;
  message: string;
  channels?: ('in_app' | 'email' | 'sms' | 'push')[];
  referenceType?: string;
  referenceId?: number;
  metadata?: Record<string, any>;
  createdBy?: number;
  /** Phase 11.2 — optional click-target for the push notification card. */
  pushUrl?: string;
}

export interface BulkNotificationParams {
  userIds: number[];
  notificationType: string;
  title: string;
  message: string;
  channels?: ('in_app' | 'email' | 'sms' | 'push')[];
  referenceType?: string;
  referenceId?: number;
  metadata?: Record<string, any>;
  createdBy?: number;
  pushUrl?: string;
}

// ── Cache helpers ──
async function clearNotificationCaches() {
  await redis.del('notifications:all');
}

// ── Preference check ──
async function getUserPreference(
  userId: number,
  notificationType: string,
  channel: 'email' | 'sms' | 'in_app' | 'push',
): Promise<boolean> {
  // BUG-60/BUG-62: notification_preferences has no deleted_at column; the
  // phantom-column filter errored the query → data came back null → every
  // channel silently defaulted to "enabled". Drop the filter.
  const { data } = await supabase
    .from('notification_preferences')
    .select('email_enabled, sms_enabled, in_app_enabled, push_enabled')
    .eq('user_id', userId)
    .eq('notification_type', notificationType)
    .single();

  if (!data) return true; // Default: all enabled

  if (channel === 'email')  return data.email_enabled  !== false;
  if (channel === 'sms')    return data.sms_enabled    !== false;
  if (channel === 'in_app') return data.in_app_enabled !== false;
  if (channel === 'push')   return data.push_enabled   !== false;
  return true;
}

// ── Get user info for email/sms ──
async function getUserInfo(userId: number): Promise<{ name: string; email: string; mobile: string } | null> {
  const { data } = await supabase
    .from('users')
    .select('first_name, last_name, email, mobile')
    .eq('id', userId)
    .single();

  if (!data) return null;
  return {
    name: [data.first_name, data.last_name].filter(Boolean).join(' ') || 'User',
    email: data.email || '',
    mobile: data.mobile || '',
  };
}

// ── Email template from DB ──
async function getEmailTemplate(notificationType: string): Promise<{ subject: string; body_html: string } | null> {
  // The table keys templates by `notification_type` and stores the body in
  // `html_body` (not `body_html`). Match those column names exactly, else the
  // lookup silently fails and every email falls back to the generic wrapper.
  const { data } = await supabase
    .from('email_templates')
    .select('subject, html_body')
    .eq('notification_type', notificationType)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { subject: data.subject || '', body_html: data.html_body || '' };
}

// ── Send email via Brevo ──
async function sendEmailViaBrevo(email: string, name: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': config.email.brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: config.email.fromName, email: config.email.from },
        to: [{ email, name }],
        subject,
        htmlContent: html,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[NOTIFICATION] Email send failed:', err);
    return false;
  }
}

// ── Simple HTML email wrapper ──
function wrapInEmailTemplate(title: string, message: string, name: string): string {
  const year = new Date().getFullYear();
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="height:4px;background:linear-gradient(90deg,#0284c7,#0ea5e9,#38bdf8);border-radius:4px 4px 0 0;"></div>
    <div style="background:#ffffff;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0284c7 0%,#0ea5e9 50%,#38bdf8 100%);padding:32px 40px;text-align:center;">
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:-0.5px;">🔔 ${title}</h1>
      </div>
      <div style="padding:36px 40px;">
        <p style="color:#334155;font-size:15px;line-height:1.7;margin:0;">
          Hi <strong>${name}</strong>,
        </p>
        <p style="color:#334155;font-size:15px;line-height:1.7;margin:16px 0 0;">
          ${message}
        </p>
      </div>
      <div style="height:1px;background:linear-gradient(90deg,transparent,#e2e8f0,transparent);margin:0 40px;"></div>
      <div style="padding:24px 40px 32px;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border-radius:24px;">
          <span style="font-size:16px;">🎓</span>
          <span style="font-size:13px;font-weight:700;color:#0284c7;">Grow Up More</span>
        </div>
        <p style="color:#cbd5e1;font-size:11px;margin:12px 0 0;">&copy; ${year} Genius ITens. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
}

// ── Replace template variables ──
function replaceVariables(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}


// ══════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════

/**
 * Send a notification to a single user across requested channels.
 * Respects user preferences.
 */
export async function sendNotification(params: SendNotificationParams): Promise<number[]> {
  const {
    userId,
    notificationType,
    title,
    message,
    channels = ['in_app'],
    referenceType,
    referenceId,
    metadata,
    createdBy,
  } = params;

  const notificationIds: number[] = [];

  for (const channel of channels) {
    // Check user preference
    const allowed = await getUserPreference(userId, notificationType, channel);
    if (!allowed) continue;

    // Insert notification record
    const { data: notification } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        notification_type: notificationType,
        title,
        message,
        channel,
        delivery_status: channel === 'in_app' ? 'delivered' : 'pending',
        reference_type: referenceType || null,
        reference_id: referenceId || null,
        metadata: metadata || {},
        created_by: createdBy || null,
      })
      .select('id')
      .single();

    if (notification) notificationIds.push(notification.id);

    // Deliver via external channel
    if (channel === 'email') {
      const user = await getUserInfo(userId);
      if (user?.email) {
        // Try DB template first
        const tpl = await getEmailTemplate(notificationType);
        let subject = title;
        let html: string;

        if (tpl) {
          subject = replaceVariables(tpl.subject, { name: user.name, title });
          html = replaceVariables(tpl.body_html, { name: user.name, title, message });
        } else {
          html = wrapInEmailTemplate(title, message, user.name);
        }

        const sent = await sendEmailViaBrevo(user.email, user.name, subject, html);
        if (notification) {
          await supabase.from('notifications').update({
            delivery_status: sent ? 'delivered' : 'failed',
          }).eq('id', notification.id);
        }
      }
    }

    // SMS delivery (only if template exists — DLT registered)
    if (channel === 'sms') {
      // For now, SMS is OTP-only via DLT templates. Mark as delivered for tracking.
      if (notification) {
        await supabase.from('notifications').update({
          delivery_status: 'delivered',
        }).eq('id', notification.id);
      }
    }

    // Push delivery (Phase 11.2)
    if (channel === 'push') {
      try {
        const { enqueued } = await enqueuePush(userId, {
          title,
          body: message,
          url:  params.pushUrl ?? '/',
          tag:  notificationType,
          data: {
            notification_id: notification?.id ?? null,
            reference_type:  referenceType ?? null,
            reference_id:    referenceId   ?? null,
          },
        });
        if (notification) {
          await supabase.from('notifications').update({
            delivery_status: enqueued > 0 ? 'delivered' : 'failed',
            metadata: { ...(metadata ?? {}), push_devices_targeted: enqueued },
          }).eq('id', notification.id);
        }
      } catch (e) {
        if (notification) {
          await supabase.from('notifications').update({
            delivery_status: 'failed',
          }).eq('id', notification.id);
        }
        console.error('[NOTIFICATION] push delivery failed:', e);
      }
    }
  }

  await clearNotificationCaches();
  return notificationIds;
}

/**
 * Send the same notification to multiple users.
 */
export async function sendBulkNotification(params: BulkNotificationParams): Promise<number> {
  let totalSent = 0;
  for (const userId of params.userIds) {
    const ids = await sendNotification({
      userId,
      notificationType: params.notificationType,
      title: params.title,
      message: params.message,
      channels: params.channels,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      metadata: params.metadata,
      createdBy: params.createdBy,
      pushUrl:   params.pushUrl,
    });
    totalSent += ids.length;
  }
  return totalSent;
}

/**
 * Mark a notification as read.
 */
export async function markAsRead(notificationId: number): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId);
  await clearNotificationCaches();
}

/**
 * Mark all notifications for a user as read.
 */
export async function markAllAsRead(userId: number): Promise<number> {
  const { data } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('deleted_at', null)
    .select('id');

  await clearNotificationCaches();
  return data?.length || 0;
}

/**
 * Get unread count for a user.
 */
export async function getUnreadCount(userId: number): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('deleted_at', null);

  return count || 0;
}


// ══════════════════════════════════════════════════
// NOTIFICATION SHORTCUTS (used by other services)
// ══════════════════════════════════════════════════

export async function notifyEnrollmentConfirmed(
  userId: number,
  courseName: string,
  orderId: number,
  createdBy?: number,
) {
  return sendNotification({
    userId,
    notificationType: 'enrollment_confirmed',
    title: 'Enrollment Confirmed',
    message: `You have been successfully enrolled in "${courseName}". Happy learning!`,
    channels: ['in_app', 'email', 'push'],
    referenceType: 'order',
    referenceId: orderId,
    createdBy,
  });
}

export async function notifyPaymentReceived(
  userId: number,
  amount: number,
  orderId: number,
  createdBy?: number,
) {
  return sendNotification({
    userId,
    notificationType: 'payment_received',
    title: 'Payment Received',
    message: `Your payment of ₹${amount.toFixed(2)} has been received and your order #${orderId} is confirmed.`,
    channels: ['in_app', 'email', 'push'],
    referenceType: 'order',
    referenceId: orderId,
    createdBy,
  });
}

export async function notifyRefundProcessed(
  userId: number,
  amount: number,
  orderId: number,
  createdBy?: number,
) {
  return sendNotification({
    userId,
    notificationType: 'refund_processed',
    title: 'Refund Processed',
    message: `Your refund of ₹${amount.toFixed(2)} for order #${orderId} has been processed. It may take 5-7 business days to reflect.`,
    channels: ['in_app', 'email', 'push'],
    referenceType: 'order',
    referenceId: orderId,
    createdBy,
  });
}

export async function notifyInstructorEarning(
  instructorUserId: number,
  amount: number,
  courseName: string,
  orderId: number,
) {
  return sendNotification({
    userId: instructorUserId,
    notificationType: 'instructor_earning',
    title: 'New Earning',
    message: `You earned ₹${amount.toFixed(2)} from a sale of "${courseName}" (Order #${orderId}).`,
    channels: ['in_app', 'email', 'push'],
    referenceType: 'order',
    referenceId: orderId,
  });
}

export async function notifyPayoutApproved(
  instructorUserId: number,
  amount: number,
  payoutRequestId: number,
) {
  return sendNotification({
    userId: instructorUserId,
    notificationType: 'payout_approved',
    title: 'Payout Approved',
    message: `Your payout request of ₹${amount.toFixed(2)} has been approved and will be processed shortly.`,
    channels: ['in_app', 'email', 'push'],
    referenceType: 'payout_request',
    referenceId: payoutRequestId,
  });
}

export async function notifyPayoutCompleted(
  instructorUserId: number,
  amount: number,
  payoutRequestId: number,
) {
  return sendNotification({
    userId: instructorUserId,
    notificationType: 'payout_completed',
    title: 'Payout Completed',
    message: `Your payout of ₹${amount.toFixed(2)} has been settled. Please check your bank account.`,
    channels: ['in_app', 'email', 'push'],
    referenceType: 'payout_request',
    referenceId: payoutRequestId,
  });
}

export async function notifyPayoutRejected(
  instructorUserId: number,
  reason: string,
  payoutRequestId: number,
) {
  return sendNotification({
    userId: instructorUserId,
    notificationType: 'payout_rejected',
    title: 'Payout Request Rejected',
    message: `Your payout request was rejected. Reason: ${reason}. Please contact support for details.`,
    channels: ['in_app', 'email', 'push'],
    referenceType: 'payout_request',
    referenceId: payoutRequestId,
  });
}

// BUG-53: notify the wallet owner when an admin freezes their wallet, surfacing the reason.
export async function notifyWalletFrozen(
  userId: number,
  reason: string,
  walletId?: number,
) {
  return sendNotification({
    userId,
    notificationType: 'wallet_frozen',
    title: 'Wallet Frozen',
    message: reason
      ? `Your wallet has been frozen. Reason: ${reason}. Please contact support if you have any questions.`
      : 'Your wallet has been frozen. Please contact support if you have any questions.',
    channels: ['in_app', 'email'],
    referenceType: 'wallet',
    referenceId: walletId,
  });
}
