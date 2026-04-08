import { env } from '../../config/env';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/errors/app-error';

// ─── Types ───────────────────────────────────────────────────

interface EmailRecipient {
  email: string;
  name?: string;
}

interface SendMailInput {
  to: EmailRecipient[];
  subject: string;
  html: string;
  bcc?: EmailRecipient[];
  replyTo?: EmailRecipient;
}

interface BrevoResponse {
  messageId?: string;
  code?: string;
  message?: string;
}

// ─── Service ─────────────────────────────────────────────────

export class BrevoService {
  private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email';

  /**
   * Send a transactional email via Brevo API.
   */
  async sendMail(input: SendMailInput): Promise<BrevoResponse> {
    const payload = {
      sender: {
        name: env.EMAIL_FROM_NAME,
        email: env.EMAIL_FROM
      },
      to: input.to,
      bcc: input.bcc,
      replyTo: input.replyTo ?? { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
      subject: input.subject,
      htmlContent: input.html
    };

    logger.info(
      { to: input.to.map((r) => r.email), subject: input.subject },
      'Sending email via Brevo'
    );

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = (await response.json()) as BrevoResponse;

    if (!response.ok) {
      logger.error({ status: response.status, code: data.code, message: data.message }, 'Brevo API error');
      throw new AppError('Email delivery failed', 502, 'EMAIL_SEND_FAILED', {
        code: data.code,
        message: data.message
      });
    }

    logger.info({ messageId: data.messageId }, 'Email sent successfully via Brevo');
    return data;
  }

  // ─── Convenience Methods ─────────────────────────────────

  /** Send an email to a single recipient */
  async sendToOne(input: { to: string; toName?: string; subject: string; html: string }): Promise<BrevoResponse> {
    return this.sendMail({
      to: [{ email: input.to, name: input.toName }],
      subject: input.subject,
      html: input.html
    });
  }

  /** Send an email with admin BCC notification */
  async sendWithAdminNotify(input: {
    to: string;
    toName?: string;
    subject: string;
    html: string;
  }): Promise<BrevoResponse> {
    return this.sendMail({
      to: [{ email: input.to, name: input.toName }],
      bcc: [{ email: env.EMAIL_ADMIN_NOTIFY }],
      subject: input.subject,
      html: input.html
    });
  }
}

export const brevoService = new BrevoService();
