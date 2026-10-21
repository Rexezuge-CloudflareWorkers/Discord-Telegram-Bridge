import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeApp } from '@discord-telegram-bridge/bridge/routes';
import { createTestEnv, FakeKVNamespace, stubTelegramFetch, TEST_WEBHOOK_TOKEN } from './support';

/**
 * The HTTP surface.
 *
 * The suites drive the real application — the real middleware, the real
 * composition root, the real services — with the Telegram API stubbed, so
 * what is tested is the wiring and not a mock of it.
 */
describe('the bridge application', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers the health probe', async () => {
    const app = createBridgeApp();
    const response = await app.fetch(new Request('https://bridge.test/health'), createTestEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('answers an unknown route with the family envelope', async () => {
    const app = createBridgeApp();
    const response = await app.fetch(new Request('https://bridge.test/nope'), createTestEnv());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ Exception: { Type: 'NotFound', Message: 'No such route.' } });
  });

  describe('the webhook receiver', () => {
    it('forwards a message to Telegram', async () => {
      const calls = stubTelegramFetch();
      const app = createBridgeApp();
      const request = new Request(`https://bridge.test/discord/webhooks/123/${TEST_WEBHOOK_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hello', username: 'relay' }),
      });

      const response = await app.fetch(request, createTestEnv());

      expect(response.status).toBe(204);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toContain('/sendMessage');
      expect(calls[0]?.body).toMatchObject({
        chat_id: '-1001234567890',
        text: '<b>relay</b>\nhello',
        parse_mode: 'HTML',
      });
    });

    it('refuses a request with the wrong token', async () => {
      stubTelegramFetch();
      const app = createBridgeApp();
      const request = new Request('https://bridge.test/discord/webhooks/123/wrong', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hello' }),
      });

      const response = await app.fetch(request, createTestEnv());

      expect(response.status).toBe(401);
    });

    it('refuses a body that is not JSON', async () => {
      stubTelegramFetch();
      const app = createBridgeApp();
      const request = new Request(`https://bridge.test/discord/webhooks/123/${TEST_WEBHOOK_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      const response = await app.fetch(request, createTestEnv());

      expect(response.status).toBe(400);
    });

    it('answers 404 when no destination is configured', async () => {
      stubTelegramFetch();
      const app = createBridgeApp();
      const request = new Request(`https://bridge.test/discord/webhooks/123/${TEST_WEBHOOK_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hello' }),
      });

      const response = await app.fetch(request, createTestEnv({ telegramChatId: '' }));

      expect(response.status).toBe(404);
    });

    it('answers 502 when Telegram refuses the message', async () => {
      stubTelegramFetch(() => Response.json({ ok: false, description: 'chat not found' }, { status: 400 }));
      const app = createBridgeApp();
      const request = new Request(`https://bridge.test/discord/webhooks/123/${TEST_WEBHOOK_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hello' }),
      });

      const response = await app.fetch(request, createTestEnv());

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ Exception: { Type: 'BadRequest' } });
    });

    it('uses the route mapped to the webhook id', async () => {
      const calls = stubTelegramFetch();
      const routes = new FakeKVNamespace();
      await routes.put('route:webhook:123', JSON.stringify({ chatId: '-100999', enabled: true }));
      const app = createBridgeApp();
      const request = new Request(`https://bridge.test/discord/webhooks/123/${TEST_WEBHOOK_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hello' }),
      });

      await app.fetch(request, createTestEnv({ routes }));

      expect(calls[0]?.body).toMatchObject({ chat_id: '-100999' });
    });

    it('relays a multipart body with a file', async () => {
      const calls = stubTelegramFetch();
      const app = createBridgeApp();
      const form = new FormData();
      form.set(
        'payload_json',
        JSON.stringify({ content: 'look', attachments: [{ id: '1', filename: 'a.png', content_type: 'image/png', size: 3 }] }),
      );
      form.set('files[0]', new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }));
      const request = new Request(`https://bridge.test/discord/webhooks/123/${TEST_WEBHOOK_TOKEN}`, {
        method: 'POST',
        body: form,
      });

      const response = await app.fetch(request, createTestEnv());

      expect(response.status).toBe(204);
      expect(calls).toHaveLength(2);
      expect(calls[1]?.url).toContain('/sendPhoto');
    });
  });

  describe('the interactions endpoint', () => {
    it('refuses a request with no signature', async () => {
      stubTelegramFetch();
      const app = createBridgeApp();
      const response = await app.fetch(
        new Request('https://bridge.test/discord/interactions', { method: 'POST', body: '{"type":1}' }),
        createTestEnv(),
      );
      expect(response.status).toBe(401);
    });

    it('refuses a request whose signature does not verify', async () => {
      stubTelegramFetch();
      const app = createBridgeApp();
      const response = await app.fetch(
        new Request('https://bridge.test/discord/interactions', {
          method: 'POST',
          headers: { 'x-signature-ed25519': '00'.repeat(64), 'x-signature-timestamp': '1700000000' },
          body: '{"type":1}',
        }),
        createTestEnv(),
      );
      expect(response.status).toBe(401);
    });
  });

  describe('the admin API', () => {
    it('answers 404 when Access is not configured', async () => {
      stubTelegramFetch();
      const app = createBridgeApp();
      const response = await app.fetch(new Request('https://bridge.test/admin/routes'), createTestEnv());
      expect(response.status).toBe(404);
    });

    it('refuses a caller Access does not recognise', async () => {
      stubTelegramFetch();
      const app = createBridgeApp();
      const response = await app.fetch(
        new Request('https://bridge.test/admin/routes'),
        createTestEnv({ accessTeamDomain: 'https://team.cloudflareaccess.com', accessAud: 'aud' }),
      );
      expect(response.status).toBe(401);
    });

    it('refuses a route key that names no route', async () => {
      stubTelegramFetch();
      const app = createBridgeApp();
      const response = await app.fetch(
        new Request('https://bridge.test/admin/routes/nonsense', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: '-1001' }),
        }),
        createTestEnv({ accessTeamDomain: 'https://team.cloudflareaccess.com', accessAud: 'aud' }),
      );
      expect(response.status).toBe(401);
    });
  });
});
