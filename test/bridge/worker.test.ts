import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '@discord-telegram-bridge/bridge';
import { createTestEnv, stubTelegramFetch } from './support';

/**
 * The Worker's entrypoint.
 *
 * The default export is what Cloudflare loads, so the suite drives it exactly
 * as the platform would: a request, the bindings, and an execution context.
 */
describe('the worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves a request', async () => {
    stubTelegramFetch();
    const response = await worker.fetch(new Request('https://bridge.test/health'), createTestEnv(), {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });
    expect(response.status).toBe(200);
  });

  it('answers a request with no route with the family envelope', async () => {
    stubTelegramFetch();
    const response = await worker.fetch(new Request('https://bridge.test/nope'), createTestEnv(), {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });
    expect(response.status).toBe(404);
  });

  it('does nothing on the scheduled path', async () => {
    stubTelegramFetch();
    await expect(
      worker.scheduled({ cron: '* * * * *', scheduledTime: 0, noRetry: () => {} }, createTestEnv(), {
        waitUntil: () => {},
        passThroughOnException: () => {},
      }),
    ).resolves.toBeUndefined();
  });
});
