/**
 * PDF Queue Wrapper (Phase 8.7)
 * ─────────────────────────────
 * Thin convenience layer that routes PDF generation through the
 * 'pdf-generation' BullMQ lane when QUEUE_ENABLED=true, or runs inline
 * via syncFallback otherwise (preserves pre-Phase-7 behaviour).
 *
 * Worker (src/worker.ts) registers processors for kind='invoice' and
 * kind='certificate' and calls the underlying services.
 */

import { enqueue } from './queue.service';

export interface InvoicePdfJob {
  kind: 'invoice';
  orderId: number;
}

export interface CertificatePdfJob {
  kind: 'certificate';
  issuedCertId: number;
  force?: boolean;
}

export type PdfJob = InvoicePdfJob | CertificatePdfJob;

export async function enqueueInvoicePdf(orderId: number): Promise<void> {
  // Lazy imports to avoid loading puppeteer in code paths that never need it
  await enqueue<InvoicePdfJob>(
    'pdf-generation',
    'invoice',
    { kind: 'invoice', orderId },
    {
      jobId: `invoice:${orderId}`,    // idempotent at the queue layer
      syncFallback: async (data) => {
        const { generateInvoiceForOrder } = await import('./invoice.service');
        await generateInvoiceForOrder(data.orderId);
      },
    },
  );
}

export async function enqueueCertificatePdf(issuedCertId: number, opts: { force?: boolean } = {}): Promise<void> {
  await enqueue<CertificatePdfJob>(
    'pdf-generation',
    'certificate',
    { kind: 'certificate', issuedCertId, force: opts.force },
    {
      jobId: opts.force ? undefined : `certificate:${issuedCertId}`,
      syncFallback: async (data) => {
        const { generateCertificatePdf } = await import('./certificate.service');
        await generateCertificatePdf(data.issuedCertId, { force: data.force });
      },
    },
  );
}
