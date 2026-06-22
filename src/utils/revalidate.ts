import { config } from '../config';
import { logger } from './logger';

/**
 * Fire-and-forget on-demand revalidation of the public site (gum_web).
 *
 * Admin content edits (CMS singletons, team members, job positions,
 * instructor activation) otherwise wait for the ISR window (1–5 min) before
 * showing up on the public site. After a successful write, controllers call
 * this to ping gum_web's POST /api/revalidate route, which invalidates the
 * `public-content` fetch tag so the next page view renders fresh.
 *
 * - No-ops silently when WEB_BASE_URL or REVALIDATE_SECRET aren't configured.
 * - Never throws and never blocks the response — revalidation must not break
 *   (or slow) the admin write that triggered it.
 */
export function revalidateWeb(reason = 'content-update'): void {
  const baseUrl = config.web.baseUrl;
  const secret = config.web.revalidateSecret;
  if (!baseUrl || !secret) return;

  const url = `${baseUrl}/api/revalidate`;

  // Fire-and-forget — intentionally not awaited.
  void (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, reason }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) logger.warn(`revalidateWeb: ${url} responded ${res.status} (${reason})`);
    } catch (e: any) {
      logger.warn(`revalidateWeb failed (${reason}): ${e?.message || e}`);
    }
  })();
}
