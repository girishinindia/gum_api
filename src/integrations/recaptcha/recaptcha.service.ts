import { env } from '../../config/env';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/errors/app-error';

// ─── Types ───────────────────────────────────────────────────

interface RecaptchaResult {
  success: boolean;
  score: number;
  skipped: boolean;
  action?: string;
}

interface RecaptchaAssessmentResponse {
  tokenProperties?: {
    valid: boolean;
    action: string;
  };
  riskAnalysis?: {
    score: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

// ─── Service ─────────────────────────────────────────────────

export class RecaptchaService {
  /**
   * Skip reCAPTCHA when RECAPTCHA_ENABLED=false OR in non-production environments.
   */
  private get shouldSkip(): boolean {
    return !env.RECAPTCHA_ENABLED || env.NODE_ENV !== 'production';
  }

  /**
   * Verify a reCAPTCHA token against Google reCAPTCHA Enterprise.
   *
   * - In development/test: auto-skips and returns success.
   * - In production: calls Google API and checks score >= RECAPTCHA_MIN_SCORE.
   */
  async verify(token: string, expectedAction?: string): Promise<RecaptchaResult> {
    // ─── Auto-skip for local / test ────────────────────────
    if (this.shouldSkip) {
      logger.debug('reCAPTCHA skipped (non-production environment)');
      return { success: true, score: 1, skipped: true };
    }

    // ─── Production: call Google reCAPTCHA Enterprise ──────
    if (!token) {
      throw new AppError('reCAPTCHA token is required', 400, 'RECAPTCHA_TOKEN_MISSING');
    }

    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${env.RECAPTCHA_PROJECT_ID}/assessments?key=${env.RECAPTCHA_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: {
          token,
          siteKey: env.RECAPTCHA_SITE_KEY,
          expectedAction: expectedAction ?? 'LOGIN'
        }
      })
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'reCAPTCHA Enterprise API HTTP error');
      throw new AppError('reCAPTCHA verification failed', 502, 'RECAPTCHA_API_ERROR');
    }

    const data = (await response.json()) as RecaptchaAssessmentResponse;

    // Check token validity
    if (!data.tokenProperties?.valid) {
      logger.warn({ action: data.tokenProperties?.action }, 'reCAPTCHA token invalid');
      throw new AppError('reCAPTCHA verification failed', 403, 'RECAPTCHA_INVALID');
    }

    // Check action match (if expectedAction provided)
    if (expectedAction && data.tokenProperties.action !== expectedAction) {
      logger.warn(
        { expected: expectedAction, got: data.tokenProperties.action },
        'reCAPTCHA action mismatch'
      );
      throw new AppError('reCAPTCHA verification failed', 403, 'RECAPTCHA_ACTION_MISMATCH');
    }

    const score = data.riskAnalysis?.score ?? 0;

    // Check score threshold
    if (score < env.RECAPTCHA_MIN_SCORE) {
      logger.warn({ score, threshold: env.RECAPTCHA_MIN_SCORE }, 'reCAPTCHA score too low');
      throw new AppError('reCAPTCHA verification failed — suspected bot', 403, 'RECAPTCHA_LOW_SCORE');
    }

    logger.info({ score, action: data.tokenProperties.action }, 'reCAPTCHA verified');

    return {
      success: true,
      score,
      skipped: false,
      action: data.tokenProperties.action
    };
  }
}

export const recaptchaService = new RecaptchaService();
