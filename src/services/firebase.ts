/**
 * Firebase Admin (Phase 45) — mobile push transport for FCM (Android + iOS).
 * ─────────────────────────────────────────────────────────────────────────
 * Lazily initialised and fully optional: if no service-account credentials are
 * configured, `getMessaging()` returns null and callers no-op. This lets the
 * API boot and run normally before the Firebase project is set up — web push
 * (VAPID) is entirely independent of this module.
 *
 * Credentials are read from (in order):
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON          — full service-account JSON string (prod)
 *   2. <api-root>/firebase-service-account.json — local file (dev; gitignored)
 *
 * `firebase-admin` is require()'d lazily so a missing dependency or missing
 * credentials never crashes startup, and the typecheck never depends on it.
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

let _messaging: any = null;
let _initTried = false;

function loadCredentials(): any | null {
  // 1. Env var (production)
  if (config.firebase.serviceAccountJson) {
    try {
      return JSON.parse(config.firebase.serviceAccountJson);
    } catch (e) {
      logger.error({ err: e }, '[fcm] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
      return null;
    }
  }
  // 2. Local file (development)
  try {
    const p = path.resolve(process.cwd(), 'firebase-service-account.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    logger.error({ err: e }, '[fcm] failed to read firebase-service-account.json');
  }
  return null;
}

/**
 * Returns the firebase-admin Messaging instance, or null when FCM is not
 * configured / the SDK is unavailable. Initialises once on first call.
 */
export function getMessaging(): any {
  if (_initTried) return _messaging;
  _initTried = true;

  const creds = loadCredentials();
  if (!creds) {
    logger.warn('[fcm] no Firebase credentials — mobile push disabled (web push unaffected)');
    return null;
  }

  try {
    // Lazy require: keeps the dependency optional at runtime and decoupled from typecheck.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(creds),
        projectId: config.firebase.projectId || creds.project_id,
      });
    }
    _messaging = admin.messaging();
    logger.info(
      { projectId: config.firebase.projectId || creds.project_id },
      '[fcm] firebase-admin initialised',
    );
  } catch (e) {
    logger.error({ err: e }, '[fcm] firebase-admin init failed — is the dependency installed?');
    _messaging = null;
  }
  return _messaging;
}

/** True when mobile push is available. */
export function fcmEnabled(): boolean {
  return getMessaging() !== null;
}
