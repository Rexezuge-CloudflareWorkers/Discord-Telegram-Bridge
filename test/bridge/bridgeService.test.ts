import { afterEach, describe, expect, it, vi } from 'vitest';
import { BridgeService } from '@discord-telegram-bridge/bridge/services/BridgeService';
import { DiscordAttachmentClient } from '@discord-telegram-bridge/bridge/clients/DiscordAttachmentClient';
import { RouteStore } from '@discord-telegram-bridge/bridge/clients/RouteStore';
import { TelegramClient } from '@discord-telegram-bridge/bridge/clients/TelegramClient';
import { FakeKVNamespace } from './support';

/**
 * The bridge's orchestration.
 */
describe('BridgeService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Build a service over a route table and a stubbed Telegram API.
   */
  function buildService(
    routes: FakeKVNamespace,
    defaultChatId: string | null = '-1001',
  ): { service: BridgeService; calls: { url: string; body: unknown }[] } {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      calls.push({ url, body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body });
      return Response.json({ ok: true, result: {} }, { status: 200 });
    });
    const telegram = new TelegramClient({ botToken: 'token' });
    const service = new BridgeService({
      telegram,
      routes: new RouteStore(routes as unknown as KVNamespace),
      attachments: new DiscordAttachmentClient(),
      defaultChatId,
    });
    return { service, calls };
  }

  it('sends the message to the default chat when nothing is mapped', async () => {
    const { service, calls } = buildService(new FakeKVNamespace());

    const result = await service.forward({ content: 'hello' }, ['channel:1']);

    expect(result.source).toBe('default');
    expect(calls[0]?.body).toMatchObject({ chat_id: '-1001', text: 'hello' });
  });

  it('sends the message to the mapped chat', async () => {
    const routes = new FakeKVNamespace();
    await routes.put('route:channel:1', JSON.stringify({ chatId: '-1009', enabled: true }));
    const { service, calls } = buildService(routes);

    const result = await service.forward({ content: 'hello' }, ['channel:1']);

    expect(result.source).toBe('mapped');
    expect(calls[0]?.body).toMatchObject({ chat_id: '-1009' });
  });

  it('refuses a message with no destination', async () => {
    const { service } = buildService(new FakeKVNamespace(), null);
    await expect(service.forward({ content: 'hello' }, ['channel:1'])).rejects.toThrow(/No Telegram destination/);
  });

  it('sends one message per embed', async () => {
    const { service, calls } = buildService(new FakeKVNamespace());

    await service.forward({ content: 'hello', embeds: [{ title: 'One' }, { title: 'Two' }] }, ['channel:1']);

    expect(calls).toHaveLength(3);
  });

  it('uploads a file that came with the request', async () => {
    const { service, calls } = buildService(new FakeKVNamespace());
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });

    const result = await service.forward(
      { content: 'look', attachments: [{ id: '1', filename: 'a.png', content_type: 'image/png' }] },
      ['channel:1'],
      [file],
    );

    expect(result.attachments).toBe(1);
    expect(calls[1]?.url).toContain('/sendPhoto');
  });

  it('sends a file that is not an image as a document', async () => {
    const { service, calls } = buildService(new FakeKVNamespace());
    const file = new File([new Uint8Array([1, 2, 3])], 'a.txt', { type: 'text/plain' });

    await service.forward(
      { content: 'look', attachments: [{ id: '1', filename: 'a.txt', content_type: 'text/plain' }] },
      ['channel:1'],
      [file],
    );

    expect(calls[1]?.url).toContain('/sendDocument');
  });

  it('sends a file that is not an image as a document when Telegram refuses the photo', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      urls.push(url);
      if (url.includes('/sendPhoto')) {
        return Response.json({ ok: false, description: 'not a photo' }, { status: 400 });
      }
      return Response.json({ ok: true, result: {} }, { status: 200 });
    });
    const telegram = new TelegramClient({ botToken: 'token' });
    const service = new BridgeService({
      telegram,
      routes: new RouteStore(new FakeKVNamespace() as unknown as KVNamespace),
      attachments: new DiscordAttachmentClient(),
      defaultChatId: '-1001',
    });
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });

    await service.forward(
      { content: 'look', attachments: [{ id: '1', filename: 'a.png', content_type: 'image/png' }] },
      ['channel:1'],
      [file],
    );

    expect(urls.some((url) => url.includes('/sendPhoto'))).toBe(true);
    expect(urls.some((url) => url.includes('/sendDocument'))).toBe(true);
  });

  it('announces a message that is nothing but a file', async () => {
    const { service, calls } = buildService(new FakeKVNamespace());
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });

    await service.forward({ author: 'alex', attachments: [{ id: '1', filename: 'a.png' }] }, ['channel:1'], [file]);

    expect(calls[0]?.body).toMatchObject({ text: '<b>alex</b>' });
  });

  it('skips a file it cannot fetch', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      if (url.includes('cdn.discordapp.com')) {
        return new Response('gone', { status: 404 });
      }
      return Response.json({ ok: true, result: {} }, { status: 200 });
    });
    const telegram = new TelegramClient({ botToken: 'token' });
    const service = new BridgeService({
      telegram,
      routes: new RouteStore(new FakeKVNamespace() as unknown as KVNamespace),
      attachments: new DiscordAttachmentClient(),
      defaultChatId: '-1001',
    });

    const result = await service.forward(
      { content: 'look', attachments: [{ id: '1', filename: 'a.png', url: 'https://cdn.discordapp.com/a.png' }] },
      ['channel:1'],
    );

    expect(result.attachments).toBe(0);
  });
});
