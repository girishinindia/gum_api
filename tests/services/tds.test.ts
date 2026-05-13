import {
  currentFyLabel,
  fyStartDate,
  fyEndDate,
} from '../../src/services/tds.service';

describe('tds.service — pure helpers', () => {
  describe('currentFyLabel', () => {
    it('uses Apr 1 as FY start — Apr 2025 → "2526"', () => {
      const d = new Date(Date.UTC(2025, 3, 1, 12, 0, 0)); // April 1 2025 UTC
      expect(currentFyLabel(d)).toBe('2526');
    });

    it('Jan/Feb/Mar still belongs to the previous FY', () => {
      const d = new Date(Date.UTC(2026, 1, 15, 12, 0, 0)); // Feb 15 2026 UTC
      expect(currentFyLabel(d)).toBe('2526');
    });

    it('Dec belongs to the current FY (started in April)', () => {
      const d = new Date(Date.UTC(2025, 11, 31, 12, 0, 0)); // Dec 31 2025 UTC
      expect(currentFyLabel(d)).toBe('2526');
    });

    it('Apr 2026 rolls over to "2627"', () => {
      const d = new Date(Date.UTC(2026, 3, 5, 12, 0, 0));
      expect(currentFyLabel(d)).toBe('2627');
    });
  });

  describe('fyStartDate / fyEndDate', () => {
    it('returns Apr 1 / Mar 31 in UTC for a given FY label', () => {
      const start = fyStartDate('2526');
      const end = fyEndDate('2526');
      expect(start.toISOString()).toBe('2025-04-01T00:00:00.000Z');
      expect(end.toISOString().slice(0, 10)).toBe('2026-03-31');
    });

    it('"2627" maps to 2026-04-01 → 2027-03-31', () => {
      const start = fyStartDate('2627');
      const end = fyEndDate('2627');
      expect(start.getUTCFullYear()).toBe(2026);
      expect(end.getUTCFullYear()).toBe(2027);
    });
  });
});
