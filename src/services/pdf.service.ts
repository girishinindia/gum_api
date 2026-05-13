/**
 * PDF Service (Phase 8.3)
 * ───────────────────────
 * Thin abstraction over Puppeteer to keep heavy browser-launch costs out of
 * controllers and make the underlying engine swappable (e.g. Browserless.io
 * in serverless deployments).
 *
 * Single shared browser instance — Chromium boot is expensive (~300 MB,
 * a few hundred ms). Subsequent renders cost a `newPage` (~10 ms).
 *
 * Deployment note:
 *   Puppeteer was installed with PUPPETEER_SKIP_DOWNLOAD=true to keep the
 *   git/CI artefact small. The first time a worker starts on a host, run
 *     npx puppeteer browsers install chrome
 *   OR set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium (or similar) to use
 *   a system browser.
 */

import type { Browser, PaperFormat } from 'puppeteer';
import { logger } from '../utils/logger';

let _browser: Browser | null = null;
let _initPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Lazy require so the import cost is only paid by code paths that
    // actually render PDFs (web tier may never need it; worker tier does).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
    logger.info('[PDF] Puppeteer browser launched');
    _browser = browser;
    browser.on('disconnected', () => {
      logger.warn('[PDF] Puppeteer browser disconnected — will relaunch on next render');
      _browser = null;
      _initPromise = null;
    });
    return browser;
  })();

  return _initPromise;
}

export interface RenderPdfOptions {
  /** Paper format. Default A4 (invoices) — use 'A4-landscape' for certificates. */
  format?: PaperFormat;
  /** Landscape orientation (overrides format-implied orientation). */
  landscape?: boolean;
  /** CSS margins (any CSS unit). Default narrow margins for invoices. */
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
  /** Print background colours / images. Default true. */
  printBackground?: boolean;
  /** Viewport width when rendering — affects responsive HTML. Default 1240 (A4 @ ~150dpi). */
  viewportWidth?: number;
  viewportHeight?: number;
  /**
   * Wait until before printing. Default 'load'. (Newer Puppeteer typings
   * removed 'networkidle0' from setContent's waitUntil — we only render
   * static HTML so 'load' is sufficient.)
   */
  waitUntil?: 'load' | 'domcontentloaded';
  /** Optional header/footer templates (HTML; supports {pageNumber}, {totalPages} etc.) */
  headerTemplate?: string;
  footerTemplate?: string;
  displayHeaderFooter?: boolean;
}

const DEFAULT_INVOICE_MARGIN = { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' };

/**
 * Render HTML to a PDF buffer.
 * Caller is responsible for uploading to Bunny CDN.
 */
export async function htmlToPdfBuffer(html: string, opts: RenderPdfOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: opts.viewportWidth ?? 1240,
      height: opts.viewportHeight ?? 1754,
      deviceScaleFactor: 2,
    });
    await page.setContent(html, { waitUntil: opts.waitUntil ?? 'load' });

    const pdf = await page.pdf({
      format: opts.format ?? 'A4',
      landscape: !!opts.landscape,
      margin: opts.margin ?? DEFAULT_INVOICE_MARGIN,
      printBackground: opts.printBackground ?? true,
      displayHeaderFooter: !!opts.displayHeaderFooter,
      headerTemplate: opts.headerTemplate,
      footerTemplate: opts.footerTemplate,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    try { await page.close(); } catch { /* swallow */ }
  }
}

export interface RenderPngOptions {
  width?: number;
  height?: number;
  /** Render at this CSS scale (1 = same px count, 2 = retina). Default 2. */
  deviceScaleFactor?: number;
  /** Crop to full page or just viewport. Default 'viewport' (faster). */
  fullPage?: boolean;
  /** Background colour (CSS string). Default white. */
  omitBackground?: boolean;
}

export async function htmlToPngBuffer(html: string, opts: RenderPngOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: opts.width ?? 1240,
      height: opts.height ?? 1754,
      deviceScaleFactor: opts.deviceScaleFactor ?? 2,
    });
    await page.setContent(html, { waitUntil: 'load' });
    const png = await page.screenshot({
      type: 'png',
      fullPage: opts.fullPage ?? false,
      omitBackground: opts.omitBackground ?? false,
    });
    return Buffer.from(png);
  } finally {
    try { await page.close(); } catch { /* swallow */ }
  }
}

/** Graceful shutdown — call from server.ts / worker.ts SIGTERM. */
export async function shutdownPdfRenderer(): Promise<void> {
  if (_browser) {
    try { await _browser.close(); } catch { /* swallow */ }
    _browser = null;
    _initPromise = null;
  }
}
