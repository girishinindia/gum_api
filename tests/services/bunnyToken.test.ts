import crypto from 'crypto';
import { signEmbedUrl, signHlsUrl } from '../../src/services/bunnyToken.service';

describe('bunnyToken.service', () => {
  const videoId = 'video-abc-123';

  describe('signEmbedUrl', () => {
    it('produces a deterministic sha256 token + expires query string', () => {
      const result = signEmbedUrl(videoId, { expiresUnix: 1_900_000_000 });

      const expectedToken = crypto
        .createHash('sha256')
        .update('test-token-key' + videoId + '1900000000')
        .digest('hex');

      expect(result.token).toBe(expectedToken);
      expect(result.embedUrl).toContain(`/embed/629329/${videoId}`);
      expect(result.embedUrl).toContain(`token=${expectedToken}`);
      expect(result.embedUrl).toContain('expires=1900000000');
      expect(result.expiresAt).toEqual(new Date(1_900_000_000 * 1000));
      expect(result.libraryId).toBe('629329');
    });

    it('includes viewer IP in hash input when provided', () => {
      const a = signEmbedUrl(videoId, { expiresUnix: 1_900_000_000 });
      const b = signEmbedUrl(videoId, { expiresUnix: 1_900_000_000, viewerIp: '203.0.113.42' });
      expect(a.token).not.toBe(b.token);
    });

    it('defaults expiry to ~now + TTL when expiresUnix not given', () => {
      const before = Math.floor(Date.now() / 1000);
      const r = signEmbedUrl(videoId, { ttlSeconds: 600 });
      const after = Math.floor(Date.now() / 1000);
      const expiry = Math.floor(r.expiresAt.getTime() / 1000);
      // expiry is approximately now + 600
      expect(expiry).toBeGreaterThanOrEqual(before + 600 - 2);
      expect(expiry).toBeLessThanOrEqual(after + 600 + 2);
    });
  });

  describe('signHlsUrl', () => {
    it('emits a playlist URL with token + expires', () => {
      const r = signHlsUrl(videoId, { expiresUnix: 1_900_000_000 });
      expect(r.embedUrl).toMatch(/\/playlist\.m3u8\?token=[a-f0-9]{64}&expires=1900000000$/);
    });

    it('uses an HTTPS CDN base host', () => {
      const r = signHlsUrl(videoId, { expiresUnix: 1_900_000_000 });
      expect(r.embedUrl.startsWith('https://')).toBe(true);
      expect(r.embedUrl).toContain(`/${videoId}/playlist.m3u8`);
    });
  });
});
