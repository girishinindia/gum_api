import { AppError } from '../../core/errors/app-error';
import { generateOtp } from '../../core/utils/otp';
import { redisOtp, redisPending } from '../../database/redis';
import { brevoService } from '../../integrations/email/brevo.service';
import { otpTemplate, otpSubject } from '../../integrations/email/templates/otp.template';
import { smsGatewayService } from '../../integrations/sms/sms-gateway.service';
import { logger } from '../../core/logger/logger';

// ─── Constants ──────────────────────────────────────────────

const MAX_RESEND_ATTEMPTS = 3;
const INDIA_COUNTRY_CODE = '91';

// ─── Types ──────────────────────────────────────────────────

export type OtpFlow = 'register' | 'forgot_password' | 'change_password' | 'change_email' | 'change_mobile';

interface SendOtpToEmailInput {
  flow: OtpFlow;
  sessionKey: string;
  email: string;
  userName?: string;
}

interface SendOtpToMobileInput {
  flow: OtpFlow;
  sessionKey: string;
  mobile: string;
  userName: string;
}

interface SendOtpToBothInput {
  flow: OtpFlow;
  sessionKey: string;
  email: string;
  mobile: string;
  userName: string;
}

// ─── Helper: Build OTP identifier ──────────────────────────

const otpKey = (flow: OtpFlow, sessionKey: string, channel: 'email' | 'mobile') =>
  `${flow}:${channel}:${sessionKey}`;

// ─── Helper: Format mobile for SMS gateway (add 91 prefix) ─

const formatMobileForSms = (mobile: string): string => {
  // Strip any existing prefix and add 91
  const cleaned = mobile.replace(/^\+?91/, '');
  return `${INDIA_COUNTRY_CODE}${cleaned}`;
};

// ─── OTP Service ────────────────────────────────────────────

class OtpService {

  // ─── Send OTP to email only ──────────────────────────────

  async sendToEmail(input: SendOtpToEmailInput): Promise<void> {
    const identifier = otpKey(input.flow, input.sessionKey, 'email');
    await this.checkResendEligibility(identifier);

    const otp = generateOtp();
    await redisOtp.store(identifier, otp);
    await redisOtp.setCooldown(identifier);
    await redisOtp.incrementResendCount(identifier);

    // Fire-and-forget email
    brevoService.sendToOne({
      to: input.email,
      toName: input.userName,
      subject: otpSubject(input.flow),
      html: otpTemplate(otp, input.flow, input.userName)
    }).catch((err) => {
      logger.error({ err, email: input.email }, 'Failed to send OTP email');
    });
  }

  // ─── Send OTP to mobile only ─────────────────────────────

  async sendToMobile(input: SendOtpToMobileInput): Promise<void> {
    const identifier = otpKey(input.flow, input.sessionKey, 'mobile');
    await this.checkResendEligibility(identifier);

    const otp = generateOtp();
    await redisOtp.store(identifier, otp);
    await redisOtp.setCooldown(identifier);
    await redisOtp.incrementResendCount(identifier);

    // Fire-and-forget SMS
    smsGatewayService.sendOtp({
      phone: formatMobileForSms(input.mobile),
      name: input.userName,
      otp
    }).catch((err) => {
      logger.error({ err, mobile: input.mobile }, 'Failed to send OTP SMS');
    });
  }

  // ─── Send OTP to both email and mobile ───────────────────

  async sendToBoth(input: SendOtpToBothInput): Promise<void> {
    const emailId = otpKey(input.flow, input.sessionKey, 'email');
    const mobileId = otpKey(input.flow, input.sessionKey, 'mobile');

    // Check cooldown on either channel (they share the same session)
    await this.checkResendEligibility(emailId);

    const emailOtp = generateOtp();
    const mobileOtp = generateOtp();

    // Store both OTPs
    await Promise.all([
      redisOtp.store(emailId, emailOtp),
      redisOtp.store(mobileId, mobileOtp)
    ]);

    // Set cooldown on both channels
    await Promise.all([
      redisOtp.setCooldown(emailId),
      redisOtp.setCooldown(mobileId)
    ]);

    // Increment resend count (track on email key — both share the same session)
    await redisOtp.incrementResendCount(emailId);

    // Fire-and-forget: send email + SMS in parallel
    brevoService.sendToOne({
      to: input.email,
      toName: input.userName,
      subject: otpSubject(input.flow),
      html: otpTemplate(emailOtp, input.flow, input.userName)
    }).catch((err) => {
      logger.error({ err, email: input.email }, 'Failed to send OTP email');
    });

    smsGatewayService.sendOtp({
      phone: formatMobileForSms(input.mobile),
      name: input.userName,
      otp: mobileOtp
    }).catch((err) => {
      logger.error({ err, mobile: input.mobile }, 'Failed to send OTP SMS');
    });
  }

  // ─── Verify email OTP only ───────────────────────────────

  async verifyEmail(flow: OtpFlow, sessionKey: string, otp: string): Promise<boolean> {
    const identifier = otpKey(flow, sessionKey, 'email');
    const result = await redisOtp.verify(identifier, otp);

    if (!result.valid && result.attemptsLeft <= 0) {
      throw new AppError('OTP expired or max attempts exceeded. Please request a new OTP.', 400, 'OTP_EXPIRED');
    }

    if (!result.valid) {
      throw new AppError(
        `Invalid OTP. ${result.attemptsLeft} attempt(s) remaining.`,
        400,
        'OTP_INVALID'
      );
    }

    return true;
  }

  // ─── Verify mobile OTP only ──────────────────────────────

  async verifyMobile(flow: OtpFlow, sessionKey: string, otp: string): Promise<boolean> {
    const identifier = otpKey(flow, sessionKey, 'mobile');
    const result = await redisOtp.verify(identifier, otp);

    if (!result.valid && result.attemptsLeft <= 0) {
      throw new AppError('OTP expired or max attempts exceeded. Please request a new OTP.', 400, 'OTP_EXPIRED');
    }

    if (!result.valid) {
      throw new AppError(
        `Invalid OTP. ${result.attemptsLeft} attempt(s) remaining.`,
        400,
        'OTP_INVALID'
      );
    }

    return true;
  }

  // ─── Verify both email and mobile OTPs ───────────────────

  async verifyBoth(flow: OtpFlow, sessionKey: string, emailOtp: string, mobileOtp: string): Promise<boolean> {
    // Verify email first
    await this.verifyEmail(flow, sessionKey, emailOtp);
    // Then verify mobile
    await this.verifyMobile(flow, sessionKey, mobileOtp);
    return true;
  }

  // ─── Clean up all OTP keys for a session ─────────────────

  async cleanup(flow: OtpFlow, sessionKey: string): Promise<void> {
    const emailId = otpKey(flow, sessionKey, 'email');
    const mobileId = otpKey(flow, sessionKey, 'mobile');

    await Promise.all([
      redisOtp.cleanup(emailId),
      redisOtp.cleanup(mobileId),
      redisPending.del(`${flow}:${sessionKey}`)
    ]);
  }

  // ─── Check resend eligibility (cooldown + max resends) ───

  private async checkResendEligibility(identifier: string): Promise<void> {
    // Check cooldown (3 minutes between resends)
    const onCooldown = await redisOtp.isOnCooldown(identifier);
    if (onCooldown) {
      throw new AppError(
        'Please wait before requesting a new OTP. Try again after 3 minutes.',
        429,
        'OTP_COOLDOWN_ACTIVE'
      );
    }

    // Check max resend count (max 3 sends total including initial)
    const resendCount = await redisOtp.getResendCount(identifier);
    if (resendCount >= MAX_RESEND_ATTEMPTS) {
      throw new AppError(
        'Maximum OTP resend limit reached (3 attempts). Please try again later.',
        429,
        'OTP_MAX_RESENDS_EXCEEDED'
      );
    }
  }
}

export const otpService = new OtpService();
