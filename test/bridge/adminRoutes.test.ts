import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessAuthError } from '@rexezuge/http';
import { authenticateAccess } from '@rexezuge/http';
import { createBridgeApp } from '@discord-telegram-bridge/bridge/routes';
import { createTestEnv, FakeKVNamespace, TEST_TELEGRAM_CHAT_ID } from './support';

/**
 * The admin API.
 *
 * Cloudflare Access is replaced with a stub: what is under test is the route
 * table the API manages, not the JWT verifier, which the kit already tests.
 */
vi.mock('@rexezuge/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rexezuge/http')>();
  return { ...actual, authenticateAccess: vi.fn(async (): Promise<string> => 'admin@example.com') };
});

/**
 * The environment that has Access configured.
 */
function accessEnv(routes?: FakeKVNamespace): Env {
  return createTestEnv({
    routes,
    accessTeamDomain: 'https://team.cloudflareaccess.com',
    accessAud: 'audience',
  });
}

describe('the admin API', () => {
  beforeEach(() => {
    vi.mocked(authenticateAccess).mockResolvedValue('admin@example.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(authenticateAccess).mockReset();
  });

  it('lists the routes', async () => {
    const routes = new FakeKVNamespace();
    await routes.put('route:channel:1', JSON.stringify({ chatId: '-1001', enabled: true }));
    const app = createBridgeApp();

    const response = await app.fetch(new Request('https://bridge.test/admin/routes'), accessEnv(routes));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ routes: [{ key: 'channel:1', route: { chatId: '-1001' } }] });
  });

  it('writes a route', async () => {
    const routes = new FakeKVNamespace();
    const app = createBridgeApp();

    const response = await app.fetch(
      new Request('https://bridge.test/admin/routes/channel%3A123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: '-1001', threadId: 7, label: 'alerts' }),
      }),
      accessEnv(routes),
    );

    expect(response.status).toBe(200);
    expect(JSON.parse((await routes.get('route:channel:123')) ?? 'null')).toEqual({
      chatId: '-1001',
      threadId: 7,
      label: 'alerts',
      enabled: true,
    });
  });

  it('writes a route that is switched off', async () => {
    const routes = new FakeKVNamespace();
    const app = createBridgeApp();

    await app.fetch(
      new Request('https://bridge.test/admin/routes/channel%3A123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: '-1001', enabled: false }),
      }),
      accessEnv(routes),
    );

    expect(JSON.parse((await routes.get('route:channel:123')) ?? 'null')).toMatchObject({ enabled: false });
  });

  it('refuses a route with no chat id', async () => {
    const app = createBridgeApp();
    const response = await app.fetch(
      new Request('https://bridge.test/admin/routes/channel%3A123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: 7 }),
      }),
      accessEnv(),
    );
    expect(response.status).toBe(400);
  });

  it('refuses a route whose thread id is not an integer', async () => {
    const app = createBridgeApp();
    const response = await app.fetch(
      new Request('https://bridge.test/admin/routes/channel%3A123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: '-1001', threadId: 'seven' }),
      }),
      accessEnv(),
    );
    expect(response.status).toBe(400);
  });

  it('refuses a route whose enabled flag is not a boolean', async () => {
    const app = createBridgeApp();
    const response = await app.fetch(
      new Request('https://bridge.test/admin/routes/channel%3A123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: '-1001', enabled: 'yes' }),
      }),
      accessEnv(),
    );
    expect(response.status).toBe(400);
  });

  it('refuses a body that is not a route object', async () => {
    const app = createBridgeApp();
    const response = await app.fetch(
      new Request('https://bridge.test/admin/routes/channel%3A123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(['nope']),
      }),
      accessEnv(),
    );
    expect(response.status).toBe(400);
  });

  it('refuses a body that is not JSON', async () => {
    const app = createBridgeApp();
    const response = await app.fetch(
      new Request('https://bridge.test/admin/routes/channel%3A123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
      accessEnv(),
    );
    expect(response.status).toBe(400);
  });

  it('refuses a key that names no route', async () => {
    const app = createBridgeApp();
    const response = await app.fetch(
      new Request('https://bridge.test/admin/routes/nonsense', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: '-1001' }),
      }),
      accessEnv(),
    );
    expect(response.status).toBe(400);
  });

  it('deletes a route', async () => {
    const routes = new FakeKVNamespace();
    await routes.put('route:channel:123', JSON.stringify({ chatId: '-1001', enabled: true }));
    const app = createBridgeApp();

    const response = await app.fetch(
      new Request('https://bridge.test/admin/routes/channel%3A123', { method: 'DELETE' }),
      accessEnv(routes),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ deleted: true });
    expect(await routes.get('route:channel:123')).toBeNull();
  });

  it('answers 401 when Access rejects the caller', async () => {
    vi.mocked(authenticateAccess).mockRejectedValue(new AccessAuthError('nope'));
    const app = createBridgeApp();

    const response = await app.fetch(new Request('https://bridge.test/admin/routes'), accessEnv());

    expect(response.status).toBe(401);
  });

  it('routes a message to the chat the admin API mapped', async () => {
    const calls: { body: unknown }[] = [];
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null });
      return Response.json({ ok: true, result: {} }, { status: 200 });
    });
    const routes = new FakeKVNamespace();
    await routes.put('route:channel:123', JSON.stringify({ chatId: '-100777', enabled: true }));
    const app = createBridgeApp();

    await app.fetch(
      new Request('https://bridge.test/discord/webhooks/123/webhook-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hello' }),
      }),
      createTestEnv({ routes, telegramChatId: TEST_TELEGRAM_CHAT_ID }),
    );

    expect(calls[0]?.body).toMatchObject({ chat_id: '-100777' });
  });
});
