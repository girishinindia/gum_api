import { fallbackEventId } from '../../src/services/webhookEvents.service';

describe('webhookEvents.fallbackEventId', () => {
  it('produces a stable id given the same inputs', () => {
    const a = fallbackEventId('razorpay', 'payment.captured', 'pay_abc', 1700000000);
    const b = fallbackEventId('razorpay', 'payment.captured', 'pay_abc', 1700000000);
    expect(a).toBe(b);
  });

  it('different inputs produce different ids', () => {
    const a = fallbackEventId('razorpay', 'payment.captured', 'pay_abc', 1700000000);
    const b = fallbackEventId('razorpay', 'payment.captured', 'pay_xyz', 1700000000);
    expect(a).not.toBe(b);
  });

  it('id is provider-prefixed', () => {
    const id = fallbackEventId('bunny_stream', 'video.ready', 'vid_42');
    expect(id.startsWith('bunny_stream:')).toBe(true);
    expect(id.length).toBeLessThanOrEqual('bunny_stream:'.length + 32);
  });

  it('handles nullish parts safely', () => {
    const id = fallbackEventId('razorpayx', null, undefined, 'payout_1');
    expect(typeof id).toBe('string');
    expect(id.startsWith('razorpayx:')).toBe(true);
  });
});
