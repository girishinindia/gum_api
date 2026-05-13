import {
  normalizeMobile,
  maskEmail,
  maskMobile,
  hashSha256,
  getDeviceType,
  getClientIp,
} from '../../src/utils/helpers';

describe('utils/helpers', () => {
  describe('normalizeMobile', () => {
    it('prepends +91 to a clean 10-digit number', () => {
      expect(normalizeMobile('9876543210')).toBe('+919876543210');
    });

    it('strips spaces and dashes before normalising', () => {
      expect(normalizeMobile('98765 43210')).toBe('+919876543210');
      expect(normalizeMobile('987-654-3210')).toBe('+919876543210');
    });

    it('keeps an existing +CC prefix when not 10 digits', () => {
      const out = normalizeMobile('+44 7700 900123');
      expect(out.startsWith('+')).toBe(true);
      expect(out).toMatch(/^\+44/);
    });
  });

  describe('maskEmail', () => {
    it('keeps the first two chars then ***@domain', () => {
      expect(maskEmail('aniketh@example.com')).toBe('an***@example.com');
    });

    it('keeps the domain part intact', () => {
      const out = maskEmail('john.doe@growupmore.com');
      expect(out.endsWith('@growupmore.com')).toBe(true);
    });
  });

  describe('maskMobile', () => {
    it('shows first 3 + six stars + last 2', () => {
      expect(maskMobile('9876543210')).toBe('987******10');
    });
  });

  describe('hashSha256', () => {
    it('is deterministic and 64 hex chars', () => {
      const a = hashSha256('hello world');
      const b = hashSha256('hello world');
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it('different inputs produce different hashes', () => {
      expect(hashSha256('a')).not.toBe(hashSha256('b'));
    });
  });

  describe('getDeviceType', () => {
    it('classifies common user-agent strings', () => {
      expect(getDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)')).toBe('mobile');
      expect(getDeviceType('Mozilla/5.0 (iPad; CPU OS 16_0)')).toBe('tablet');
      expect(getDeviceType('Mozilla/5.0 (Macintosh)')).toBe('desktop');
      expect(getDeviceType(undefined)).toBe('unknown');
    });
  });

  describe('getClientIp', () => {
    it('prefers x-forwarded-for first hop', () => {
      const req = { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }, ip: '10.0.0.1' };
      expect(getClientIp(req)).toBe('203.0.113.1');
    });

    it('falls back to req.ip', () => {
      const req = { headers: {}, ip: '127.0.0.1' };
      expect(getClientIp(req)).toBe('127.0.0.1');
    });

    it('returns null when neither is present', () => {
      const req = { headers: {} };
      expect(getClientIp(req)).toBeNull();
    });
  });
});
