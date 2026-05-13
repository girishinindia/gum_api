import { config } from '../config';

// DLT Template Registry — each flow uses its own pre-approved template
export const SMS_TEMPLATES = {
  user_registration: {
    id: '1207176585698936577',
    message: (name: string, otp: string) =>
      `Dear ${name}, OTP is for new user registration is ${otp}. Thank You, Genius ITens (Grow Up More)`,
  },
  forgot_password: {
    id: '1207177626145751532',
    message: (name: string, otp: string) =>
      `Dear ${name}, OTP is for password recovery is ${otp}. Thank You, Genius ITens (Grow Up More)`,
  },
  reset_password: {
    id: '1207177626029356961',
    message: (name: string, otp: string) =>
      `Dear ${name}, OTP to reset password is ${otp}. Thank You, Genius ITens (Grow Up More)`,
  },
  update_email: {
    id: '1207177626254116722',
    message: (name: string, otp: string) =>
      `Dear ${name}, OTP to update email is ${otp}. Thank You, Genius ITens (Grow Up More)`,
  },
  update_mobile: {
    id: '1207177626808992262',
    message: (name: string, otp: string) =>
      `Dear ${name}, OTP to update mobile number is ${otp}. Thank You, Genius ITens (Grow Up More)`,
  },
} as const;

export type SmsTemplateName = keyof typeof SMS_TEMPLATES;

/**
 * Direct DLT call — never call from a request handler. The queue worker
 * uses this; everyone else goes through {@link sendSms} / {@link sendOtpSms}
 * which honour Phase 7 queue routing.
 */
export async function sendSmsDirect(
  mobile: string,
  name: string,
  otp: string,
  templateName: SmsTemplateName = 'user_registration',
): Promise<void> {
  const tpl = SMS_TEMPLATES[templateName];
  const phone = mobile.replace('+', '');
  const message = tpl.message(name, otp);

  const params = new URLSearchParams({
    APIKey: config.sms.apiKey,
    senderid: config.sms.senderId,
    channel: config.sms.channel,
    DCS: config.sms.dcs,
    flashsms: config.sms.flash,
    number: phone,
    text: message,
    route: config.sms.route,
    EntityId: config.sms.entityId,
    dlttemplateid: tpl.id,
  });

  const res = await fetch(`https://www.smsgatewayhub.com/api/mt/SendSMS?${params}`);
  const data = (await res.json()) as { ErrorCode?: string; ErrorMessage?: string };
  if (data.ErrorCode && data.ErrorCode !== '000') {
    throw new Error('SMS failed: ' + (data.ErrorMessage || JSON.stringify(data)));
  }
}

// Generic sender — takes template name, builds message from registry.
// Routes through the SMS queue when QUEUE_ENABLED=true; otherwise calls
// sendSmsDirect synchronously (pre-Phase-7 behaviour).
export async function sendSms(
  mobile: string,
  name: string,
  otp: string,
  templateName: SmsTemplateName = 'user_registration',
): Promise<void> {
  const { enqueue } = await import('./queue.service');
  await enqueue(
    'sms',
    'send',
    { mobile, name, otp, templateName },
    {
      syncFallback: (d) =>
        sendSmsDirect(d.mobile, d.name, d.otp, d.templateName as SmsTemplateName),
    },
  );
}

// Backwards-compatible alias used by existing registration flow
export async function sendOtpSms(mobile: string, name: string, otp: string): Promise<void> {
  return sendSms(mobile, name, otp, 'user_registration');
}
