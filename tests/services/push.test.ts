/**
 * Phase 11.2.8 — push.service unit tests.
 *
 * We mock the `web-push` library and the supabase client so the tests
 * stay hermetic. The goal is to lock in three pieces of behaviour:
 *
 *   1. `sendPushDirect` posts the right body to `web-push.sendNotification`
 *      and bumps `last_used_at` on success.
 *   2. `sendPushDirect` deactivates the row when the gateway returns 410.
 *   3. `enqueuePush` short-circuits to 0 when the user has no active
 *      devices, and otherwise enqueues one job per device.
 */

import { jest } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────
const sendNotificationMock = jest.fn() as unknown as jest.Mock<any>;
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: (sub: unknown, body: string, opts: unknown) =>
      sendNotificationMock(sub, body, opts),
  },
  // Some installs export named symbols too
  setVapidDetails: jest.fn(),
  sendNotification: (sub: unknown, body: string, opts: unknown) =>
    sendNotificationMock(sub, body, opts),
}));

// A configurable update-builder mock so the test can assert which row was
// touched (last_used_at vs is_active=false).
const updateCalls: Array<{ patch: any; eq: any }> = [];
function makeUpdateBuilder() {
  return (patch: any) => ({
    eq: (col: string, val: any) => {
      updateCalls.push({ patch, eq: { [col]: val } });
      return Promise.resolve({ data: null, error: null });
    },
  });
}

const selectMock = jest.fn() as unknown as jest.Mock<any>;
jest.mock('../../src/config/supabase', () => ({
  __esModule: true,
  supabase: {
    from: (_table: string) => ({
      update: makeUpdateBuilder(),
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => selectMock(),
          }),
        }),
      }),
    }),
  },
}));

// Queue must NOT be enabled or we'd need Redis
process.env.QUEUE_ENABLED = 'false';
process.env.PUSH_QUEUE_ENABLED = 'false';

// Import AFTER mocks are wired up
import { sendPushDirect, enqueuePush, type PushDevice } from '../../src/services/push.service';

const device: PushDevice = {
  id: 42,
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc-123',
  p256dh:   'BJ-fake-p256dh-key-padding-padding-padding-padding',
  auth:     'auth-secret-padding',
};

beforeEach(() => {
  sendNotificationMock.mockReset();
  updateCalls.length = 0;
  selectMock.mockReset();
});

describe('push.service.sendPushDirect', () => {
  it('serialises payload, sends via web-push, and bumps last_used_at on success', async () => {
    sendNotificationMock.mockResolvedValueOnce(undefined);

    const status = await sendPushDirect(device, {
      title: 'Hello',
      body:  'World',
      url:   '/dashboard',
      tag:   'test-tag',
    });

    expect(status).toBe('sent');
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);

    const [subArg, bodyArg, optsArg] = sendNotificationMock.mock.calls[0] as [any, string, any];
    expect(subArg.endpoint).toBe(device.endpoint);
    expect(subArg.keys.p256dh).toBe(device.p256dh);
    expect(subArg.keys.auth).toBe(device.auth);

    const parsed = JSON.parse(bodyArg);
    expect(parsed.title).toBe('Hello');
    expect(parsed.body).toBe('World');
    expect(parsed.url).toBe('/dashboard');
    expect(parsed.tag).toBe('test-tag');

    expect(optsArg.TTL).toBe(60 * 60 * 24);

    // last_used_at touched on the right row
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].patch).toHaveProperty('last_used_at');
    expect(updateCalls[0].eq).toEqual({ id: 42 });
  });

  it('deactivates the device on HTTP 410 from the push gateway', async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 410, message: 'Gone' });

    const status = await sendPushDirect(device, { title: 'x', body: 'y' });

    expect(status).toBe('gone');
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].patch).toEqual({ is_active: false });
    expect(updateCalls[0].eq).toEqual({ id: 42 });
  });

  it('deactivates the device on HTTP 404 (subscription removed)', async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 404 });

    const status = await sendPushDirect(device, { title: 'x', body: 'y' });

    expect(status).toBe('gone');
    expect(updateCalls[0].patch).toEqual({ is_active: false });
  });

  it('re-throws non-fatal errors so the worker can retry', async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 500, message: 'Push svc 500' });
    await expect(sendPushDirect(device, { title: 'x', body: 'y' })).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

describe('push.service.enqueuePush', () => {
  it('returns 0 when the user has no active devices', async () => {
    selectMock.mockResolvedValueOnce({ data: [], error: null });
    const result = await enqueuePush(99, { title: 'x', body: 'y' });
    expect(result).toEqual({ enqueued: 0 });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('sends one push per device when queue is disabled (syncFallback path)', async () => {
    selectMock.mockResolvedValueOnce({
      data: [
        { id: 1, endpoint: 'https://a.example/e1', p256dh: 'p1-padding-padding-padding', auth: 'a1-padding' },
        { id: 2, endpoint: 'https://b.example/e2', p256dh: 'p2-padding-padding-padding', auth: 'a2-padding' },
      ],
      error: null,
    });
    sendNotificationMock.mockResolvedValue(undefined);

    const result = await enqueuePush(99, { title: 'multi', body: 'cast' });
    expect(result).toEqual({ enqueued: 2 });
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
  });
});
