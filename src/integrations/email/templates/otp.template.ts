import { baseLayout, otpBlock, infoBox, warningBox, paragraph } from './base-layout.template';

// ─── OTP flow union ────────────────────────────────────────
//
// Declared locally so this template file is self-contained
// (no cross-module import dependency). Each value here MUST
// have a matching entry in `flowConfigs` below.
//
// Mirrors the *_initiate flows in auth-flows.service.ts plus
// the `register` flow in auth.service.ts.

export type OtpFlow =
  | 'register'
  | 'forgot_password'
  | 'reset_password'
  | 'change_password'
  | 'verify_email'
  | 'verify_mobile'
  | 'change_email'
  | 'change_mobile';

// ─── Flow-specific config ──────────────────────────────────

interface OtpFlowConfig {
  title: string;
  preheader: string;
  subject: string;
  intro: string;
  purpose: string;
  footerNote: string;
}

const flowConfigs: Record<OtpFlow, OtpFlowConfig> = {
  register: {
    title: 'Verify Your Account',
    preheader: 'Your registration OTP code is inside',
    subject: 'Verify Your Account - Grow Up More',
    intro: 'Thank you for registering with Grow Up More! To complete your account setup, please use the verification code below.',
    purpose: 'This code is required to verify your email address and activate your account.',
    footerNote: 'You received this email because someone registered with this email address on Grow Up More.'
  },
  forgot_password: {
    title: 'Reset Your Password',
    preheader: 'Your password reset OTP code is inside',
    subject: 'Password Reset OTP - Grow Up More',
    intro: 'We received a request to reset the password for your account. Use the verification code below to proceed.',
    purpose: 'This code is required to verify your identity before setting a new password.',
    footerNote: 'If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.'
  },
  reset_password: {
    title: 'Confirm Password Reset',
    preheader: 'Confirm your password reset with this OTP',
    subject: 'Confirm Password Reset - Grow Up More',
    intro: 'You have requested to reset your account password from inside your account. Use the verification code below to confirm.',
    purpose: 'This code confirms that you authorized this password reset.',
    footerNote: 'If you did not request this reset, please secure your account immediately by logging in and changing your password.'
  },
  change_password: {
    title: 'Confirm Password Change',
    preheader: 'Confirm your password change with this OTP',
    subject: 'Confirm Password Change - Grow Up More',
    intro: 'You have requested to change your account password. To confirm this action, please use the verification code below.',
    purpose: 'This code is required to verify that you authorized this password change.',
    footerNote: 'If you did not request this change, please secure your account immediately by logging in and changing your password.'
  },
  verify_email: {
    title: 'Verify Your Email Address',
    preheader: 'Confirm your email address with this OTP',
    subject: 'Verify Your Email - Grow Up More',
    intro: 'Please use the verification code below to confirm that this email address belongs to you.',
    purpose: 'This code is required to verify your email address on your Grow Up More account.',
    footerNote: 'If you did not request email verification, you can safely ignore this email.'
  },
  verify_mobile: {
    title: 'Verify Your Mobile Number',
    preheader: 'Confirm your mobile number with this OTP',
    subject: 'Verify Your Mobile - Grow Up More',
    intro: 'A verification code has also been sent to your mobile via SMS. You can use either code below to confirm your mobile number.',
    purpose: 'This code is required to verify the mobile number on your Grow Up More account.',
    footerNote: 'If you did not request mobile verification, you can safely ignore this email.'
  },
  change_email: {
    title: 'Verify New Email Address',
    preheader: 'Verify your new email address with this OTP',
    subject: 'Verify New Email - Grow Up More',
    intro: 'You have requested to change your account email to this address. To confirm, please use the verification code below.',
    purpose: 'This code is required to verify that you own this email address.',
    footerNote: 'If you did not request an email change, you can safely ignore this email.'
  },
  change_mobile: {
    title: 'Verify Mobile Change',
    preheader: 'Confirm your mobile number change',
    subject: 'Confirm Mobile Change - Grow Up More',
    intro: 'You have requested to change the mobile number linked to your account. A verification code has also been sent to your new mobile via SMS.',
    purpose: 'This code confirms the mobile number change on your account.',
    footerNote: 'If you did not initiate this change, please secure your account immediately.'
  }
};

// ─── Template Generator ────────────────────────────────────

export const otpTemplate = (otp: string, flow: OtpFlow = 'register', userName?: string): string => {
  const config = flowConfigs[flow];
  const greeting = userName ? `Hi ${userName},` : 'Hi there,';

  const body = `
    ${paragraph(config.intro)}
    ${otpBlock(otp)}
    ${infoBox(config.purpose)}
    ${warningBox('This code will expire in a few minutes. Do not share this code with anyone — our team will never ask for it.')}
  `;

  return baseLayout({
    preheader: config.preheader,
    title: config.title,
    greeting,
    body,
    footerNote: config.footerNote
  });
};

/** Get the email subject line for a given flow */
export const otpSubject = (flow: OtpFlow): string => flowConfigs[flow].subject;
