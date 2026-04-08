import { env } from '../../config/env';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/errors/app-error';

// ─── Types ───────────────────────────────────────────────────

interface SendSmsInput {
  phone: string;   // with country code, e.g. "919662278990"
  message: string; // must match DLT template exactly
}

interface SmsGatewayResponse {
  ErrorCode: string;
  ErrorMessage: string;
  JobId: string;
  MessageData: Array<{
    Number: string;
    MessageId: string;
  }>;
}

// ─── DLT Templates ──────────────────────────────────────────
// Must match registered DLT templates character-for-character

export const SMS_TEMPLATES = {
  /** DLT Template ID: from env SMS_DLT_TEMPLATE_ID */
  otp: (name: string, otp: string) =>
    `Dear ${name}, OTP is for new user registration is ${otp}. Thank You, Genius ITens (Grow Up More)`
};

// ─── Service ─────────────────────────────────────────────────

export class SmsGatewayService {
  private readonly baseUrl = 'https://www.smsgatewayhub.com/api/mt/SendSMS';

  /**
   * Send an SMS via SMSGatewayHub API.
   * Uses GET request with query parameters (as per their API spec).
   */
  async send(input: SendSmsInput): Promise<SmsGatewayResponse> {
    const params = new URLSearchParams({
      APIKey: env.SMS_API_KEY,
      senderid: env.SMS_SENDER_ID,
      channel: env.SMS_CHANNEL,
      DCS: env.SMS_DCS,
      flashsms: env.SMS_FLASH,
      number: input.phone,
      text: input.message,
      route: env.SMS_ROUTE,
      EntityId: env.SMS_ENTITY_ID,
      dlttemplateid: env.SMS_DLT_TEMPLATE_ID
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    logger.info({ phone: input.phone }, 'Sending SMS via SMSGatewayHub');

    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      logger.error({ status: response.status }, 'SMSGatewayHub HTTP error');
      throw new AppError('SMS delivery failed', 502, 'SMS_SEND_FAILED');
    }

    const data = (await response.json()) as SmsGatewayResponse;

    if (data.ErrorCode !== '000') {
      logger.error({ errorCode: data.ErrorCode, errorMessage: data.ErrorMessage }, 'SMSGatewayHub API error');
      throw new AppError('SMS delivery failed', 502, 'SMS_SEND_FAILED', {
        errorCode: data.ErrorCode,
        errorMessage: data.ErrorMessage
      });
    }

    logger.info({ jobId: data.JobId, phone: input.phone }, 'SMS sent successfully');
    return data;
  }

  /**
   * Send OTP SMS using the registered DLT template.
   */
  async sendOtp(input: { phone: string; name: string; otp: string }): Promise<SmsGatewayResponse> {
    const message = SMS_TEMPLATES.otp(input.name, input.otp);
    return this.send({ phone: input.phone, message });
  }
}

export const smsGatewayService = new SmsGatewayService();
