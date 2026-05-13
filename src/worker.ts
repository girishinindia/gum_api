/**
 * Worker entrypoint (Phase 7.4)
 * ──────────────────────────────
 * Run with `npm run worker:dev` (tsx) or `npm run worker` (built JS).
 * NO Express server, NO Socket.io, NO cron — pure BullMQ consumers.
 *
 * Deploy alongside the API. The web tier enqueues; this worker tier
 * drains. Both share the same Redis (Upstash). Scale workers horizontally
 * by running multiple instances — BullMQ handles fair distribution.
 */

import 'dotenv/config';
import 'express-async-errors';
import type { Job } from 'bullmq';
import { buildWorker } from './services/queue.service';
import { sendEmailDirect } from './services/email.service';
import { sendSmsDirect, type SmsTemplateName } from './services/sms.service';
import { processPushJob, type PushDevice, type PushPayload } from './services/push.service';
import { logger } from './utils/logger';
import { config } from './config';

// ── Sentry (optional) ──
if (config.sentry.dsn) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.sentry.release,
    tracesSampleRate: config.sentry.tracesSampleRate,
  });
  logger.info({ env: config.sentry.environment }, '[Worker] Sentry initialised');
}

// ── Email worker ─────────────────────────────────────────────────
interface EmailJob {
  email: string;
  name: string;
  subject: string;
  html: string;
}
const emailWorker = buildWorker<EmailJob>('email', async (job: Job<EmailJob>) => {
  const { email, name, subject, html } = job.data;
  await sendEmailDirect(email, name, subject, html);
  return { delivered: true, to: email };
});

// ── SMS worker ───────────────────────────────────────────────────
interface SmsJob {
  mobile: string;
  name: string;
  otp: string;
  templateName: SmsTemplateName;
}
const smsWorker = buildWorker<SmsJob>('sms', async (job: Job<SmsJob>) => {
  const { mobile, name, otp, templateName } = job.data;
  await sendSmsDirect(mobile, name, otp, templateName);
  return { delivered: true, to: mobile, template: templateName };
});

// ── Push worker (Phase 11.2.4) ───────────────────────────────────
// One job per device — auto-deactivates on 404/410 from the push gateway.
interface PushJob { device: PushDevice; payload: PushPayload; }
const pushWorker = buildWorker<PushJob>(
  'push',
  async (job: Job<PushJob>) => processPushJob(job),
  parseInt(process.env.QUEUE_PUSH_WORKER_CONCURRENCY || '10'),
);

// ── Payouts worker (Phase 9.6) ───────────────────────────────────
// Drives money out of the platform to instructor bank accounts via the
// configured gateway (RazorpayX). Low concurrency — gateway is rate-limited
// and we don't want a thundering herd on first deploy.
interface PayoutJob { settlementId: number; }
const payoutWorker = buildWorker<PayoutJob>(
  'payouts',
  async (job: Job<PayoutJob>) => {
    const { executeQueuedPayout } = await import('./services/payoutExecutor.service');
    await executeQueuedPayout(job.data.settlementId);
    return { settlementId: job.data.settlementId };
  },
  parseInt(process.env.QUEUE_PAYOUTS_WORKER_CONCURRENCY || '1'),
);

// ── PDF-generation worker (Phase 8.7) ────────────────────────────
// Handles both invoice and certificate PDF/PNG generation. Single lane
// so Chromium is started once and shared across both kinds.
type PdfWorkerJob =
  | { kind: 'invoice'; orderId: number }
  | { kind: 'certificate'; issuedCertId: number; force?: boolean };

const pdfWorker = buildWorker<PdfWorkerJob>(
  'pdf-generation',
  async (job: Job<PdfWorkerJob>) => {
    const data = job.data;
    if (data.kind === 'invoice') {
      const { generateInvoiceForOrder } = await import('./services/invoice.service');
      return generateInvoiceForOrder(data.orderId);
    }
    if (data.kind === 'certificate') {
      const { generateCertificatePdf } = await import('./services/certificate.service');
      return generateCertificatePdf(data.issuedCertId, { force: data.force });
    }
    throw new Error(`Unknown pdf-generation job kind: ${(data as any).kind}`);
  },
  // Puppeteer is heavy — lower concurrency for this lane so we don't OOM.
  parseInt(process.env.QUEUE_PDF_WORKER_CONCURRENCY || '2'),
);

// ── Process lifecycle ───────────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[Worker] uncaught exception — exiting');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[Worker] unhandled rejection');
});

async function shutdown(signal: string) {
  logger.info({ signal }, '[Worker] shutting down');
  const { shutdownPdfRenderer } = await import('./services/pdf.service');
  await Promise.allSettled([
    emailWorker.close(),
    smsWorker.close(),
    pushWorker.close(),
    pdfWorker.close(),
    payoutWorker.close(),
    shutdownPdfRenderer(),
  ]);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

logger.info(
  { queueEnabled: config.queue.enabled, prefix: config.queue.prefix, concurrency: config.queue.workerConcurrency },
  '[Worker] online — consuming email + sms + push + pdf-generation + payouts queues',
);
