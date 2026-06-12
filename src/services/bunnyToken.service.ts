/**
 * Bunny Stream Token Signer
 * ─────────────────────────
 * Generates signed embed/HLS URLs for Bunny Stream videos.
 *
 * Bunny's Player Token Authentication (enabled at the library level in
 * Phase 0.1) requires every embed request to carry:
 *   ?token=<hash>&expires=<unix_ts>
 * where
 *   hash = sha256_hex( token_security_key + video_id + expires_unix )
 *
 * The token_security_key lives on the Bunny library Security page; we
 * mirror it into the BUNNY_STREAM_TOKEN_KEY env var. If a viewer IP is
 * passed it's appended to the hash input (some Bunny SDKs do this) — we
 * keep it optional behind a flag because the official docs don't require
 * it and over-pinning breaks mobile users behind carrier-grade NAT.
 *
 * Reference: https://docs.bunny.net/docs/stream-embed-token-authentication
 */

import crypto from 'crypto';
import { config } from '../config';

const EMBED_BASE = 'https://iframe.mediadelivery.net/embed';

export interface SignedEmbedOptions {
  /** Expiry TTL in seconds. Defaults to BUNNY_STREAM_TOKEN_TTL_SECONDS (1h). */
  ttlSeconds?: number;
  /** Optional viewer IP to pin the token to. Off by default (NAT-friendly). */
  viewerIp?: string;
  /** Optional explicit expiry unix timestamp. Overrides ttlSeconds when set. */
  expiresUnix?: number;
}

export interface SignedEmbedResult {
  embedUrl: string;
  /** When the signed URL stops working. */
  expiresAt: Date;
  /** The token hash, useful for clients building their own URLs. */
  token: string;
  /** The library id baked into the URL. */
  libraryId: string;
}

/**
 * Generate a signed embed URL for a specific Bunny Stream video.
 *
 * @throws if the token key or library id is not configured.
 */
export function signEmbedUrl(videoId: string, opts: SignedEmbedOptions = {}): SignedEmbedResult {
  const libraryId = config.bunny.streamLibraryId;
  const tokenKey = config.bunny.streamTokenKey;

  if (!libraryId) {
    throw new Error('BUNNY_STREAM_LIBRARY_ID is not configured');
  }
  if (!tokenKey) {
    throw new Error('BUNNY_STREAM_TOKEN_KEY is not configured');
  }

  const ttl = opts.ttlSeconds ?? config.bunny.streamTokenTtlSeconds;
  const expiresUnix = opts.expiresUnix ?? Math.floor(Date.now() / 1000) + ttl;

  // Bunny signing scheme:
  //   hash = sha256_hex( token_key + video_id + expires_unix [+ viewer_ip] )
  const payload =
    tokenKey + videoId + String(expiresUnix) + (opts.viewerIp ? opts.viewerIp : '');
  const token = crypto.createHash('sha256').update(payload).digest('hex');

  const params = new URLSearchParams({
    token,
    expires: String(expiresUnix),
  });

  const embedUrl = `${EMBED_BASE}/${libraryId}/${videoId}?${params.toString()}`;

  return {
    embedUrl,
    token,
    expiresAt: new Date(expiresUnix * 1000),
    libraryId,
  };
}

/**
 * Generate a signed HLS playlist URL — for clients that play HLS directly
 * instead of using Bunny's iframe player. Bunny serves HLS at
 *   https://<streamCdn>/<videoId>/playlist.m3u8
 * with the same token+expires query params.
 */
export function signHlsUrl(videoId: string, opts: SignedEmbedOptions = {}): SignedEmbedResult {
  const streamCdn =
    config.bunny.streamCdn || 'https://vz-cdn.b-cdn.net';
  const tokenKey = config.bunny.streamTokenKey;

  if (!tokenKey) {
    throw new Error('BUNNY_STREAM_TOKEN_KEY is not configured');
  }

  const ttl = opts.ttlSeconds ?? config.bunny.streamTokenTtlSeconds;
  const expiresUnix = opts.expiresUnix ?? Math.floor(Date.now() / 1000) + ttl;

  const payload =
    tokenKey + videoId + String(expiresUnix) + (opts.viewerIp ? opts.viewerIp : '');
  const token = crypto.createHash('sha256').update(payload).digest('hex');

  const params = new URLSearchParams({
    token,
    expires: String(expiresUnix),
  });

  const base = streamCdn.replace(/\/+$/, '');
  const embedUrl = `${base}/${videoId}/playlist.m3u8?${params.toString()}`;

  return {
    embedUrl,
    token,
    expiresAt: new Date(expiresUnix * 1000),
    libraryId: config.bunny.streamLibraryId,
  };
}

/**
 * BUG-12 fix (June 2026): sign ANY per-video file on the Stream pull zone
 * (thumbnail.jpg, preview.webp, …). Same token formula as signHlsUrl —
 * Bunny validates sha256(key + videoId + expires) zone-wide for the video.
 * Without this, admin thumbnails 403 when Stream token auth is enabled.
 */
export function signStreamFileUrl(videoId: string, file: string, opts: SignedEmbedOptions = {}): string {
  const streamCdn = config.bunny.streamCdn || 'https://vz-cdn.b-cdn.net';
  const tokenKey = config.bunny.streamTokenKey;
  if (!tokenKey) {
    // Token auth not configured → zone is public; return the plain URL.
    return `${streamCdn.replace(/\/+$/, '')}/${videoId}/${file}`;
  }
  const ttl = opts.ttlSeconds ?? config.bunny.streamTokenTtlSeconds;
  const expiresUnix = opts.expiresUnix ?? Math.floor(Date.now() / 1000) + ttl;
  const payload = tokenKey + videoId + String(expiresUnix) + (opts.viewerIp ? opts.viewerIp : '');
  const token = crypto.createHash('sha256').update(payload).digest('hex');
  const params = new URLSearchParams({ token, expires: String(expiresUnix) });
  return `${streamCdn.replace(/\/+$/, '')}/${videoId}/${file}?${params.toString()}`;
}
