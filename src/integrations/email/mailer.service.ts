// ═══════════════════════════════════════════════════════════════
// mailer.service — single entry point for all transactional email.
//
// Why this layer exists:
//   • Modules (auth, users, …) call high-level methods like
//     `mailer.sendOtp(...)` instead of touching brevoService or
//     templates directly. Keeps business code free of HTML.
//   • Every method is FIRE-AND-FORGET: any delivery failure is
//     logged but never re-thrown. The primary write path (user
//     create, password change, etc.) MUST complete even if Brevo
//     is down. Email is best-effort.
//   • Admin BCC notifications go through this same layer so the
//     env var (EMAIL_ADMIN_NOTIFY) is respected uniformly.
// ═══════════════════════════════════════════════════════════════

import { brevoService } from './brevo.service';
import { logger } from '../../core/logger/logger';
import { env } from '../../config/env';

import { otpTemplate, otpSubject, type OtpFlow } from './templates/otp.template';
import { welcomeTemplate, welcomeAdminCreatedTemplate } from './templates/welcome.template';
import { passwordChangedTemplate } from './templates/password-changed.template';
import { emailChangedNotifyTemplate, emailChangedWelcomeTemplate } from './templates/email-changed.template';
import { mobileChangedTemplate } from './templates/mobile-changed.template';
import { accountDeactivatedTemplate } from './templates/account-deactivated.template';
import { accountDeletedTemplate } from './templates/account-deleted.template';
import { accountRestoredTemplate } from './templates/account-restored.template';
import { roleChangedTemplate } from './templates/role-changed.template';

// ─── Internal: safe send wrapper ─────────────────────────────────
//
// Wraps each brevo call so any thrown error is caught, logged at
// `warn` (not `error` — email failures are not API errors), and
// the promise resolves to `undefined`. The caller can safely
// `void mailer.xxx(...)` without an unhandled-rejection risk.

const safeSend = async (
  label: string,
  to: string,
  send: () => Promise<unknown>
): Promise<void> => {
  try {
    await send();
    logger.debug({ label, to }, '[mailer] dispatched');
  } catch (err) {
    logger.warn(
      { err, label, to },
      '[mailer] delivery failed; primary operation already succeeded'
    );
  }
};

const adminBccEnabled = (): boolean =>
  Boolean(env.EMAIL_ADMIN_NOTIFY && env.EMAIL_ADMIN_NOTIFY.length > 0);

// ─── Service ─────────────────────────────────────────────────────

export const mailer = {
  // ── OTP ──────────────────────────────────────────────────
  /**
   * Send a one-time code email for any of the 8 OTP flows.
   * Used by both auth.service.register (initial flow) and
   * auth-flows.service for all secondary flows.
   */
  async sendOtp(input: {
    to: string;
    name?: string | null;
    otp: string;
    flow: OtpFlow;
  }): Promise<void> {
    return safeSend(`otp:${input.flow}`, input.to, () =>
      brevoService.sendToOne({
        to: input.to,
        toName: input.name ?? undefined,
        subject: otpSubject(input.flow),
        html: otpTemplate(input.otp, input.flow, input.name ?? undefined)
      })
    );
  },

  // ── Welcome (self-registration completed verification) ──
  async sendWelcome(input: { to: string; name: string }): Promise<void> {
    return safeSend('welcome', input.to, async () => {
      if (adminBccEnabled()) {
        return brevoService.sendWithAdminNotify({
          to: input.to,
          toName: input.name,
          subject: 'Welcome to Grow Up More',
          html: welcomeTemplate(input.name)
        });
      }
      return brevoService.sendToOne({
        to: input.to,
        toName: input.name,
        subject: 'Welcome to Grow Up More',
        html: welcomeTemplate(input.name)
      });
    });
  },

  // ── Welcome — admin-created user variant ────────────────
  async sendWelcomeAdminCreated(input: {
    to: string;
    name: string;
    loginUrl: string;
    setPasswordUrl: string;
    createdByName?: string | null;
  }): Promise<void> {
    return safeSend('welcome-admin-created', input.to, () =>
      brevoService.sendToOne({
        to: input.to,
        toName: input.name,
        subject: 'Your Grow Up More account is ready',
        html: welcomeAdminCreatedTemplate({
          name: input.name,
          email: input.to,
          loginUrl: input.loginUrl,
          setPasswordUrl: input.setPasswordUrl,
          createdByName: input.createdByName
        })
      })
    );
  },

  // ── Password changed (post-success notification) ────────
  async sendPasswordChanged(input: { to: string; name: string }): Promise<void> {
    return safeSend('password-changed', input.to, () =>
      brevoService.sendToOne({
        to: input.to,
        toName: input.name,
        subject: 'Your Grow Up More password was changed',
        html: passwordChangedTemplate(input.name)
      })
    );
  },

  // ── Email changed → notify the OLD address ──────────────
  async sendEmailChangedNotifyOld(input: {
    oldEmail: string;
    name: string;
    newEmail: string;
  }): Promise<void> {
    return safeSend('email-changed-notify-old', input.oldEmail, () =>
      brevoService.sendToOne({
        to: input.oldEmail,
        toName: input.name,
        subject: 'Your Grow Up More email address was changed',
        html: emailChangedNotifyTemplate(input.name, input.newEmail)
      })
    );
  },

  // ── Email changed → confirm to the NEW address ──────────
  async sendEmailChangedWelcomeNew(input: {
    newEmail: string;
    name: string;
  }): Promise<void> {
    return safeSend('email-changed-welcome-new', input.newEmail, () =>
      brevoService.sendToOne({
        to: input.newEmail,
        toName: input.name,
        subject: 'Your Grow Up More email is updated',
        html: emailChangedWelcomeTemplate(input.name)
      })
    );
  },

  // ── Mobile changed ──────────────────────────────────────
  async sendMobileChanged(input: {
    to: string;
    name: string;
    newMobile: string;
  }): Promise<void> {
    return safeSend('mobile-changed', input.to, () =>
      brevoService.sendToOne({
        to: input.to,
        toName: input.name,
        subject: 'Your Grow Up More mobile number was changed',
        html: mobileChangedTemplate(input.name, input.newMobile)
      })
    );
  },

  // ── Account lifecycle ───────────────────────────────────
  async sendAccountDeactivated(input: { to: string; name: string }): Promise<void> {
    return safeSend('account-deactivated', input.to, () =>
      brevoService.sendToOne({
        to: input.to,
        toName: input.name,
        subject: 'Your Grow Up More account has been deactivated',
        html: accountDeactivatedTemplate(input.name)
      })
    );
  },

  async sendAccountDeleted(input: { to: string; name: string }): Promise<void> {
    return safeSend('account-deleted', input.to, async () => {
      if (adminBccEnabled()) {
        return brevoService.sendWithAdminNotify({
          to: input.to,
          toName: input.name,
          subject: 'Your Grow Up More account has been deleted',
          html: accountDeletedTemplate(input.name)
        });
      }
      return brevoService.sendToOne({
        to: input.to,
        toName: input.name,
        subject: 'Your Grow Up More account has been deleted',
        html: accountDeletedTemplate(input.name)
      });
    });
  },

  async sendAccountRestored(input: { to: string; name: string }): Promise<void> {
    return safeSend('account-restored', input.to, () =>
      brevoService.sendToOne({
        to: input.to,
        toName: input.name,
        subject: 'Your Grow Up More account has been restored',
        html: accountRestoredTemplate(input.name)
      })
    );
  },

  // ── Role changed ────────────────────────────────────────
  async sendRoleChanged(input: {
    to: string;
    name: string;
    oldRoleName: string;
    newRoleName: string;
    changedByName?: string | null;
  }): Promise<void> {
    return safeSend('role-changed', input.to, () =>
      brevoService.sendToOne({
        to: input.to,
        toName: input.name,
        subject: `Your Grow Up More role is now ${input.newRoleName}`,
        html: roleChangedTemplate({
          name: input.name,
          oldRoleName: input.oldRoleName,
          newRoleName: input.newRoleName,
          changedByName: input.changedByName
        })
      })
    );
  }
};

export type Mailer = typeof mailer;
